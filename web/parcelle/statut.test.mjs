// Tests de la page de verification : node --test web/parcelle/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  demoFetch, DEMO_STATUSES, describeStatus, loadStatus, normalizeParcelId, NOTICE,
  readCopy, saveCopy, StatusError, validateStatus,
} from './statut.mjs';

const ID = 'PRC-2026-000014';
const sample = () => ({ ...DEMO_STATUSES[ID] });

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

function respond(status, body) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

test('normalise un identifiant et retire les espaces', () => {
  assert.equal(normalizeParcelId('  PRC-2026-000014 '), ID);
});

for (const bad of ['', '   ', '../admin', 'PRC 2026', 'PRC/1', '-PRC', 'x'.repeat(81), null, 42]) {
  test(`refuse l identifiant ${JSON.stringify(bad)}`, () => {
    assert.throws(() => normalizeParcelId(bad), (err) => err instanceof StatusError && err.code === 'INVALID_ID');
  });
}

test('accepte un statut conforme au contrat', () => {
  assert.deepEqual(validateStatus(sample(), ID), sample());
});

test('accepte un statut sans champs facultatifs', () => {
  const { areaM2, perimeterM, surveyedAt, ...minimal } = sample();
  assert.deepEqual(validateStatus(minimal, ID), minimal);
});

const corruptions = {
  'un autre identifiant': { parcelId: 'PRC-AUTRE' },
  'un statut juridique inconnu': { legalStatus: 'INCONNU' },
  'un booleen en texte': { certified: 'true' },
  'une version nulle': { version: 0 },
  'une surface negative': { areaM2: -1 },
  'une date invalide': { checkedAt: 'hier' },
  'une mention modifiee': { notice: 'Vaut titre foncier' },
  'un champ personnel en trop': { authorId: 'usr_geo_01' },
};
for (const [label, patch] of Object.entries(corruptions)) {
  test(`refuse une reponse avec ${label}`, () => {
    assert.throws(() => validateStatus({ ...sample(), ...patch }, ID),
      (err) => err instanceof StatusError && err.code === 'BAD_RESPONSE');
  });
}

test('decrit une parcelle certifiee sans alerte, avec la mention obligatoire', () => {
  const view = describeStatus(sample());
  assert.equal(view.legal.label, 'Coutumier, non titré');
  assert.deepEqual(view.alerts, []);
  assert.deepEqual(view.badges.map((b) => b.tone), ['ok', 'ok', 'ok']);
  assert.equal(view.notice, NOTICE);
  assert.equal(view.facts.find((f) => f.label === 'Surface').value.replace(/\s/g, ' '), '1 240,37 m2');
});

test('alerte sur une parcelle en litige et non certifiee', () => {
  const view = describeStatus(DEMO_STATUSES['PRC-2026-000009']);
  assert.equal(view.legal.tone, 'danger');
  assert.equal(view.alerts.length, 2);
  assert.match(view.alerts[0], /en litige/);
  assert.match(view.alerts[1], /pas certifié/);
});

test('alerte sur un conflit signale hors litige', () => {
  const view = describeStatus({ ...sample(), inConflict: true });
  assert.match(view.alerts[0], /conflit est signalé/);
});

test('n emploie jamais certificat, titre de propriete ni QR code', () => {
  const texts = [describeStatus(sample()), describeStatus(DEMO_STATUSES['PRC-2026-000009'])]
    .map((v) => JSON.stringify(v)).join(' ');
  assert.doesNotMatch(texts, /certificat|QR/i);
});

test('charge le statut du serveur et en garde une copie locale', async () => {
  const storage = memoryStorage();
  let called;
  const result = await loadStatus({
    id: ID, storage, apiBase: 'https://exemple.test',
    fetchImpl: async (url, options) => { called = { url, options }; return respond(200, sample())(); },
    now: () => new Date('2026-10-24T13:00:00Z'),
  });
  assert.equal(called.url, 'https://exemple.test/parcels/PRC-2026-000014/status');
  assert.equal(called.options.headers.Accept, 'application/json');
  assert.equal(result.source, 'serveur');
  assert.deepEqual(readCopy(storage, ID), { savedAt: '2026-10-24T13:00:00.000Z', status: sample() });
});

test('encode l identifiant dans l adresse', async () => {
  let url;
  await assert.rejects(loadStatus({ id: 'A-1', fetchImpl: async (u) => { url = u; return respond(404, {})(); } }));
  assert.equal(url, '/parcels/A-1/status');
});

test('utilise la copie locale si le serveur est injoignable', async () => {
  const storage = memoryStorage();
  saveCopy(storage, sample(), '2026-10-23T10:00:00.000Z');
  const result = await loadStatus({ id: ID, storage, fetchImpl: async () => { throw new TypeError('reseau'); } });
  assert.deepEqual(result, { status: sample(), source: 'copie', savedAt: '2026-10-23T10:00:00.000Z' });
});

test('utilise la copie locale si le serveur repond 503', async () => {
  const storage = memoryStorage();
  saveCopy(storage, sample(), '2026-10-23T10:00:00.000Z');
  const result = await loadStatus({ id: ID, storage, fetchImpl: respond(503, {}) });
  assert.equal(result.source, 'copie');
});

test('signale l absence de reseau sans copie', async () => {
  await assert.rejects(
    loadStatus({ id: ID, storage: memoryStorage(), fetchImpl: async () => { throw new TypeError('reseau'); } }),
    (err) => err.code === 'OFFLINE');
});

test('ne se replie jamais sur la copie pour une parcelle inconnue (404)', async () => {
  const storage = memoryStorage();
  saveCopy(storage, sample(), '2026-10-23T10:00:00.000Z');
  await assert.rejects(loadStatus({ id: ID, storage, fetchImpl: respond(404, {}) }), (err) => err.code === 'NOT_FOUND');
});

test('refuse une reponse non conforme sans l enregistrer', async () => {
  const storage = memoryStorage();
  await assert.rejects(
    loadStatus({ id: ID, storage, fetchImpl: respond(200, { ...sample(), notice: 'autre' }) }),
    (err) => err.code === 'BAD_RESPONSE');
  assert.equal(storage.data.size, 0);
});

test('ignore une copie locale corrompue ou falsifiee', () => {
  const storage = memoryStorage();
  storage.setItem(`geosmart.parcelle.statut.${ID}`, '{pas du json');
  assert.equal(readCopy(storage, ID), null);
  storage.setItem(`geosmart.parcelle.statut.${ID}`, JSON.stringify({ savedAt: '2026-10-23T10:00:00Z',
    status: { ...sample(), notice: 'Vaut titre foncier' } }));
  assert.equal(readCopy(storage, ID), null);
});

test('fonctionne sans stockage local (navigation privee)', async () => {
  const throwing = { getItem() { throw new Error('bloque'); }, setItem() { throw new Error('bloque'); } };
  const result = await loadStatus({ id: ID, storage: throwing, fetchImpl: respond(200, sample()) });
  assert.equal(result.source, 'serveur');
  await assert.rejects(loadStatus({ id: ID, storage: undefined, fetchImpl: async () => { throw new TypeError(); } }),
    (err) => err.code === 'OFFLINE');
});

test('le mode demonstration repond selon le contrat', async () => {
  const known = await loadStatus({ id: ID, fetchImpl: demoFetch(ID) });
  assert.equal(known.status.parcelId, ID);
  await assert.rejects(loadStatus({ id: 'PRC-INCONNUE', fetchImpl: demoFetch('PRC-INCONNUE') }),
    (err) => err.code === 'NOT_FOUND');
});

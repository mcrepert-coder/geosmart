// Logique de la page publique de verification d'une parcelle (EF-206).
// Sans acces au DOM : testable avec node --test, utilisee par page.mjs.

export const NOTICE = 'Ne vaut pas titre foncier';
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/;
const LEGAL_STATUSES = {
  TITRE: { label: 'Titré', tone: 'ok' },
  COUTUMIER_NON_TITRE: { label: 'Coutumier, non titré', tone: 'info' },
  EN_LITIGE: { label: 'En litige', tone: 'danger' },
};
const STATUS_FIELDS = ['parcelId', 'legalStatus', 'certified', 'hasAttestation', 'inConflict',
  'version', 'areaM2', 'perimeterM', 'surveyedAt', 'checkedAt', 'notice'];
const CACHE_PREFIX = 'geosmart.parcelle.statut.';

export class StatusError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StatusError';
    this.code = code;
  }
}

// Identifiant saisi : espaces retires, majuscules conservees, format borne.
export function normalizeParcelId(input) {
  const id = typeof input === 'string' ? input.trim() : '';
  if (!ID_PATTERN.test(id)) {
    throw new StatusError('INVALID_ID', "Identifiant invalide : lettres, chiffres et tirets, par exemple PRC-2026-000014.");
  }
  return id;
}

function isDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

// La reponse est verifiee champ par champ selon ParcelStatus (contracts/land.yaml),
// liste blanche comprise : un champ inattendu fait refuser la reponse.
export function validateStatus(payload, expectedId) {
  const fail = () => { throw new StatusError('BAD_RESPONSE', 'Réponse du serveur inattendue.'); };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail();
  if (Object.keys(payload).some((key) => !STATUS_FIELDS.includes(key))) fail();
  const p = payload;
  if (p.parcelId !== expectedId || !(p.legalStatus in LEGAL_STATUSES)) fail();
  for (const key of ['certified', 'hasAttestation', 'inConflict']) if (typeof p[key] !== 'boolean') fail();
  if (!Number.isInteger(p.version) || p.version < 1) fail();
  for (const key of ['areaM2', 'perimeterM']) {
    if (p[key] !== undefined && (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] <= 0)) fail();
  }
  if (p.surveyedAt !== undefined && !isDate(p.surveyedAt)) fail();
  if (!isDate(p.checkedAt) || p.notice !== NOTICE) fail();
  return { ...p };
}

const numberFr = (value, digits) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

const dateFr = (value) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Lome' })
    .format(new Date(value));

// Modele d'affichage : textes et tons seulement, aucune balise HTML.
export function describeStatus(status) {
  const legal = LEGAL_STATUSES[status.legalStatus];
  const alerts = [];
  if (status.legalStatus === 'EN_LITIGE') {
    alerts.push('Cette parcelle est déclarée en litige. Ne concluez aucun achat avant que le litige soit réglé.');
  } else if (status.inConflict) {
    alerts.push('Un conflit est signalé sur cette parcelle. Renseignez-vous avant tout achat.');
  }
  if (!status.certified) {
    alerts.push("Le levé n'est pas certifié : géomètre non inscrit à l'Ordre ou bornes hors RTK Fixed.");
  }
  return {
    parcelId: status.parcelId,
    legal: { label: legal.label, tone: legal.tone },
    badges: [
      status.certified
        ? { label: 'Levé certifié', tone: 'ok' }
        : { label: 'Levé non certifié', tone: 'warn' },
      status.hasAttestation
        ? { label: 'Attestation de levé émise', tone: 'ok' }
        : { label: "Pas d'attestation de levé", tone: 'neutral' },
      status.inConflict
        ? { label: 'Conflit signalé', tone: 'danger' }
        : { label: 'Aucun conflit signalé', tone: 'ok' },
    ],
    facts: [
      { label: 'Version de la parcelle', value: String(status.version) },
      { label: 'Surface', value: status.areaM2 !== undefined ? `${numberFr(status.areaM2, 2)} m2` : 'non renseignée' },
      { label: 'Périmètre', value: status.perimeterM !== undefined ? `${numberFr(status.perimeterM, 2)} m` : 'non renseigné' },
      { label: 'Date du levé', value: status.surveyedAt ? dateFr(status.surveyedAt) : 'non renseignée' },
      { label: 'Statut vérifié le', value: dateFr(status.checkedAt) },
    ],
    alerts,
    notice: NOTICE,
  };
}

// Copie locale du dernier statut consulte, pour le mode hors ligne.
// storage peut manquer ou lever une exception (navigation privee) : la page fonctionne sans.
export function saveCopy(storage, status, savedAt) {
  try {
    storage?.setItem(CACHE_PREFIX + status.parcelId, JSON.stringify({ savedAt, status }));
  } catch { /* copie facultative */ }
}

export function readCopy(storage, id) {
  try {
    const raw = storage?.getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    const { savedAt, status } = JSON.parse(raw);
    if (!isDate(savedAt)) return null;
    return { savedAt, status: validateStatus(status, id) };
  } catch {
    return null;
  }
}

// Interroge l'API ; en cas de panne reseau, se replie sur la copie locale.
// Un 404 n'utilise jamais la copie : le serveur a repondu que la parcelle est inconnue.
export async function loadStatus({ id, fetchImpl, apiBase = '', storage, now = () => new Date() }) {
  let response;
  try {
    response = await fetchImpl(`${apiBase}/parcels/${encodeURIComponent(id)}/status`,
      { headers: { Accept: 'application/json' } });
  } catch {
    const copy = readCopy(storage, id);
    if (copy) return { status: copy.status, source: 'copie', savedAt: copy.savedAt };
    throw new StatusError('OFFLINE', 'Serveur injoignable et aucune copie locale pour cette parcelle.');
  }
  if (response.status === 404) {
    throw new StatusError('NOT_FOUND', 'Aucune parcelle connue avec cet identifiant.');
  }
  if (!response.ok) {
    const copy = readCopy(storage, id);
    if (copy) return { status: copy.status, source: 'copie', savedAt: copy.savedAt };
    throw new StatusError('SERVER', `Le serveur a répondu par une erreur (${response.status}). Réessayez plus tard.`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new StatusError('BAD_RESPONSE', 'Réponse du serveur inattendue.');
  }
  const status = validateStatus(body, id);
  const savedAt = now().toISOString();
  saveCopy(storage, status, savedAt);
  return { status, source: 'serveur', savedAt };
}

// Exemple du contrat, pour la demonstration sans API (?demo dans l'adresse).
export const DEMO_STATUSES = {
  'PRC-2026-000014': {
    parcelId: 'PRC-2026-000014', legalStatus: 'COUTUMIER_NON_TITRE', certified: true,
    hasAttestation: true, inConflict: false, version: 1, areaM2: 1240.37, perimeterM: 141.22,
    surveyedAt: '2026-10-24T08:23:00Z', checkedAt: '2026-10-24T12:00:00Z', notice: NOTICE,
  },
  'PRC-2026-000009': {
    parcelId: 'PRC-2026-000009', legalStatus: 'EN_LITIGE', certified: false,
    hasAttestation: false, inConflict: true, version: 3, areaM2: 812.5, perimeterM: 118.4,
    surveyedAt: '2026-10-20T09:10:00Z', checkedAt: '2026-10-24T12:00:00Z', notice: NOTICE,
  },
};

export function demoFetch(id) {
  return async () => {
    const status = DEMO_STATUSES[id];
    return status
      ? { ok: true, status: 200, json: async () => ({ ...status, checkedAt: new Date().toISOString() }) }
      : { ok: false, status: 404, json: async () => ({ code: 'NOT_FOUND', message: 'Parcelle introuvable' }) };
  };
}

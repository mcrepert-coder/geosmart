// Recette serveur de bout en bout : CA-2, CA-3, CA-4, CA-7.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const API = process.env.API ?? 'http://localhost:3011';
// Administrateur cree par bootstrap-admin (voir README.md).
const ADMIN = { phone: process.env.RECETTE_ADMIN_PHONE, password: process.env.RECETTE_ADMIN_PASSWORD };
if (!ADMIN.phone || !ADMIN.password) throw new Error('RECETTE_ADMIN_PHONE et RECETTE_ADMIN_PASSWORD sont obligatoires.');
// Journal de l'API : les codes SMS y sont ecrits tant qu'il n'y a pas de fournisseur (EF-401).
const API_LOG = process.env.RECETTE_API_LOG ?? 'api.log';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail ? ' : ' + detail : ''}`);
};

async function call(method, path, { token, body, headers = {}, form } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = form;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

function smsCode(phone) {
  const log = readFileSync(API_LOG, 'utf8');
  return [...log.matchAll(/SMS pour (\+?\d+) : .*?(\d{6})/g)].filter((m) => m[1] === phone).at(-1)[2];
}

async function login(phone, password) {
  const r = await call('POST', '/auth/login', { body: { phone, password } });
  if (r.status !== 200) throw new Error(`login ${phone} : ${r.status}`);
  return r.body.accessToken;
}

async function account(admin, role, docs, extra = {}) {
  const phone = `+22895${Math.floor(100000 + Math.random() * 899999)}`;
  const password = randomUUID();
  const reg = await call('POST', '/auth/registrations', { body: { phone, password } });
  if (reg.status !== 201) throw new Error(`inscription ${role} : ${reg.status} ${JSON.stringify(reg.body)}`);
  await call('POST', '/auth/phone-verifications', { body: { phone: reg.body.phone, code: smsCode(reg.body.phone) } });
  await call('PUT', `/admin/accounts/${reg.body.id}/role`, { token: admin, body: { role, fullName: `Recette ${role}`, ...extra } });
  const token = await login(phone, password);
  for (const category of docs) {
    const form = new FormData();
    form.append('category', category);
    form.append('file', new Blob([Buffer.from('%PDF-1.4\n')], { type: 'application/pdf' }), 'p.pdf');
    await call('POST', '/accounts/me/documents', { token, form });
  }
  const v = await call('POST', `/admin/accounts/${reg.body.id}/validate`, { token: admin });
  if (![200, 201].includes(v.status)) throw new Error(`validation ${role} : ${v.status} ${JSON.stringify(v.body)}`);
  return { id: reg.body.id, token };
}

const square = (lat, lon, d) => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});
const boundaries = (geometry) =>
  geometry.coordinates[0].slice(0, -1).map((_, i) => ({
    pointNumber: i + 1, surveyPointId: randomUUID(), name: `B${i + 1}`, fixQuality: 'FIXED',
    pdop: 1.2, satellitesCount: 18, instrument: 'UM982', recordedAt: new Date().toISOString(),
  }));
const createParcel = (token, geometry) =>
  call('POST', '/parcels', {
    token,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { surveySessionId: randomUUID(), commune: 'GO1', geometry, boundaries: boundaries(geometry) },
  });

function mission(projectId) {
  const point = (n) => ({
    clientId: randomUUID(), pointNumber: n, pointName: `B${n}`,
    latitude: 6.13 + n * 0.0001, longitude: 1.21 + (n % 2) * 0.0001, altitude: 24.3, accuracy: 0.012,
    fixQuality: 'FIXED', satellitesCount: 18, pdop: 1.2, hdop: null, vdop: null,
    instrument: 'UM982', recordedAt: new Date().toISOString(), isValidated: true,
  });
  return {
    clientId: randomUUID(), entityType: 'survey_session', action: 'CREATE',
    payload: {
      projectId, surveyorId: 'telephone', title: 'Recette CA-3', status: 'COMPLETED',
      perimeterMeters: 60, areaSquareMeters: 200, createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(), points: [point(1), point(2), point(3)],
    },
  };
}

async function main() {
  const admin = await login(ADMIN.phone, ADMIN.password);
  const geometre = await account(admin, 'GEOMETRE', ['IDENTITY', 'ORDER_REGISTRATION'], { ordreNumber: `OT-R-${Date.now() % 100000}` });
  const agent = await account(admin, 'AGENT', ['IDENTITY', 'RCCM']);
  const topo1 = await account(admin, 'TOPOGRAPHE', ['IDENTITY']);
  const topo2 = await account(admin, 'TOPOGRAPHE', ['IDENTITY']);
  check('comptes geometre, agent et deux topographes valides', true);

  // ---- CA-2
  const lat = 6.16 + Math.random() * 0.04;
  const lon = 1.24 + Math.random() * 0.04;
  const d = 0.0003;
  const p1 = await createParcel(geometre.token, square(lat, lon, d));
  check('CA-2 : premiere parcelle creee', p1.status === 201, `${p1.status} ${p1.body?.id ?? JSON.stringify(p1.body)}`);
  const alertsBefore = (await call('GET', '/overlap-alerts?state=open&limit=200', { token: admin })).body?.length ?? 0;
  const overlap = await createParcel(geometre.token, square(lat + d / 2, lon + d / 2, d));
  check('CA-2 : parcelle qui en recouvre une autre refusee (409)', overlap.status === 409, `${overlap.status} ${overlap.body?.code ?? ''}`);
  const alertsAfter = (await call('GET', '/overlap-alerts?state=open&limit=200', { token: admin })).body?.length ?? 0;
  check('CA-2 : alerte journalisee', alertsAfter === alertsBefore + 1, `${alertsBefore} -> ${alertsAfter}`);
  const neighbour = await createParcel(geometre.token, square(lat, lon + d, d));
  check('CA-2 : voisine qui partage une limite acceptee', neighbour.status === 201, `${neighbour.status} ${neighbour.body?.code ?? ''}`);

  // ---- CA-4
  const g = square(lat, lon, d * 1.1);
  const byAgent = await call('PATCH', `/parcels/${p1.body.id}`, {
    token: agent.token,
    body: { expectedVersion: 1, geometry: g, boundaries: boundaries(g), reason: 'essai agent' },
  });
  check('CA-4 : un agent qui modifie une limite est refuse', byAgent.status === 403, String(byAgent.status));
  const after = await call('GET', `/parcels/${p1.body.id}`, { token: geometre.token });
  check('CA-4 : la limite est inchangee (version 1)', after.body?.version === 1, `version ${after.body?.version}`);

  // ---- CA-7 et CA-3
  const project = await call('POST', '/projects', { token: geometre.token, body: { title: 'Recette CA-7' } });
  check('CA-7 : le geometre cree un chantier', project.status === 201, String(project.status));
  const pid = project.body.id;
  await call('PUT', `/projects/${pid}/topographers/${topo1.id}`, { token: geometre.token });
  const m = mission(pid);
  const sent = await call('POST', '/sync', { token: topo1.token, body: m });
  check('CA-7 : le topographe assigne envoie sa mission', sent.status === 200 && sent.body?.result === 'ACCEPTED', `${sent.status} ${sent.body?.result ?? JSON.stringify(sent.body)}`);
  const resent = await call('POST', '/sync', { token: topo1.token, body: m });
  check('CA-3 : renvoi apres coupure sans doublon', resent.body?.result === 'DUPLICATE' && resent.body?.id === sent.body?.id, resent.body?.result);
  const followed = await call('GET', `/projects/${pid}`, { token: geometre.token });
  check('CA-3 : une seule mission recue sur le chantier', followed.body?.missionsCount === 1, String(followed.body?.missionsCount));
  const other = await call('POST', '/sync', { token: topo2.token, body: mission(pid) });
  check('CA-7 : un topographe non assigne est refuse (403)', other.status === 403, String(other.status));
  await call('POST', `/projects/${pid}/close`, { token: geometre.token });
  const closed = await call('POST', '/sync', { token: topo1.token, body: mission(pid) });
  check('CA-7 : un chantier clos refuse les envois (403)', closed.status === 403, String(closed.status));
  const journal = (await call('GET', '/audit?limit=50', { token: admin })).body ?? [];
  check('journal : refus de synchronisation trace (SYNC_ITEM DENIED)',
    journal.some((e) => e.action === 'SYNC_ITEM' && e.result === 'DENIED'));
  const chain = await call('GET', '/audit/verify', { token: admin });
  check('journal : chaine d empreintes intacte', chain.body?.valid === true, JSON.stringify(chain.body));

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verifications reussies`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => { console.error('ERREUR', e.message); process.exit(2); });

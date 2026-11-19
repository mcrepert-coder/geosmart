// Recette de bout en bout CA-5 et CA-6, et parcours agent du site (A2).
// API : http://localhost:3011 ; site : http://localhost:3020.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const API = process.env.API ?? 'http://localhost:3011';
const WEB = process.env.WEB ?? 'http://localhost:3020';
// Administrateur cree par bootstrap-admin (voir README.md).
const ADMIN = { phone: process.env.RECETTE_ADMIN_PHONE, password: process.env.RECETTE_ADMIN_PASSWORD };
if (!ADMIN.phone || !ADMIN.password) throw new Error('RECETTE_ADMIN_PHONE et RECETTE_ADMIN_PASSWORD sont obligatoires.');
// Journal de l'API : les codes SMS y sont ecrits tant qu'il n'y a pas de fournisseur (EF-401).
const API_LOG = process.env.RECETTE_API_LOG ?? 'api.log';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail ? ' : ' + detail : ''}`);
}

async function call(method, url, { token, body, cookie, form } = {}) {
  const headers = {};
  if (url.startsWith(WEB)) headers.Origin = WEB;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (body?.__idem) {
    headers['Idempotency-Key'] = body.__idem;
    delete body.__idem;
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

function smsCode(phone) {
  const log = readFileSync(API_LOG, 'utf8');
  const matches = [...log.matchAll(/SMS pour (\+?\d+) : .*?(\d{6})/g)]
    .filter((m) => m[1] === phone);
  if (!matches.length) throw new Error(`pas de code SMS pour ${phone}`);
  return matches.at(-1)[2];
}

const pdf = () => new Blob([Buffer.from('%PDF-1.4\n%recette\n')], { type: 'application/pdf' });
const png = () =>
  new Blob(
    [Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
      '53de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082', 'hex')],
    { type: 'image/png' },
  );

async function login(phone, password) {
  const r = await call('POST', `${API}/auth/login`, { body: { phone, password } });
  if (r.status !== 200) throw new Error(`login ${phone} : ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

async function account(adminToken, role, docs, extra = {}) {
  const phone = `+22893${Math.floor(100000 + Math.random() * 899999)}`;
  const password = randomUUID();
  const reg = await call('POST', `${API}/auth/registrations`, { body: { phone, password } });
  if (reg.status !== 201) throw new Error(`inscription ${role} : ${reg.status} ${JSON.stringify(reg.body)}`);
  const ver = await call('POST', `${API}/auth/phone-verifications`, {
    body: { phone: reg.body.phone, code: smsCode(reg.body.phone) },
  });
  if (ver.status !== 200) throw new Error(`verification ${role} : ${ver.status}`);
  const roleRes = await call('PUT', `${API}/admin/accounts/${reg.body.id}/role`, {
    token: adminToken,
    body: { role, fullName: `Recette ${role}`, ...extra },
  });
  if (roleRes.status !== 200) throw new Error(`role ${role} : ${roleRes.status} ${JSON.stringify(roleRes.body)}`);
  const token = await login(phone, password);
  for (const category of docs) {
    const form = new FormData();
    form.append('category', category);
    form.append('file', pdf(), 'piece.pdf');
    const up = await call('POST', `${API}/accounts/me/documents`, { token, form });
    if (up.status !== 201) throw new Error(`piece ${category} : ${up.status} ${JSON.stringify(up.body)}`);
  }
  const val = await call('POST', `${API}/admin/accounts/${reg.body.id}/validate`, { token: adminToken });
  if (val.status !== 200 && val.status !== 201) throw new Error(`validation ${role} : ${val.status} ${JSON.stringify(val.body)}`);
  return { id: reg.body.id, phone, password, token };
}

function square(lat, lon, d = 0.0002) {
  const ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];
  return { type: 'Polygon', coordinates: [ring] };
}

async function main() {
  const adminToken = await login(ADMIN.phone, ADMIN.password);
  check('connexion administrateur', !!adminToken);

  const geometre = await account(adminToken, 'GEOMETRE', ['IDENTITY', 'ORDER_REGISTRATION'], {
    ordreNumber: `OT-E2E-${Math.floor(Math.random() * 9999)}`,
  });
  const agent = await account(adminToken, 'AGENT', ['IDENTITY', 'PROFESSIONAL_CARD']);
  const client = await account(adminToken, 'CLIENT', ['IDENTITY']);
  check('comptes geometre, agent et client valides par l administration', true);

  const me = await call('GET', `${API}/auth/me`, { token: agent.token });
  check('agent : /auth/me annonce agentCertified', me.body?.agentCertified === true, JSON.stringify(me.body?.agentCertified));

  const lat = 6.2 + Math.random() * 0.05;
  const lon = 1.15 + Math.random() * 0.05;
  const geometry = square(lat, lon);
  const boundaries = geometry.coordinates[0].slice(0, 4).map((_, i) => ({
    pointNumber: i + 1,
    surveyPointId: randomUUID(),
    name: `B${i + 1}`,
    fixQuality: 'FIXED',
    pdop: 1.2,
    satellitesCount: 18,
    instrument: 'UM982',
    recordedAt: new Date().toISOString(),
  }));
  const parcel = await call('POST', `${API}/parcels`, {
    token: geometre.token,
    body: { __idem: randomUUID(), surveySessionId: randomUUID(), commune: 'AG3', geometry, boundaries },
  });
  check('geometre inscrit : parcelle creee et certifiee', parcel.status === 201 && parcel.body?.certified === true,
    `${parcel.status} certified=${parcel.body?.certified}`);
  const parcelId = parcel.body?.id;

  const listing = {
    parcelId, type: 'TERRAIN', transaction: 'VENTE', title: 'Terrain de recette',
    description: 'Recette CA-6', price: 12500000, currency: 'XOF', zone: 'Agoe', status: 'PUBLIE',
  };

  // CA-5 : un client qui publie un bien est refuse.
  const byClient = await call('POST', `${API}/properties`, { token: client.token, body: listing });
  check('CA-5 : un client qui publie est refuse (403)', byClient.status === 403, String(byClient.status));

  // A2 : parcours agent par le site (cookies httpOnly, relais).
  const webLogin = await call('POST', `${WEB}/api/agent/login`, { body: { phone: agent.phone, password: agent.password } });
  const cookie = (webLogin.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0]).join('; ');
  check('site : connexion de l agent', webLogin.status === 200 && cookie.includes('gs_agent_access'), String(webLogin.status));

  const clientWeb = await call('POST', `${WEB}/api/agent/login`, { body: { phone: client.phone, password: client.password } });
  check('site : un client ne peut pas entrer dans l espace agent', clientWeb.status === 403, String(clientWeb.status));

  const created = await call('POST', `${WEB}/api/agent/properties`, { cookie, body: listing });
  check('CA-6 : l agent publie un bien rattache a la parcelle certifiee', created.status === 201, `${created.status} ${created.status !== 201 ? JSON.stringify(created.body) : ''}`);
  const id = created.body?.id;
  check('CA-6 : badges parcelle certifiee et agent certifie', created.body?.badges?.parcelCertified === true && created.body?.badges?.agentCertified === true,
    JSON.stringify(created.body?.badges));

  const form = new FormData();
  form.append('file', png(), 'photo.png');
  const photo = await call('POST', `${WEB}/api/agent/properties/${id}/photos`, { cookie, form });
  check('site : photo ajoutee par le relais', photo.status === 201, `${photo.status} ${photo.status !== 201 ? JSON.stringify(photo.body) : ''}`);

  const mine = await call('GET', `${WEB}/api/agent/properties/mine?pageSize=100`, { cookie });
  check('site : "mes biens" liste l annonce', mine.status === 200 && mine.body?.items?.some((i) => i.id === id), String(mine.status));

  const search = await call('GET', `${API}/properties?agentCertified=true&parcelCertified=true&pageSize=100`);
  const found = search.body?.items?.find((i) => i.id === id);
  check('CA-6 : bien trouve par la recherche avec les deux badges', !!found);
  check('CA-6 : bien sur la carte (point indicatif)',
    typeof found?.parcel?.approximateLocation?.latitude === 'number', JSON.stringify(found?.parcel?.approximateLocation));

  const share = await call('GET', `${API}/properties/${id}/share`);
  check('CA-6 : lien de partage public et WhatsApp', share.status === 200 && share.body?.whatsapp?.url?.startsWith('https://wa.me/'),
    share.body?.publicUrl);
  if (share.body?.publicUrl) {
    const page = await fetch(share.body.publicUrl);
    check('CA-6 : la page publique de l annonce s ouvre', page.status === 200, `${page.status} ${share.body.publicUrl}`);
  }

  // Revocation : agent suspendu, badge retire.
  const suspend = await call('POST', `${API}/admin/accounts/${agent.id}/suspend`, { token: adminToken });
  const after = await call('GET', `${API}/properties/${id}`);
  check('suspension de l agent : badge agent certifie retire', [200, 201].includes(suspend.status) && after.body?.badges?.agentCertified === false,
    `${suspend.status} ${JSON.stringify(after.body?.badges)}`);
  const blocked = await call('PATCH', `${WEB}/api/agent/properties/${id}`, { cookie, body: { title: 'Modifie' } });
  check('agent suspendu : modification refusee', blocked.status === 403, String(blocked.status));

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} verifications reussies`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('ERREUR', error.message);
  process.exit(2);
});

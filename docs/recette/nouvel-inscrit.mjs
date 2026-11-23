// Parcours d'un nouvel inscrit (EF-401, EF-403, EF-404) : connexion en attente,
// depot des pieces par le site, validation par l'administration.
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
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail ? ' : ' + detail : ''}`);
};

async function call(method, url, { token, body, cookie, form } = {}) {
  const headers = {};
  if (url.startsWith(WEB)) headers.Origin = WEB;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  let payload = form;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
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
  const m = [...log.matchAll(/SMS pour (\+?\d+) : .*?(\d{6})/g)].filter((x) => x[1] === phone);
  return m.at(-1)[2];
}

async function main() {
  const admin = (await call('POST', `${API}/auth/login`, { body: ADMIN })).body.accessToken;

  const phone = `+22894${Math.floor(100000 + Math.random() * 899999)}`;
  const password = randomUUID();
  const reg = await call('POST', `${API}/auth/registrations`, { body: { phone, password } });
  await call('POST', `${API}/auth/phone-verifications`, { body: { phone: reg.body.phone, code: smsCode(reg.body.phone) } });
  check('inscription et telephone verifie', reg.status === 201);

  await call('PUT', `${API}/admin/accounts/${reg.body.id}/role`, { token: admin, body: { role: 'AGENT', fullName: 'Nouvel Agent' } });
  const refused = await call('POST', `${API}/admin/accounts/${reg.body.id}/validate`, { token: admin });
  check('validation refusee tant que les pieces manquent', refused.status === 400, refused.body?.message);

  const login = await call('POST', `${WEB}/api/compte/login`, { body: { phone, password } });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  check('connexion en attente sur le site (Mon compte)', login.status === 200 && login.body?.actor?.accountActive === false,
    `${login.status} active=${login.body?.actor?.accountActive}`);

  const publish = await call('POST', `${API}/properties`, {
    token: (await call('POST', `${API}/auth/login`, { body: { phone, password } })).body.accessToken,
    body: { parcelId: 'TG-AG3-00001', type: 'TERRAIN', transaction: 'VENTE', title: 'x', price: 1, status: 'PUBLIE' },
  });
  check('compte en attente : aucune ecriture (publication refusee)', publish.status === 403, String(publish.status));

  for (const [category, name] of [['IDENTITY', 'cni.pdf'], ['PROFESSIONAL_CARD', 'carte.pdf']]) {
    const form = new FormData();
    form.append('category', category);
    form.append('file', new Blob([Buffer.from('%PDF-1.4\n%piece\n')], { type: 'application/pdf' }), name);
    const up = await call('POST', `${WEB}/api/compte/documents`, { cookie, form });
    check(`depot de la piece ${category} par le site`, up.status === 201, `${up.status} ${up.status !== 201 ? JSON.stringify(up.body) : ''}`);
  }
  const list = await call('GET', `${WEB}/api/compte/documents`, { cookie });
  check('Mon compte liste les deux pieces', list.status === 200 && list.body?.length === 2, String(list.body?.length));

  const validated = await call('POST', `${API}/admin/accounts/${reg.body.id}/validate`, { token: admin });
  check('validation par l administration une fois les pieces deposees', [200, 201].includes(validated.status), String(validated.status));

  const session = await call('GET', `${WEB}/api/compte/session`, { cookie });
  check('le compte est actif et agent certifie', session.body?.actor?.accountActive === true && session.body?.actor?.agentCertified === true,
    JSON.stringify(session.body?.actor));

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verifications reussies`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => { console.error('ERREUR', e.message); process.exit(2); });

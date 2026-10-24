// Liaison DOM de la page de verification. Tout texte passe par textContent :
// aucune donnee du serveur n'est injectee comme HTML.
import { demoFetch, describeStatus, loadStatus, normalizeParcelId, StatusError } from './statut.mjs';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
// L'API est servie par le meme serveur (cahier des charges, section 6).
const apiBase = document.documentElement.dataset.apiBase ?? '';

const form = document.getElementById('recherche');
const input = document.getElementById('identifiant');
const result = document.getElementById('resultat');
const message = document.getElementById('message');

let storage = null;
try { storage = window.localStorage; } catch { storage = null; }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showMessage(text, tone) {
  message.textContent = text;
  message.dataset.tone = tone;
  message.hidden = false;
}

function render({ status, source, savedAt }) {
  const view = describeStatus(status);
  result.replaceChildren();

  const head = el('div', 'fiche-tete');
  head.append(el('p', 'surtitre', 'Parcelle'), el('h2', 'fiche-id', view.parcelId));
  const legal = el('p', 'statut');
  legal.append(el('span', 'statut-libelle', 'Statut juridique'),
    el('strong', `ton-${view.legal.tone}`, view.legal.label));
  head.append(legal);
  result.append(head);

  for (const text of view.alerts) result.append(el('p', 'alerte', text));

  const badges = el('ul', 'badges');
  for (const badge of view.badges) badges.append(el('li', `badge ton-${badge.tone}`, badge.label));
  result.append(badges);

  const facts = el('dl', 'faits');
  for (const fact of view.facts) {
    const row = el('div', 'fait');
    row.append(el('dt', '', fact.label), el('dd', '', fact.value));
    facts.append(row);
  }
  result.append(facts);

  if (source === 'copie') {
    const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(savedAt));
    result.append(el('p', 'copie', `Serveur injoignable : copie locale enregistrée le ${date}. Le statut a pu changer depuis.`));
  }
  result.append(el('p', 'mention', view.notice));
  result.hidden = false;
}

async function check(rawId) {
  message.hidden = true;
  let id;
  try {
    id = normalizeParcelId(rawId);
  } catch (err) {
    result.hidden = true;
    showMessage(err.message, 'erreur');
    input.focus();
    return;
  }
  form.setAttribute('aria-busy', 'true');
  try {
    const fetchImpl = demo ? demoFetch(id) : window.fetch.bind(window);
    render(await loadStatus({ id, fetchImpl, apiBase, storage }));
    const url = new URL(location.href);
    url.searchParams.set('id', id);
    history.replaceState(null, '', url);
  } catch (err) {
    result.hidden = true;
    showMessage(err instanceof StatusError ? err.message : 'Vérification impossible pour le moment.', 'erreur');
  } finally {
    form.removeAttribute('aria-busy');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  check(input.value);
});

if (demo) document.getElementById('demo').hidden = false;
const initial = params.get('id');
if (initial) {
  input.value = initial;
  check(initial);
}

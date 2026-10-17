'use strict';
const $ = (id) => document.getElementById(id);
const ORDRE = ['bloque', 'attente', 'encours', 'afaire', 'fait'];
const LIBELLES = { encours: 'En cours', attente: 'Attend ta réponse', bloque: 'Bloqué', fait: 'Fait', afaire: 'À faire' };
const JOUR = 24 * 3600 * 1000;

let etat = { point: {}, sessions: {}, actions: [], notes: '' };

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

function anciennete(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

const SVG = "http://www.w3.org/2000/svg";
// Petit bonhomme en pixel-art : corps large, deux bras, deux yeux, quatre pattes
// Petits pictogrammes en pixels affichés au-dessus du bonhomme selon l'état
const GLYPHES = {
  attente: ["###", "..#", ".#.", "...", ".#."],
  bloque: [".#.", ".#.", ".#.", "...", ".#."],
  fait: ["....#", "...#.", "#.#..", ".#..."],
  afaire: ["###", "..#", ".#.", "#..", "###"],
};
function mascotte(etat) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 -6 24 22");
  svg.setAttribute("class", `mascotte m-${etat}`);
  svg.setAttribute("aria-hidden", "true");
  const forme = (parent, classe, x, y, w, h) => {
    const r = document.createElementNS(SVG, "rect");
    r.setAttribute("class", classe);
    Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => r.setAttribute(k, v));
    parent.append(r);
  };
  const g = (parent, classe) => {
    const e = document.createElementNS(SVG, "g");
    e.setAttribute("class", classe);
    parent.append(e);
    return e;
  };
  const tout = g(svg, "tout");
  forme(tout, "membre jambe jambe-a", 5, 11, 2, 4);
  forme(tout, "membre jambe jambe-b", 9, 11, 2, 4);
  forme(tout, "membre jambe jambe-a", 13, 11, 2, 4);
  forme(tout, "membre jambe jambe-b", 17, 11, 2, 4);
  forme(tout, "membre bras bras-g", 0, 5, 4, 3);
  forme(tout, "membre bras bras-d", 20, 5, 4, 3);
  forme(tout, "corps", 4, 2, 16, 9);
  const yeux = g(tout, "yeux");
  forme(yeux, "oeil", 7, 5, 2, 3);
  forme(yeux, "oeil", 15, 5, 2, 3);
  if (etat === "encours") for (let i = 0; i < 3; i++) forme(svg, "bulle", 14 + i * 3.5, -4.5, 2, 2);
  if (GLYPHES[etat]) {
    const sym = g(svg, `sym sym-${etat}`);
    GLYPHES[etat].forEach((ligne, y) => [...ligne].forEach((c, x) => { if (c === "#") forme(sym, "pixel", 17 + x * 1.2, -6 + y * 1.2, 1.2, 1.2); }));
  }
  return svg;
}

function carte(s) {
  const c = el('article', `carte e-${s.etat}`);
  const tete = el('div', 'carte-tete');
  const gauche = el('div', 'carte-gauche');
  const texte = el('div');
  texte.style.minWidth = '0';
  texte.append(el('div', 'titre', s.titre));
  if (s.projet) texte.append(el('div', 'projet', s.projet));
  gauche.append(mascotte(s.etat));
  gauche.append(texte);
  tete.append(gauche,el('span', `pastille e-${s.etat}`, LIBELLES[s.etat] || s.etat));
  c.append(tete);
  if (s.detail) c.append(el('p', 'detail', s.detail));
  const pied = el('div', 'pied');
  pied.append(el('span', null, `Mis à jour à ${heure(s.maj)}`), el('span', 'age', anciennete(s.maj)));
  pied.lastChild.dataset.maj = s.maj;
  c.append(pied);
  const x = el('button', 'icone retirer', '✕');
  x.title = 'Retirer cette carte';
  x.setAttribute('aria-label', 'Retirer cette carte');
  x.addEventListener('click', () => window.suivi.retirerSession(s.id));
  c.append(x);
  return c;
}

function dessiner() {
  const p = etat.point || {};
  $('point-texte').textContent = p.texte || 'Rien à signaler pour le moment.';
  $('point-maj').textContent = p.maj ? `Mis à jour à ${heure(p.maj)}` : '';

  const ul = $('actions');
  ul.replaceChildren();
  for (const a of etat.actions || []) {
    const li = el('li');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.setAttribute('aria-label', 'Terminé : ' + a.texte);
    cb.addEventListener('change', () => window.suivi.cocherAction(a.id));
    const txt = el('div');
    txt.append(el('div', null, a.texte));
    if (a.projet) txt.append(el('div', 'proj', a.projet));
    li.append(cb, txt);
    ul.append(li);
  }
  $('bloc-actions').hidden = !(etat.actions || []).length;
  $('nb-actions').textContent = (etat.actions || []).length || '';

  const maintenant = Date.now();
  const etats = Object.values(etat.sessions || {}).map((s) => s.etat);
  const humeur = ['bloque', 'attente', 'encours'].find((x) => etats.includes(x)) || 'repos';
  const m = $('mascotte-entete');
  if (m.dataset.humeur !== humeur) { m.dataset.humeur = humeur; m.replaceChildren(mascotte(humeur)); }

  const toutes = Object.values(etat.sessions || {}).sort(
    (a, b) => ORDRE.indexOf(a.etat) - ORDRE.indexOf(b.etat) || new Date(b.maj) - new Date(a.maj));
  const anciennes = (s) => s.etat === 'fait' && maintenant - new Date(s.maj).getTime() > JOUR;
  const actives = toutes.filter((s) => !anciennes(s));
  const terminees = toutes.filter(anciennes);

  $('cartes').replaceChildren(...actives.map(carte));
  $('vide').hidden = actives.length > 0 || terminees.length > 0;
  $('cartes-termines').replaceChildren(...terminees.map(carte));
  $('termines').hidden = !terminees.length;
  $('nb-termines').textContent = terminees.length || '';

  if (document.activeElement !== $('notes') && $('notes').value !== (etat.notes || '')) $('notes').value = etat.notes || '';
}

function majAnciennete() {
  for (const e of document.querySelectorAll('.age')) e.textContent = anciennete(e.dataset.maj);
}

window.suivi.onEtat((e) => { etat = e; dessiner(); });
window.suivi.etat().then((e) => { etat = e; dessiner(); });
setInterval(() => { dessiner(); }, 60 * 1000); // ancienneté + repli des « fait » de plus de 24 h
setInterval(majAnciennete, 20 * 1000);

// Bloc-notes : sauvegarde 400 ms après la dernière frappe
let minuteur;
$('notes').addEventListener('input', () => {
  clearTimeout(minuteur);
  minuteur = setTimeout(() => window.suivi.notes($('notes').value), 400);
});
$('notes').addEventListener('blur', () => { clearTimeout(minuteur); window.suivi.notes($('notes').value); });

// Réglages
function appliquerReglages(r) {
  $('opt-demarrage').checked = !!r.demarrage;
  $('opt-notifications').checked = !!r.notifications;
  $('btn-epingle').setAttribute('aria-pressed', String(!!r.epingle));
}
$('btn-epingle').addEventListener('click', () => {
  const actif = $('btn-epingle').getAttribute('aria-pressed') !== 'true';
  $('btn-epingle').setAttribute('aria-pressed', String(actif));
  window.suivi.reglage('epingle', actif);
});
window.suivi.reglages().then(appliquerReglages);
window.suivi.onReglages(appliquerReglages);
$('opt-demarrage').addEventListener('change', (e) => window.suivi.reglage('demarrage', e.target.checked));
$('opt-notifications').addEventListener('change', (e) => window.suivi.reglage('notifications', e.target.checked));
$('btn-reglages').addEventListener('click', () => {
  const ouvert = $('reglages').hidden;
  $('reglages').hidden = !ouvert;
  $('btn-reglages').setAttribute('aria-expanded', String(ouvert));
});

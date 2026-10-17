'use strict';
const $ = (id) => document.getElementById(id);
const ORDRE = ['bloque', 'attente', 'encours', 'afaire', 'fait'];
const LIBELLES = { encours: 'En cours', attente: 'Attend ta réponse', bloque: 'Bloqué', fait: 'Fait', afaire: 'À faire' };
const JOUR = 24 * 3600 * 1000;

const TRIS = ['etat', 'projet', 'recent'];
const NOMS_TRI = { etat: 'État', projet: 'Projet', recent: 'Récent' };
let tri = 'etat';

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
  chill: [".##", ".#.", ".#.", "##.", "##."],
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
  if (etat === "chill") {
    // lunettes de soleil + petit sourire
    forme(tout, "lunette", 6, 5, 5, 3);
    forme(tout, "lunette", 13, 5, 5, 3);
    forme(tout, "lunette", 11, 5.5, 2, 1);
    forme(tout, "reflet", 7, 5.5, 1, 1);
    forme(tout, "reflet", 14, 5.5, 1, 1);
    forme(tout, "bouche", 10, 9, 4, 1);
  } else {
    const yeux = g(tout, "yeux");
    forme(yeux, "oeil", 7, 5, 2, 3);
    forme(yeux, "oeil", 15, 5, 2, 3);
  }
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
  if ((s.points || []).length) {
    const ul = el('ul', 'puces');
    for (const p of s.points) ul.append(el('li', null, p));
    c.append(ul);
  }
  if (s.lien) {
    c.classList.add('cliquable');
    c.title = 'Ouvrir la session';
    c.addEventListener('click', () => window.suivi.ouvrirLien(s.lien));
    c.append(el('span', 'ouvrir', 'Ouvrir ↗'));
  }
  const pied = el('div', 'pied');
  pied.append(el('span', null, `Mis à jour à ${heure(s.maj)}`), el('span', 'age', anciennete(s.maj)));
  pied.lastChild.dataset.maj = s.maj;
  c.append(pied);
  const x = el('button', 'icone retirer', '✕');
  x.title = 'Retirer cette carte';
  x.setAttribute('aria-label', 'Retirer cette carte');
  x.addEventListener('click', (e) => { e.stopPropagation(); window.suivi.retirerSession(s.id); });
  c.append(x);
  return c;
}

// Tri « Projet » : un titre par projet ; les projets avec la session la plus urgente passent en premier
function groupes(liste) {
  const par = new Map();
  for (const s of liste) {
    const nom = s.projet || 'Sans projet';
    if (!par.has(nom)) par.set(nom, []);
    par.get(nom).push(s);
  }
  const urgence = (l) => Math.min(...l.map((s) => ORDRE.indexOf(s.etat)));
  const noeuds = [];
  [...par.entries()].sort((a, b) => urgence(a[1]) - urgence(b[1]) || a[0].localeCompare(b[0], 'fr')).forEach(([nom, l]) => {
    noeuds.push(el('div', 'groupe', nom), ...l.map(carte));
  });
  return noeuds;
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
    const t = el('div', a.lien ? 'lien' : null, a.texte + (a.lien ? ' ↗' : ''));
    if (a.lien) { t.title = 'Ouvrir la session'; t.addEventListener('click', () => window.suivi.ouvrirLien(a.lien)); }
    txt.append(t);
    if (a.projet) txt.append(el('div', 'proj', a.projet));
    li.append(cb, txt);
    ul.append(li);
  }
  $('bloc-actions').hidden = !(etat.actions || []).length;
  $('nb-actions').textContent = (etat.actions || []).length || '';

  const maintenant = Date.now();
  const m = $('mascotte-entete');
  if (!m.firstChild) m.append(mascotte('chill'));

  const parEtat = (a, b) => ORDRE.indexOf(a.etat) - ORDRE.indexOf(b.etat) || new Date(b.maj) - new Date(a.maj);
  const parRecent = (a, b) => new Date(b.maj) - new Date(a.maj);
  const toutes = Object.values(etat.sessions || {}).sort(tri === 'recent' ? parRecent : parEtat);
  const anciennes = (s) => s.etat === 'fait' && maintenant - new Date(s.maj).getTime() > JOUR;
  const actives = toutes.filter((s) => !anciennes(s));
  const terminees = toutes.filter(anciennes);

  $('cartes').replaceChildren(...(tri === 'projet' ? groupes(actives) : actives.map(carte)));
  $('tri-nom').textContent = NOMS_TRI[tri];
  $('vide').hidden = actives.length > 0 || terminees.length > 0;
  $('cartes-termines').replaceChildren(...terminees.map(carte));
  $('termines').hidden = !terminees.length;
  $('nb-termines').textContent = terminees.length || '';

  if (document.activeElement !== $('notes') && $('notes').value !== (etat.notes || '')) $('notes').value = etat.notes || '';
}

// Nettoyer : retire les cartes sans mise à jour depuis plus d'une heure (2 clics pour confirmer)
const DELAI_NETTOYAGE = 60 * 60 * 1000;
let minuteurNettoyer;
const perimees = () => Object.values(etat.sessions || {}).filter((s) => Date.now() - new Date(s.maj).getTime() > DELAI_NETTOYAGE).length;
function reinitNettoyer() { clearTimeout(minuteurNettoyer); $('btn-nettoyer').textContent = '🧹 Nettoyer'; $('btn-nettoyer').classList.remove('confirme'); }
$('btn-nettoyer').addEventListener('click', () => {
  const b = $('btn-nettoyer');
  if (b.classList.contains('confirme')) { window.suivi.nettoyer(); reinitNettoyer(); return; }
  const n = perimees();
  if (!n) { b.textContent = 'Rien à nettoyer'; clearTimeout(minuteurNettoyer); minuteurNettoyer = setTimeout(reinitNettoyer, 2000); return; }
  b.textContent = `Retirer ${n} carte${n > 1 ? 's' : ''} ? Confirmer`;
  b.classList.add('confirme');
  clearTimeout(minuteurNettoyer);
  minuteurNettoyer = setTimeout(reinitNettoyer, 4000);
});

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
  if (TRIS.includes(r.tri) && r.tri !== tri) { tri = r.tri; dessiner(); }
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

$('btn-tri').addEventListener('click', () => {
  tri = TRIS[(TRIS.indexOf(tri) + 1) % TRIS.length];
  window.suivi.reglage('tri', tri);
  dessiner();
});

// Plein écran : plus de place, détails en puces
function majGrand(actif) {
  document.body.classList.toggle('grand', actif);
  $('btn-grand').setAttribute('aria-pressed', String(actif));
}
$('btn-grand').addEventListener('click', () => window.suivi.pleinEcran(!document.body.classList.contains('grand')));
window.suivi.onPleinEcran(majGrand);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('grand')) window.suivi.pleinEcran(false); });

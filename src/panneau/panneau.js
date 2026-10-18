'use strict';
const $ = (id) => document.getElementById(id);
const ORDRE = ['bloque', 'attente', 'encours', 'afaire', 'fait'];
const LIBELLES = { encours: 'En cours', attente: 'Attend ta réponse', bloque: 'Bloqué', fait: 'Fait', afaire: 'À faire' };
const JOUR = 24 * 3600 * 1000;

const TRIS = ['etat', 'projet', 'recent'];
const NOMS_TRI = { etat: 'État', projet: 'Projet', recent: 'Récent' };
let tri = 'etat';
let ongletActif = 'activite';
let usage = null;
const JOURS_COURTS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
// Dans « To do », le tri « État » veut dire « ordre d'ajout »
const NOMS_TRI_TODO = { etat: 'Ajout', projet: 'Projet', recent: 'Récent' };

let etat = { sessions: {}, actions: [], notes: '' };

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
  if (etat !== "encours") forme(tout, "membre bras bras-g", 0, 5, 4, 3);
  if (etat === "attente") {
    // bras droit levé, un doigt en l'air : « j'ai une question ☝ »
    const bras = g(tout, "bras bras-d");
    forme(bras, "membre", 20, 6, 3, 4);
    forme(bras, "membre", 20, 3, 4, 3);
    forme(bras, "membre", 21.3, -1, 1.4, 4);
  } else if (etat !== "encours") {
    forme(tout, "membre bras bras-d", 20, 5, 4, 3);
  }
  forme(tout, "corps", 4, 2, 16, 9);
  if (etat === "chill") {
    // lunettes de soleil + petit sourire
    forme(tout, "lunette", 6, 5, 5, 3);
    forme(tout, "lunette", 13, 5, 5, 3);
    forme(tout, "lunette", 11, 5.5, 2, 1);
    forme(tout, "reflet", 7, 5.5, 1, 1);
    forme(tout, "reflet", 14, 5.5, 1, 1);
    forme(tout, "bouche", 10, 9, 4, 1);
  } else if (etat === "attente") {
    // lunettes de premier de la classe : montures rondes, grands yeux, pont
    for (const x of [6, 13]) {
      forme(tout, "monture", x, 4, 5, 5);
      forme(tout, "verre", x + 1, 5, 3, 3);
      forme(tout, "oeil", x + 2, 5.5, 1, 2);
    }
    forme(tout, "monture", 11, 5, 2, 1);
    forme(tout, "bouche", 11, 9.5, 2, 1);
  } else {
    const yeux = g(tout, "yeux");
    forme(yeux, "oeil", 7, 5, 2, 3);
    forme(yeux, "oeil", 15, 5, 2, 3);
  }
  if (etat === "encours") {
    // Claude au travail devant son ordinateur portable : le dos de l'écran, le clavier, les mains qui tapent
    forme(tout, "ecran", 5, 8.5, 14, 4.5);
    forme(tout, "logo", 11, 9.8, 2, 2);
    forme(tout, "clavier", 3, 13, 18, 1.5);
    forme(tout, "membre bras bras-g", 1, 9, 4, 3);
    forme(tout, "membre bras bras-d", 19, 9, 4, 3);
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

function carteTodo(a) {
  const c = el('article', 'carte todo');
  c.append(el('div', 'titre plein', a.texte));
  if (a.projet) c.append(el('div', 'projet', a.projet));
  const pied = el('div', 'pied');
  pied.append(el('span', null, `Ajouté à ${heure(a.maj)}`), el('span', 'age', anciennete(a.maj)));
  pied.lastChild.dataset.maj = a.maj;
  c.append(pied);
  if (a.lien) {
    c.classList.add('cliquable');
    c.title = 'Ouvrir la session';
    c.addEventListener('click', () => window.suivi.ouvrirLien(a.lien));
    c.append(el('span', 'ouvrir', 'Ouvrir ↗'));
  }
  const x = el('button', 'icone retirer', '✕');
  x.title = 'Retirer ce rappel';
  x.setAttribute('aria-label', 'Retirer ce rappel');
  x.addEventListener('click', (e) => { e.stopPropagation(); window.suivi.cocherAction(a.id); });
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

// Tri des rappels du To do : ajout (le plus ancien d'abord), projet (groupes A→Z), récent (le plus récent d'abord)
function rappelsTries(liste) {
  const parDate = (a, b) => new Date(a.maj) - new Date(b.maj);
  if (tri === 'recent') return liste.slice().sort((a, b) => parDate(b, a)).map(carteTodo);
  if (tri === 'projet') {
    const par = new Map();
    for (const a of liste.slice().sort(parDate)) {
      const nom = a.projet || 'Sans projet';
      if (!par.has(nom)) par.set(nom, []);
      par.get(nom).push(a);
    }
    const ordre = [...par.keys()].sort((a, b) => (a === 'Sans projet') - (b === 'Sans projet') || a.localeCompare(b, 'fr'));
    return ordre.flatMap((nom) => [el('div', 'groupe', nom), ...par.get(nom).map(carteTodo)]);
  }
  return liste.slice().sort(parDate).map(carteTodo);
}

function dessiner() {
  // To do : de simples cartes-rappels (rien à cocher), retirées d'un clic sur ✕
  const todo = etat.actions || [];
  $('cartes-todo').replaceChildren(...rappelsTries(todo));
  $('todo-vide').hidden = todo.length > 0;
  $('nb-actions').textContent = todo.length || '';
  if (ongletActif === 'usage') dessinerUsage();

  // Activité : journal des dernières mises à jour des sessions
  const journal = etat.activite || [];
  $('activite').replaceChildren(...journal.map((a) => {
    const li = el('li', `ev e-${a.etat || 'neutre'}`);
    li.append(el('span', 'ev-heure', heure(a.maj)));
    const corps = el('div', 'ev-corps');
    corps.append(el('div', 'ev-titre', [a.titre, a.etat ? LIBELLES[a.etat] : ''].filter(Boolean).join(' · ')));
    if (a.texte) corps.append(el('div', 'ev-texte', a.texte));
    li.append(corps);
    return li;
  }));
  $('activite-vide').hidden = journal.length > 0;
  $('nb-journal').textContent = journal.length || '';

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
  $('tri-nom').textContent = (ongletActif === 'todo' ? NOMS_TRI_TODO : NOMS_TRI)[tri];
  $('nb-activite').textContent = actives.length || '';
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

// Onglets Activité / To do (le choix est retenu)
const ONGLETS = ['activite', 'todo', 'usage'];
function choisirOnglet(nom) {
  for (const n of ONGLETS) {
    $('onglet-' + n).setAttribute('aria-selected', String(n === nom));
    $('vue-' + n).hidden = n !== nom;
  }
  ongletActif = nom;
  $('btn-tri').hidden = nom === 'usage';
  dessiner();
  if (nom === 'usage') dessinerUsage();
  try { localStorage.setItem('onglet', nom); } catch { /* pas grave */ }
}
$('onglet-activite').addEventListener('click', () => choisirOnglet('activite'));
$('onglet-todo').addEventListener('click', () => choisirOnglet('todo'));
$('onglet-usage').addEventListener('click', () => choisirOnglet('usage'));
try { const o = localStorage.getItem('onglet'); choisirOnglet(ONGLETS.includes(o) ? o : 'activite'); } catch { /* défaut : activité */ }

// ---- Onglet Usage : limites du forfait (poussées par les sessions) + tokens locaux
// (voir « let usage » en haut du fichier)

function tok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
  if (n >= 1e3) return Math.round(n / 1e3) + ' k';
  return String(n);
}

function dans(iso) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (!iso || Number.isNaN(s)) return '';
  if (s <= 0) return 'réinitialisée';
  const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (j) return `dans ${j} j ${h} h`;
  if (h) return `dans ${h} h ${String(m).padStart(2, '0')}`;
  return `dans ${m} min`;
}

function jauge(label, pct, droite, sous) {
  const c = el('div', 'jauge');
  const tete = el('div', 'jauge-tete');
  tete.append(el('span', null, label), el('b', null, `${Math.round(pct)} %`));
  const piste = el('div', 'piste');
  const rempli = el('div', `rempli ${pct >= 85 ? 'haut' : pct >= 60 ? 'moyen' : 'bas'}`);
  rempli.style.width = Math.min(pct, 100) + '%';
  piste.append(rempli);
  c.append(tete, piste);
  if (droite || sous) c.append(el('div', 'discret', [droite, sous].filter(Boolean).join(' · ')));
  return c;
}

function dessinerUsage() {
  const lim = etat.limites;
  const blocs = [];
  if (lim && (lim.fenetres || []).length) {
    for (const w of lim.fenetres) blocs.push(jauge(w.label, w.percentUsed, w.resetsAt ? 'Réinitialisation ' + dans(w.resetsAt) : ''));
    if (lim.extra) blocs.push(jauge('Crédit supplémentaire', lim.extra.percentUsed, `${lim.extra.spent} / ${lim.extra.monthlyLimit} ${lim.extra.currency}`));
    blocs.push(el('p', 'discret note', `Mis à jour ${anciennete(lim.maj)}`));
  }
  $('limites').replaceChildren(...blocs);
  $('limites-vide').hidden = blocs.length > 0;

  if (!usage) return;
  $('tok-semaine').textContent = tok(usage.semaine);
  $('tok-5h').textContent = tok(usage.cinqHeures);
  const max = Math.max(1, ...usage.jours.map((j) => j.tokens));
  $('graph-jours').replaceChildren(...usage.jours.map((j, i) => {
    const [a, m, d] = j.date.split('-').map(Number);
    const col = el('div', 'col' + (i === usage.jours.length - 1 ? ' aujourdhui' : ''));
    const barre = el('div', 'barre');
    barre.style.height = Math.max(j.tokens ? 3 : 1, Math.round((j.tokens / max) * 70)) + 'px';
    barre.title = `${j.date} : ${j.tokens.toLocaleString('fr-FR')} tokens`;
    col.append(el('span', 'val', j.tokens ? tok(j.tokens) : ''), barre, el('span', 'jour', JOURS_COURTS[new Date(a, m - 1, d).getDay()]));
    return col;
  }));

  const plus = Math.max(1, ...usage.sessions.map((s) => s.tokens));
  $('usage-sessions').replaceChildren(...usage.sessions.map((s) => {
    const c = el('article', 'carte usage-ligne');
    const tete = el('div', 'carte-tete');
    const g = el('div');
    g.style.minWidth = '0';
    g.append(el('div', 'titre', s.titre));
    g.append(el('div', 'projet', [s.projet, anciennete(s.derniere)].filter(Boolean).join(' · ')));
    const d = el('div', 'usage-nb');
    d.append(el('b', null, tok(s.tokens)));
    if (s.tokens5h) d.append(el('span', 'discret', `${tok(s.tokens5h)} en 5 h`));
    tete.append(g, d);
    const spark = el('div', 'spark');
    const mj = Math.max(1, ...s.parJour);
    s.parJour.forEach((v) => {
      const b = el('i');
      b.style.height = Math.max(v ? 2 : 1, Math.round((v / mj) * 18)) + 'px';
      spark.append(b);
    });
    const part = el('div', 'part');
    const p = el('div');
    p.style.width = Math.max(2, Math.round((s.tokens / plus) * 100)) + '%';
    part.append(p);
    c.append(tete, spark, part);
    return c;
  }));
  $('usage-vide').hidden = usage.sessions.length > 0;
}

window.suivi.onUsage((u) => { usage = u; if (ongletActif === 'usage') dessinerUsage(); });
window.suivi.usage().then((u) => { usage = u; if (ongletActif === 'usage') dessinerUsage(); });

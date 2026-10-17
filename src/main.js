'use strict';
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, nativeTheme, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { demarrer, PORT } = require('./server');

app.setName('claude-suivi');
app.setAppUserModelId('claude-suivi');

if (!app.requestSingleInstanceLock()) app.quit();

const LARGEUR = 380;
const HAUTEUR = 560;

let tray, fenetre, store, serveur;
let pastille = false;
let dernierMasquage = 0;
let reglages = { notifications: true, epingle: false };

const fichierReglages = () => path.join(app.getPath('userData'), 'reglages.json');
function chargerReglages() {
  try { reglages = { ...reglages, ...JSON.parse(fs.readFileSync(fichierReglages(), 'utf8')) }; } catch { /* valeurs par défaut */ }
}
function sauverReglages() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(fichierReglages(), JSON.stringify(reglages, null, 2), 'utf8');
}

const optionsDemarrage = () => ({ path: process.execPath, args: [app.getAppPath()] });
const lancerAuDemarrage = () => app.getLoginItemSettings(optionsDemarrage()).openAtLogin;
function regleDemarrage(actif) {
  app.setLoginItemSettings({ openAtLogin: actif, ...optionsDemarrage() });
}

// ---- Icône de la zone de notification, dessinée à la main (pas de fichier image à gérer) ----
function creerIcone(avecPastille) {
  const T = 32;
  const buf = Buffer.alloc(T * T * 4);
  const set = (x, y, r, g, b, a = 255) => { const i = (y * T + x) * 4; buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a; };
  const dedans = (x, y, cx, cy, rayon) => (x - cx) ** 2 + (y - cy) ** 2 <= rayon * rayon;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      // carré arrondi couleur accent
      const m = 4, rc = 7;
      const px = Math.min(Math.max(x, m + rc), T - 1 - m - rc);
      const py = Math.min(Math.max(y, m + rc), T - 1 - m - rc);
      const carre = x >= m && x <= T - 1 - m && y >= m && y <= T - 1 - m && dedans(x, y, px, py, rc);
      if (carre) set(x, y, 217, 119, 87);
      // trois barres blanches (liste de sessions)
      if (carre && [11, 16, 21].some((by) => y >= by && y < by + 3) && x >= 9 && x <= 22) set(x, y, 255, 255, 255);
    }
  }
  if (avecPastille) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (dedans(x, y, 24, 8, 8)) set(x, y, 255, 255, 255);
      if (dedans(x, y, 24, 8, 6)) set(x, y, 214, 48, 49);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: T, height: T, scaleFactor: 2 });
}

function majIcone() {
  tray.setImage(creerIcone(pastille));
  tray.setToolTip(pastille ? 'Claude Suivi — une session a besoin de toi' : 'Claude Suivi');
}

// ---- Panneau ----
function creerFenetre() {
  fenetre = new BrowserWindow({
    width: LARGEUR, height: HAUTEUR, show: false, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    roundedCorners: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#262624' : '#FAF9F5',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  fenetre.setMenuBarVisibility(false);
  fenetre.loadFile(path.join(__dirname, 'panneau', 'index.html'));
  fenetre.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  fenetre.webContents.on('will-navigate', (e) => e.preventDefault());
  fenetre.on('blur', () => { if (!reglages.epingle && fenetre.isVisible()) { fenetre.hide(); dernierMasquage = Date.now(); } });
  fenetre.on('show', () => envoyerEtat());
}

function positionner() {
  const b = tray.getBounds();
  const ecran = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const zone = ecran.workArea;
  let x = Math.round(b.x + b.width / 2 - LARGEUR / 2);
  let y = b.y >= zone.y + zone.height ? b.y - HAUTEUR - 8 : b.y + b.height + 8;
  if (b.y < zone.y + zone.height && b.y + b.height <= zone.y + 4) y = zone.y + 8; // barre des tâches en haut
  x = Math.min(Math.max(x, zone.x + 8), zone.x + zone.width - LARGEUR - 8);
  y = Math.min(Math.max(y, zone.y + 8), zone.y + zone.height - HAUTEUR - 8);
  fenetre.setPosition(x, y, false);
}

function ouvrir() {
  positionner();
  fenetre.show();
  fenetre.focus();
  if (pastille) { pastille = false; majIcone(); }
}

function basculer() {
  if (fenetre.isVisible()) { fenetre.hide(); return; }
  // le clic sur l'icône retire d'abord le focus (donc masque) : on ignore la réouverture immédiate
  if (Date.now() - dernierMasquage < 250) return;
  ouvrir();
}

function envoyerEtat() {
  if (!fenetre || fenetre.isDestroyed()) return;
  fenetre.webContents.send('etat', store.lire());
}

function menu() {
  return Menu.buildFromTemplate([
    { label: 'Ouvrir', click: ouvrir },
    { label: 'Tout effacer', click: confirmerEffacer },
    { type: 'separator' },
    { label: 'Lancer au démarrage de Windows', type: 'checkbox', checked: lancerAuDemarrage(), click: (i) => regleDemarrage(i.checked) },
    { label: 'Notifications', type: 'checkbox', checked: reglages.notifications, click: (i) => { reglages.notifications = i.checked; sauverReglages(); envoyerReglages(); } },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);
}

function confirmerEffacer() {
  const r = dialog.showMessageBoxSync({
    type: 'question', buttons: ['Tout effacer', 'Annuler'], defaultId: 1, cancelId: 1,
    title: 'Claude Suivi', message: 'Effacer toutes les cartes, actions et le point ?', detail: 'Ton bloc-notes est conservé.',
  });
  if (r === 0) store.toutEffacer();
}

function envoyerReglages() {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send('reglages', lireReglages());
}
const lireReglages = () => ({ notifications: reglages.notifications, epingle: reglages.epingle, demarrage: lancerAuDemarrage() });

// ---- Démarrage ----
app.on('second-instance', () => { if (fenetre) ouvrir(); });
app.on('window-all-closed', () => { /* l'appli vit dans la zone de notification */ });

app.whenReady().then(async () => {
  chargerReglages();
  store = new Store(path.join(app.getPath('userData'), 'etat.json'));

  try {
    serveur = await demarrer(store, PORT);
  } catch (e) {
    dialog.showErrorBox('Claude Suivi', `Impossible d'ouvrir le port ${PORT} (${e.code || e.message}). Est-ce que l'appli tourne déjà ?`);
    app.quit();
    return;
  }

  creerFenetre();
  tray = new Tray(creerIcone(false));
  majIcone();
  tray.on('click', basculer);
  tray.on('right-click', () => { fenetre.hide(); tray.popUpContextMenu(menu()); });

  store.on('change', envoyerEtat);
  store.on('alerte', (s) => {
    if (!fenetre.isVisible()) { pastille = true; majIcone(); }
    if (reglages.notifications && !fenetre.isVisible() && Notification.isSupported()) {
      const n = new Notification({
        title: s.etat === 'bloque' ? 'Session bloquée' : 'Une session attend ta réponse',
        body: [s.titre, s.detail].filter(Boolean).join(' — ').slice(0, 200),
        silent: true,
      });
      n.on('click', ouvrir);
      n.show();
    }
  });

  nativeTheme.on('updated', () => fenetre.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#262624' : '#FAF9F5'));

  ipcMain.handle('etat', () => store.lire());
  ipcMain.handle('reglages', () => lireReglages());
  ipcMain.on('cocher-action', (_e, id) => { if (typeof id === 'string') store.supprimerAction(id); });
  ipcMain.on('retirer-session', (_e, id) => { if (typeof id === 'string') store.supprimerSession(id); });
  ipcMain.on('notes', (_e, texte) => { if (typeof texte === 'string') store.majNotes(texte); });
  ipcMain.on('reglage', (_e, cle, valeur) => {
    if (typeof valeur !== 'boolean') return;
    if (cle === 'epingle') { reglages.epingle = valeur; sauverReglages(); }
    if (cle === 'notifications') { reglages.notifications = valeur; sauverReglages(); }
    if (cle === 'demarrage') regleDemarrage(valeur);
  });
});

app.on('before-quit', () => { if (serveur) serveur.close(); });

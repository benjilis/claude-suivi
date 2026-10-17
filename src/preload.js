'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('suivi', {
  etat: () => ipcRenderer.invoke('etat'),
  reglages: () => ipcRenderer.invoke('reglages'),
  onEtat: (cb) => ipcRenderer.on('etat', (_e, etat) => cb(etat)),
  onReglages: (cb) => ipcRenderer.on('reglages', (_e, r) => cb(r)),
  cocherAction: (id) => ipcRenderer.send('cocher-action', id),
  retirerSession: (id) => ipcRenderer.send('retirer-session', id),
  ouvrirLien: (url) => ipcRenderer.send('ouvrir-lien', url),
  notes: (texte) => ipcRenderer.send('notes', texte),
  reglage: (cle, valeur) => ipcRenderer.send('reglage', cle, valeur),
});

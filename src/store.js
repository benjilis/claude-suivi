'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const ETATS = ['encours', 'attente', 'bloque', 'fait', 'afaire'];
const LIMITES = { titre: 60, projet: 40, detail: 140, texte: 100, point: 200, notes: 100000, lien: 500 };

const vide = () => ({ point: { texte: '', maj: null }, sessions: {}, actions: [], notes: '' });
// Texte trop long : coupé avec « … » pour rester lisible dans le panneau
const coupe = (v, max) => {
  const t = String(v ?? '').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};
const cle = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

class Store extends EventEmitter {
  constructor(fichier) {
    super();
    this.fichier = fichier;
    this.etat = vide();
    this.charger();
  }

  charger() {
    try {
      const brut = JSON.parse(fs.readFileSync(this.fichier, 'utf8'));
      this.etat = { ...vide(), ...brut };
      if (!Array.isArray(this.etat.actions)) this.etat.actions = [];
      if (!this.etat.sessions || typeof this.etat.sessions !== 'object') this.etat.sessions = {};
    } catch {
      this.etat = vide();
    }
  }

  sauver() {
    if (!this.fichier) return;
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    const tmp = this.fichier + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.etat, null, 2), 'utf8');
    fs.renameSync(tmp, this.fichier);
  }

  _change(alerte) {
    this.sauver();
    this.emit('change', this.etat);
    if (alerte) this.emit('alerte', alerte);
  }

  lire() { return this.etat; }

  majSession(id, d) {
    const prev = this.etat.sessions[id];
    const now = new Date().toISOString();
    const s = {
      id,
      titre: coupe(d.titre ?? prev?.titre ?? id, LIMITES.titre),
      projet: coupe(d.projet ?? prev?.projet, LIMITES.projet),
      etat: d.etat ?? prev?.etat ?? 'encours',
      detail: coupe(d.detail ?? prev?.detail, LIMITES.detail),
      lien: d.lien !== undefined ? String(d.lien).slice(0, LIMITES.lien) : prev?.lien || '',
      maj: now,
    };
    this.etat.sessions[id] = s;
    if (d.aToi) {
      // une seule action « à toi » par session : la nouvelle remplace l'ancienne
      this.etat.actions = this.etat.actions.filter((a) => a.sessionId !== id);
      this.etat.actions.push({ id: cle(), texte: coupe(d.aToi, LIMITES.texte), projet: s.projet, lien: s.lien, sessionId: id, maj: now });
    }
    const alerte = ['attente', 'bloque'].includes(s.etat) && prev?.etat !== s.etat ? s : null;
    this._change(alerte);
    return s;
  }

  supprimerSession(id) {
    if (!this.etat.sessions[id]) return false;
    delete this.etat.sessions[id];
    this._change();
    return true;
  }

  majPoint(texte) {
    this.etat.point = { texte: coupe(texte, LIMITES.point), maj: new Date().toISOString() };
    this._change();
    return this.etat.point;
  }

  ajouterAction(texte, projet) {
    const a = { id: cle(), texte: coupe(texte, LIMITES.texte), projet: coupe(projet, LIMITES.projet), maj: new Date().toISOString() };
    this.etat.actions.push(a);
    this._change();
    return a;
  }

  supprimerAction(id) {
    const n = this.etat.actions.length;
    this.etat.actions = this.etat.actions.filter((a) => a.id !== id);
    if (this.etat.actions.length === n) return false;
    this._change();
    return true;
  }

  majNotes(texte) {
    // pas d'événement : on ne réécrit pas la saisie en cours dans le panneau
    this.etat.notes = coupe(texte, LIMITES.notes);
    this.sauver();
  }

  toutEffacer() {
    const notes = this.etat.notes;
    this.etat = { ...vide(), notes };
    this._change();
  }
}

module.exports = { Store, ETATS };

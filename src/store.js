'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DELAI_NETTOYAGE = 60 * 60 * 1000; // 1 heure
const ETATS = ['encours', 'attente', 'bloque', 'fait', 'afaire'];
const LIMITES = { titre: 60, projet: 40, detail: 140, texte: 100, notes: 100000, lien: 500, puce: 120, puces: 8 };

const LIB_ETAT = { encours: 'En cours', attente: 'Attend ta réponse', bloque: 'Bloqué', fait: 'Fait', afaire: 'À faire' };
const MAX_ACTIVITE = 50;
const AGE_ACTIVITE = 24 * 3600 * 1000;

const vide = () => ({ sessions: {}, actions: [], activite: [], notes: '' });
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
      if (!Array.isArray(this.etat.activite)) this.etat.activite = [];
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
      points: Array.isArray(d.points) ? d.points.map((x) => coupe(x, LIMITES.puce)).filter(Boolean).slice(0, LIMITES.puces) : prev?.points || [],
      lien: d.lien !== undefined ? String(d.lien).slice(0, LIMITES.lien) : prev?.lien || '',
      maj: now,
    };
    this.etat.sessions[id] = s;
    if (!prev || prev.etat !== s.etat || (d.detail !== undefined && prev.detail !== s.detail)) {
      this._noter({ sessionId: id, titre: s.titre, projet: s.projet, etat: s.etat, texte: s.detail || LIB_ETAT[s.etat] });
    }
    // Ménage automatique du To do : la question posée (aToi) disparaît quand la session reprend
    // ou se termine ; tous les rappels liés à la session disparaissent quand elle est « fait ».
    if (prev && prev.etat !== s.etat) {
      if (s.etat === 'fait') this.etat.actions = this.etat.actions.filter((a) => a.sessionId !== id);
      else if (s.etat === 'encours') this.etat.actions = this.etat.actions.filter((a) => !(a.sessionId === id && a.question));
    }
    if (d.aToi !== undefined) {
      // une seule question « à toi » par session : la nouvelle remplace l'ancienne ("" l'efface)
      this.etat.actions = this.etat.actions.filter((a) => !(a.sessionId === id && a.question));
      if (d.aToi) this.etat.actions.push({ id: cle(), texte: coupe(d.aToi, LIMITES.texte), projet: s.projet, lien: s.lien, sessionId: id, question: true, maj: now });
    }
    const alerte = ['attente', 'bloque'].includes(s.etat) && prev?.etat !== s.etat ? s : null;
    this._change(alerte);
    return s;
  }

  supprimerSession(id) {
    if (!this.etat.sessions[id]) return false;
    delete this.etat.sessions[id];
    this.etat.actions = this.etat.actions.filter((a) => a.sessionId !== id);
    this._change();
    return true;
  }

  // Retire les cartes (et leurs actions « à toi ») sans mise à jour depuis `delaiMs`
  nettoyer(delaiMs = DELAI_NETTOYAGE) {
    const limite = Date.now() - delaiMs;
    const retirees = Object.values(this.etat.sessions).filter((s) => new Date(s.maj).getTime() < limite).map((s) => s.id);
    if (!retirees.length) return 0;
    for (const id of retirees) delete this.etat.sessions[id];
    this.etat.actions = this.etat.actions.filter((a) => !retirees.includes(a.sessionId));
    this._change();
    return retirees.length;
  }

  // Journal d'activité : le plus récent en premier, 50 entrées max, 24 h max
  _noter(e) {
    const l = this.etat.activite;
    if (l[0] && l[0].sessionId === e.sessionId && l[0].etat === e.etat && l[0].texte === e.texte) return;
    const limite = Date.now() - AGE_ACTIVITE;
    l.unshift({ id: cle(), maj: new Date().toISOString(), ...e });
    this.etat.activite = l.filter((x) => new Date(x.maj).getTime() > limite).slice(0, MAX_ACTIVITE);
  }

  ajouterActivite(texte, projet, etat) {
    this._noter({ sessionId: '', titre: coupe(projet, LIMITES.projet), projet: coupe(projet, LIMITES.projet), etat: etat || '', texte: coupe(texte, LIMITES.detail) });
    this._change();
    return this.etat.activite[0];
  }

  ajouterAction(texte, projet, sessionId) {
    const a = { id: cle(), texte: coupe(texte, LIMITES.texte), projet: coupe(projet, LIMITES.projet), maj: new Date().toISOString() };
    if (sessionId) a.sessionId = coupe(sessionId, 100);
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

module.exports = { Store, ETATS, DELAI_NETTOYAGE };

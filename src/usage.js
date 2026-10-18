'use strict';
// Suivi de l'utilisation des tokens, calculé en LOCAL à partir des journaux de session de Claude Code
// (~/.claude/projects/**/*.jsonl). On ne lit que : l'identifiant et l'horodatage des réponses, leurs
// compteurs de tokens (champ « usage »), le titre de la session et le dossier de travail.
// Jamais le contenu des conversations, et rien ne sort de l'ordinateur.
const fs = require('fs');
const os = require('os');
const path = require('path');

const JOUR = 24 * 3600 * 1000;
const FENETRE_JOURS = 7;
const MAX_SESSIONS = 12;

const racineParDefaut = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');

// Tokens « consommés » = entrée + sortie + écriture du cache. La lecture du cache (très volumineuse
// et bon marché) n'est pas comptée.
const compter = (u) => (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);

function projetDepuisCwd(cwd) {
  if (!cwd) return '';
  const morceaux = String(cwd).split(/[\\/]+/).filter(Boolean);
  const i = morceaux.lastIndexOf('worktrees');
  if (i > 1 && morceaux[i - 1] === '.claude') return morceaux[i - 2];
  return morceaux[morceaux.length - 1] || '';
}

const debutDeJour = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

class SuiviUsage {
  constructor(racine = racineParDefaut(), { maintenant = () => Date.now() } = {}) {
    this.racine = racine;
    this.maintenant = maintenant;
    this.fichiers = new Map(); // chemin -> { offset, sessionId, titre, cwd, msgs: Map(id -> {t, tok, sortie}) }
  }

  _lister() {
    const sortie = [];
    const marche = (dir) => {
      let entrees;
      try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entrees) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) marche(p);
        else if (e.name.endsWith('.jsonl')) sortie.push(p);
      }
    };
    marche(this.racine);
    return sortie;
  }

  // L'identifiant de session est celui du fichier de premier niveau, ou du dossier parent pour les sous-agents.
  _idSession(chemin) {
    const rel = path.relative(this.racine, chemin).split(path.sep);
    return rel.length >= 3 ? rel[1] : path.basename(chemin, '.jsonl');
  }

  // Lit ce qui a été ajouté depuis le dernier passage ; rend la main entre deux fichiers.
  async scanner() {
    const limite = this.maintenant() - (FENETRE_JOURS + 1) * JOUR;
    for (const chemin of this._lister()) {
      let st;
      try { st = fs.statSync(chemin); } catch { continue; }
      let f = this.fichiers.get(chemin);
      if (!f) {
        if (st.mtimeMs < limite) continue; // ancien : sans intérêt pour la semaine en cours
        f = { offset: 0, sessionId: this._idSession(chemin), titre: '', cwd: '', msgs: new Map() };
        this.fichiers.set(chemin, f);
      }
      if (st.size < f.offset) { f.offset = 0; f.msgs.clear(); } // fichier réécrit
      if (st.size > f.offset) this._lireFin(chemin, f, st.size);
      await new Promise((r) => setImmediate(r));
    }
  }

  _lireFin(chemin, f, taille) {
    let fd;
    try {
      fd = fs.openSync(chemin, 'r');
      const buf = Buffer.alloc(taille - f.offset);
      fs.readSync(fd, buf, 0, buf.length, f.offset);
      const dernierRetour = buf.lastIndexOf(10);
      if (dernierRetour < 0) return; // ligne pas encore complète
      const texte = buf.subarray(0, dernierRetour).toString('utf8');
      f.offset += dernierRetour + 1;
      for (const ligne of texte.split('\n')) this._ligne(f, ligne);
    } catch { /* fichier en cours d'écriture ou verrouillé : on réessaiera */ }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* rien */ } }
  }

  _ligne(f, ligne) {
    const titre = ligne.includes('"custom-title"');
    const reponse = ligne.includes('"usage"') && ligne.includes('"type":"assistant"');
    if (!titre && !reponse) return;
    let o;
    try { o = JSON.parse(ligne); } catch { return; }
    if (titre && o.type === 'custom-title' && typeof o.customTitle === 'string') f.titre = o.customTitle;
    if (!reponse || o.type !== 'assistant' || !o.message?.usage) return;
    if (!f.cwd && o.cwd) f.cwd = o.cwd;
    const t = Date.parse(o.timestamp);
    if (!Number.isFinite(t)) return;
    const u = o.message.usage;
    const id = o.message.id || o.uuid;
    const sortie = u.output_tokens || 0;
    const prev = f.msgs.get(id);
    // une même réponse est écrite plusieurs fois : on garde la version la plus complète
    if (!prev || sortie >= prev.sortie) f.msgs.set(id, { t, tok: compter(u), sortie });
  }

  // Totaux : 7 derniers jours, 5 dernières heures, par jour et par session.
  resume() {
    const maintenant = this.maintenant();
    const aujourdhui = debutDeJour(maintenant);
    const jours = [];
    for (let i = FENETRE_JOURS - 1; i >= 0; i--) {
      const debut = debutDeJour(aujourdhui - i * JOUR + JOUR / 2); // robuste aux changements d'heure
      const d = new Date(debut);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      jours.push({ date, debut, tokens: 0 });
    }
    const debutFenetre = jours[0].debut;
    const cinqHeures = maintenant - 5 * 3600 * 1000;
    let total5h = 0;
    const parSession = new Map();

    for (const f of this.fichiers.values()) {
      for (const m of f.msgs.values()) {
        if (m.t < debutFenetre || m.t > maintenant + JOUR) continue;
        let k = jours.length - 1;
        while (k > 0 && jours[k].debut > m.t) k--;
        jours[k].tokens += m.tok;
        if (m.t >= cinqHeures) total5h += m.tok;
        let s = parSession.get(f.sessionId);
        if (!s) {
          s = { id: f.sessionId, titre: '', projet: '', tokens: 0, tokens5h: 0, derniere: 0, parJour: jours.map(() => 0) };
          parSession.set(f.sessionId, s);
        }
        if (f.titre && !s.titre) s.titre = f.titre;
        if (f.cwd && !s.projet) s.projet = projetDepuisCwd(f.cwd);
        s.tokens += m.tok;
        s.parJour[k] += m.tok;
        if (m.t >= cinqHeures) s.tokens5h += m.tok;
        if (m.t > s.derniere) s.derniere = m.t;
      }
    }

    const sessions = [...parSession.values()]
      .map((s) => ({ ...s, titre: s.titre || s.projet || s.id.slice(0, 8), derniere: new Date(s.derniere).toISOString() }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, MAX_SESSIONS);
    return {
      maj: new Date(maintenant).toISOString(),
      semaine: jours.reduce((n, j) => n + j.tokens, 0),
      cinqHeures: total5h,
      jours: jours.map(({ date, tokens }) => ({ date, tokens })),
      sessions,
    };
  }
}

module.exports = { SuiviUsage, racineParDefaut, projetDepuisCwd, compter };

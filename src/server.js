'use strict';
const http = require('http');
const { ETATS } = require('./store');

const HOTE = '127.0.0.1';
const PORT = 4777;
const TAILLE_MAX = 64 * 1024;

const estLocal = (adresse) =>
  adresse === '127.0.0.1' || adresse === '::1' || adresse === '::ffff:127.0.0.1';

// Refuse aussi les pages web (en-tête Origin) et le « DNS rebinding » (en-tête Host).
const hoteValide = (h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(h || '');

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (c) => {
      taille += c.length;
      if (taille > TAILLE_MAX) {
        reject(Object.assign(new Error('corps trop gros'), { code: 413 }));
        req.destroy();
        return;
      }
      morceaux.push(c);
    });
    req.on('end', () => {
      if (!morceaux.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch {
        reject(Object.assign(new Error('JSON invalide'), { code: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function creerServeur(store) {
  const envoyer = (res, code, obj) => {
    const corps = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corps) });
    res.end(corps);
  };

  return http.createServer(async (req, res) => {
    try {
      if (!estLocal(req.socket.remoteAddress) || !hoteValide(req.headers.host) || req.headers.origin) {
        return envoyer(res, 403, { erreur: 'accès refusé' });
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').filter(Boolean).map((p) => {
        try { return decodeURIComponent(p); } catch { return p; }
      });
      const [ressource, id] = parts;
      const m = req.method;

      if (m === 'GET' && ressource === 'sante' && !id) return envoyer(res, 200, { ok: true });
      if (m === 'GET' && ressource === 'etat' && !id) return envoyer(res, 200, store.lire());

      if (ressource === 'sessions' && id && id.length <= 100) {
        if (m === 'PUT') {
          const d = await lireCorps(req);
          if (d.etat !== undefined && !ETATS.includes(d.etat)) {
            return envoyer(res, 400, { erreur: `etat doit être : ${ETATS.join(', ')}` });
          }
          for (const k of ['titre', 'projet', 'detail', 'aToi']) {
            if (d[k] !== undefined && typeof d[k] !== 'string') return envoyer(res, 400, { erreur: `${k} doit être du texte` });
          }
          return envoyer(res, 200, store.majSession(id, d));
        }
        if (m === 'DELETE') {
          return store.supprimerSession(id) ? envoyer(res, 200, { ok: true }) : envoyer(res, 404, { erreur: 'introuvable' });
        }
      }

      if (ressource === 'point' && !id && m === 'PUT') {
        const d = await lireCorps(req);
        if (typeof d.texte !== 'string') return envoyer(res, 400, { erreur: 'texte requis' });
        return envoyer(res, 200, store.majPoint(d.texte));
      }

      if (ressource === 'actions') {
        if (!id && m === 'POST') {
          const d = await lireCorps(req);
          if (typeof d.texte !== 'string' || !d.texte.trim()) return envoyer(res, 400, { erreur: 'texte requis' });
          if (d.projet !== undefined && typeof d.projet !== 'string') return envoyer(res, 400, { erreur: 'projet doit être du texte' });
          return envoyer(res, 201, store.ajouterAction(d.texte, d.projet));
        }
        if (id && m === 'DELETE') {
          return store.supprimerAction(id) ? envoyer(res, 200, { ok: true }) : envoyer(res, 404, { erreur: 'introuvable' });
        }
      }

      envoyer(res, 404, { erreur: 'route inconnue' });
    } catch (e) {
      envoyer(res, e.code === 413 || e.code === 400 ? e.code : 500, { erreur: e.message });
    }
  });
}

function demarrer(store, port = PORT) {
  const srv = creerServeur(store);
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, HOTE, () => resolve(srv));
  });
}

module.exports = { creerServeur, demarrer, estLocal, hoteValide, PORT, HOTE };

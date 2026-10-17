'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { creerServeur, estLocal, hoteValide } = require('../src/server');

let dossier, fichier, store, srv, port;

function appel(methode, chemin, corps, entetes = {}) {
  return new Promise((resolve, reject) => {
    const data = corps === undefined ? null : Buffer.from(typeof corps === 'string' ? corps : JSON.stringify(corps), 'utf8');
    const req = http.request(
      { host: '127.0.0.1', port, method: methode, path: chemin,
        headers: { ...(data ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length } : {}), ...entetes } },
      (res) => {
        const m = [];
        res.on('data', (c) => m.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(m).toString('utf8');
          resolve({ code: res.statusCode, corps: txt ? JSON.parse(txt) : null });
        });
      });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'suivi-test-'));
  fichier = path.join(dossier, 'etat.json');
  store = new Store(fichier);
  srv = creerServeur(store);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  port = srv.address().port;
});

after(() => {
  srv.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('GET /sante', async () => {
  const r = await appel('GET', '/sante');
  assert.equal(r.code, 200);
  assert.deepEqual(r.corps, { ok: true });
});

test('le serveur écoute uniquement sur 127.0.0.1', () => {
  assert.equal(srv.address().address, '127.0.0.1');
});

test('PUT /sessions/:id crée puis met à jour (accents UTF-8)', async () => {
  let r = await appel('PUT', '/sessions/p-sujet', { titre: 'Réécriture é à ù', projet: 'p', etat: 'encours', detail: 'En cours…' });
  assert.equal(r.code, 200);
  assert.equal(r.corps.titre, 'Réécriture é à ù');
  r = await appel('PUT', '/sessions/p-sujet', { etat: 'fait' });
  assert.equal(r.corps.etat, 'fait');
  assert.equal(r.corps.titre, 'Réécriture é à ù');
  const e = await appel('GET', '/etat');
  assert.equal(Object.keys(e.corps.sessions).length, 1);
  assert.equal(e.corps.sessions['p-sujet'].detail, 'En cours…');
});

test('PUT /sessions refuse un état invalide et un JSON cassé', async () => {
  assert.equal((await appel('PUT', '/sessions/x', { etat: 'nimporte' })).code, 400);
  assert.equal((await appel('PUT', '/sessions/x', '{pas du json')).code, 400);
  assert.equal((await appel('PUT', '/sessions/x', { titre: 42 })).code, 400);
});

test('aToi ajoute une action, remplacée à chaque mise à jour de la session', async () => {
  await appel('PUT', '/sessions/s2', { titre: 'S2', projet: 'p', etat: 'attente', aToi: 'Valider le plan' });
  await appel('PUT', '/sessions/s2', { aToi: 'Valider le plan v2' });
  const e = (await appel('GET', '/etat')).corps;
  const a = e.actions.filter((x) => x.sessionId === 's2');
  assert.equal(a.length, 1);
  assert.equal(a[0].texte, 'Valider le plan v2');
});

test('DELETE /sessions/:id', async () => {
  assert.equal((await appel('DELETE', '/sessions/s2')).code, 200);
  assert.equal((await appel('DELETE', '/sessions/s2')).code, 404);
});

test('PUT /point', async () => {
  const r = await appel('PUT', '/point', { texte: 'Tout va bien' });
  assert.equal(r.code, 200);
  const e = (await appel('GET', '/etat')).corps;
  assert.equal(e.point.texte, 'Tout va bien');
  assert.ok(e.point.maj);
  assert.equal((await appel('PUT', '/point', {})).code, 400);
});

test('POST /actions et DELETE /actions/:id', async () => {
  const r = await appel('POST', '/actions', { texte: 'Relire le README', projet: 'claude-suivi' });
  assert.equal(r.code, 201);
  assert.ok(r.corps.id);
  assert.equal((await appel('POST', '/actions', { texte: '  ' })).code, 400);
  assert.equal((await appel('DELETE', `/actions/${r.corps.id}`)).code, 200);
  assert.equal((await appel('DELETE', `/actions/${r.corps.id}`)).code, 404);
});

test('route inconnue et méthode non gérée -> 404', async () => {
  assert.equal((await appel('GET', '/nimporte')).code, 404);
  assert.equal((await appel('POST', '/sante')).code, 404);
});

test('corps trop gros -> 413', async () => {
  const r = await appel('PUT', '/point', { texte: 'a'.repeat(70 * 1024) }).catch(() => ({ code: 413 }));
  assert.equal(r.code, 413);
});

test('persistance : un nouveau Store relit etat.json', async () => {
  await appel('PUT', '/sessions/persist', { titre: 'Persistant', projet: 'p', etat: 'bloque', detail: 'd' });
  const brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.equal(brut.sessions.persist.titre, 'Persistant');
  const autre = new Store(fichier);
  assert.equal(autre.lire().sessions.persist.etat, 'bloque');
  assert.equal(autre.lire().point.texte, 'Tout va bien');
});

test('fichier d\'état corrompu -> état vide sans planter', () => {
  const f = path.join(dossier, 'casse.json');
  fs.writeFileSync(f, '{{{{');
  assert.deepEqual(new Store(f).lire().sessions, {});
});

test('refus des connexions non locales', async () => {
  assert.equal(estLocal('127.0.0.1'), true);
  assert.equal(estLocal('::1'), true);
  assert.equal(estLocal('::ffff:127.0.0.1'), true);
  assert.equal(estLocal('192.168.1.20'), false);
  assert.equal(estLocal('10.0.0.5'), false);
  assert.equal(estLocal(undefined), false);
  assert.equal(hoteValide('evil.com'), false);
  assert.equal(hoteValide('127.0.0.1:4777'), true);
  // Un navigateur ou un faux nom d'hôte est refusé
  assert.equal((await appel('GET', '/etat', undefined, { Host: 'evil.com' })).code, 403);
  assert.equal((await appel('GET', '/etat', undefined, { Origin: 'https://evil.com' })).code, 403);
});

test('Store émet une alerte seulement au passage à attente/bloque', () => {
  const s = new Store(null);
  const alertes = [];
  s.on('alerte', (x) => alertes.push(x.etat));
  s.majSession('a', { etat: 'encours' });
  s.majSession('a', { etat: 'attente' });
  s.majSession('a', { etat: 'attente' });
  s.majSession('a', { etat: 'bloque' });
  assert.deepEqual(alertes, ['attente', 'bloque']);
});

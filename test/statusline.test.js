'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { creerServeur } = require('../src/server');

const SCRIPT = path.join(__dirname, '..', 'statusline', 'claude-suivi-statusline.js');
const DONNEES = { rate_limits: { five_hour: { used_percentage: 91.4, resets_at: 1792290600 }, seven_day: { used_percentage: 4.2, resets_at: 1793000000 } } };

function lancer(entree, port, memo) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT], { env: { ...process.env, CLAUDE_SUIVI_PORT: String(port), CLAUDE_SUIVI_MEMO: memo } });
    let out = '';
    p.stdout.on('data', (c) => { out += c; });
    p.on('close', (code) => resolve({ code, out }));
    p.stdin.end(entree);
  });
}

test('ligne d\'état : pousse les limites 5 h / semaine vers l\'appli et affiche un résumé', async () => {
  const store = new Store(null);
  store.majLimites({ limites: [{ label: 'x', percentUsed: 1 }], extra: { percentUsed: 10, spent: '4.25', monthlyLimit: '40.00', currency: 'EUR' } });
  const srv = creerServeur(store);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const memo = path.join(os.tmpdir(), 'memo-test-' + Date.now() + '.json');
  try {
    const r = await lancer(JSON.stringify(DONNEES), port, memo);
    assert.equal(r.code, 0);
    assert.equal(r.out.trim(), '5 h 91 % · sem. 4 %');
    const l = store.lire().limites;
    assert.equal(l.fenetres[0].label, '5-hour limit');
    assert.equal(l.fenetres[0].percentUsed, 91.4);
    assert.equal(l.fenetres[1].label, 'Weekly · all models');
    assert.equal(l.fenetres[0].resetsAt, new Date(1792290600 * 1000).toISOString());
    assert.equal(l.extra.spent, '4.25', 'le crédit supplémentaire déjà connu est conservé');

    // même données dans les 5 minutes : pas de nouvel envoi
    store.etat.limites.fenetres = [];
    await lancer(JSON.stringify(DONNEES), port, memo);
    assert.equal(store.lire().limites.fenetres.length, 0);
  } finally {
    srv.close();
    fs.rmSync(memo, { force: true });
  }
});

test('ligne d\'état : silencieuse sans limites, JSON cassé ou appli fermée', async () => {
  const memo = path.join(os.tmpdir(), 'memo-test2-' + Date.now() + '.json');
  for (const entree of ['{}', 'pas du json', '']) {
    const r = await lancer(entree, 1, memo);
    assert.equal(r.code, 0);
    assert.equal(r.out, '');
  }
  const r = await lancer(JSON.stringify(DONNEES), 1, memo); // port fermé
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), '5 h 91 % · sem. 4 %');
  fs.rmSync(memo, { force: true });
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SuiviUsage, projetDepuisCwd, compter } = require('../src/usage');

const MIDI = new Date(2026, 9, 18, 12, 0, 0).getTime(); // 18 oct. 2026, midi (heure locale)
const il_y_a = (h) => new Date(MIDI - h * 3600 * 1000).toISOString();

const rep = (id, h, u, extra = {}) => JSON.stringify({
  type: 'assistant', timestamp: il_y_a(h), cwd: 'C:\\dev\\mon-site', sessionId: 'S', ...extra,
  message: { id, usage: { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 999999, ...u } },
});
const titre = (t) => JSON.stringify({ type: 'custom-title', customTitle: t, sessionId: 'S' });

function racine() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'suivi-usage-'));
  fs.mkdirSync(path.join(d, 'proj'), { recursive: true });
  return d;
}

test('compter : entrée + sortie + écriture du cache, sans la lecture du cache', () => {
  assert.equal(compter({ input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 4000 }), 6);
});

test('projetDepuisCwd : dossier de travail, ou projet parent pour un worktree', () => {
  assert.equal(projetDepuisCwd('C:\\Users\\moi\\dev\\mmodecon'), 'mmodecon');
  assert.equal(projetDepuisCwd('C:\\Users\\moi\\dev\\mmodecon\\.claude\\worktrees\\joli-nom'), 'mmodecon');
  assert.equal(projetDepuisCwd(''), '');
});

test('scanner : tokens par jour, par session, titre, dédoublonnage des réponses', async () => {
  const dir = racine();
  const f = path.join(dir, 'proj', 'S.jsonl');
  fs.writeFileSync(f, [
    titre('Ma session'),
    rep('m1', 1, { output_tokens: 50 }), // version partielle de m1
    rep('m1', 1, { output_tokens: 100 }), // version finale : seule celle-ci compte
    rep('m2', 30, {}), // hier
    'ligne sans rapport',
    '{"type":"user","message":{"content":"secret"}}',
    '',
  ].join('\n'));
  const u = new SuiviUsage(dir, { maintenant: () => MIDI });
  await u.scanner();
  const r = u.resume();
  assert.equal(r.jours.length, 7);
  assert.equal(r.jours[6].tokens, 1110); // 10 + 100 + 1000
  assert.equal(r.jours[5].tokens, 1110);
  assert.equal(r.semaine, 2220);
  assert.equal(r.cinqHeures, 1110);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].titre, 'Ma session');
  assert.equal(r.sessions[0].projet, 'mon-site');
  assert.equal(r.sessions[0].parJour[6], 1110);
  assert.ok(!JSON.stringify(r).includes('secret'), 'le contenu des conversations n\'est jamais lu');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanner : lecture incrémentale, ligne incomplète ignorée jusqu\'à sa fin', async () => {
  const dir = racine();
  const f = path.join(dir, 'proj', 'S.jsonl');
  fs.writeFileSync(f, rep('m1', 1, {}) + '\n');
  const u = new SuiviUsage(dir, { maintenant: () => MIDI });
  await u.scanner();
  assert.equal(u.resume().semaine, 1110);
  const ligne = rep('m2', 2, {});
  fs.appendFileSync(f, ligne.slice(0, 40)); // écriture en cours
  await u.scanner();
  assert.equal(u.resume().semaine, 1110);
  fs.appendFileSync(f, ligne.slice(40) + '\n');
  await u.scanner();
  assert.equal(u.resume().semaine, 2220);
  await u.scanner(); // rien de neuf : pas de double comptage
  assert.equal(u.resume().semaine, 2220);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanner : les sous-agents comptent pour la session parente ; messages trop anciens ignorés', async () => {
  const dir = racine();
  fs.mkdirSync(path.join(dir, 'proj', 'S', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'proj', 'S.jsonl'), rep('m1', 1, {}) + '\n');
  fs.writeFileSync(path.join(dir, 'proj', 'S', 'subagents', 'agent-1.jsonl'), rep('a1', 2, {}) + '\n' + rep('vieux', 24 * 20, {}) + '\n');
  const u = new SuiviUsage(dir, { maintenant: () => MIDI });
  await u.scanner();
  const r = u.resume();
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].tokens, 2220);
  assert.equal(r.semaine, 2220);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanner : dossier absent -> résumé vide, sans erreur', async () => {
  const u = new SuiviUsage(path.join(os.tmpdir(), 'nexiste-pas-' + Date.now()), { maintenant: () => MIDI });
  await u.scanner();
  const r = u.resume();
  assert.equal(r.semaine, 0);
  assert.deepEqual(r.sessions, []);
});

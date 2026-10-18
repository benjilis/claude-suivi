#!/usr/bin/env node
'use strict';
// Ligne d'état Claude Code -> Claude Suivi.
// Claude Code lance ce script à chaque réponse et lui donne en entrée un JSON de session qui contient les
// limites du forfait (rate_limits : 5 h et 7 jours). On les transmet à l'appli locale (127.0.0.1:4777) :
// l'onglet « Usage » reste ainsi à jour tout seul, sans demander quoi que ce soit aux sessions.
// Silencieux en cas de souci (appli fermée, pas de limites…) : une ligne d'état ne doit jamais gêner.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FENETRES = [
  ['five_hour', '5-hour limit', '5 h'],
  ['seven_day', 'Weekly · all models', 'sem.'],
];
const PORT = Number(process.env.CLAUDE_SUIVI_PORT) || 4777;
const MEMO = process.env.CLAUDE_SUIVI_MEMO || path.join(os.tmpdir(), 'claude-suivi-statusline.json');
const REPETITION_MS = 5 * 60 * 1000; // renvoie même sans changement, pour garder la date de mise à jour fraîche

let entree = '';
const garde = setTimeout(() => process.exit(0), 4000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { entree += c; });
process.stdin.on('end', principal);
process.stdin.on('error', () => process.exit(0));

function principal() {
  let data;
  try { data = JSON.parse(entree); } catch { return fin(''); }
  const r = data && data.rate_limits;
  const limites = [];
  const texte = [];
  for (const [cle, label, court] of FENETRES) {
    const w = r && r[cle];
    if (!w || typeof w.used_percentage !== 'number') continue;
    const pct = Math.round(w.used_percentage * 10) / 10;
    limites.push({ label, percentUsed: pct, resetsAt: Number.isFinite(w.resets_at) ? new Date(w.resets_at * 1000).toISOString() : '' });
    texte.push(`${court} ${Math.round(pct)} %`);
  }
  if (!limites.length) return fin(''); // pas de forfait Pro/Max, ou pas encore de réponse
  const signature = JSON.stringify(limites.map((l) => [l.label, Math.round(l.percentUsed), l.resetsAt]));
  let memo = {};
  try { memo = JSON.parse(fs.readFileSync(MEMO, 'utf8')); } catch { /* premier passage */ }
  if (memo.signature === signature && Date.now() - memo.t < REPETITION_MS) return fin(texte.join(' · '));
  envoyer({ limites }, () => {
    try { fs.writeFileSync(MEMO, JSON.stringify({ signature, t: Date.now() })); } catch { /* sans importance */ }
    fin(texte.join(' · '));
  });
}

function envoyer(corps, apres) {
  const json = Buffer.from(JSON.stringify(corps), 'utf8');
  const req = http.request({
    host: '127.0.0.1', port: PORT, method: 'PUT', path: '/usage', timeout: 1500,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': json.length },
  }, (res) => { res.resume(); res.on('end', apres); });
  req.on('timeout', () => { req.destroy(); apres(); });
  req.on('error', () => apres()); // appli non lancée : tant pis, au prochain passage
  req.end(json);
}

function fin(texte) {
  clearTimeout(garde);
  if (texte) process.stdout.write(texte + '\n');
  process.exit(0);
}

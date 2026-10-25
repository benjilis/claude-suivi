'use strict';
// Génère build/icon.png (256x256) : le carré orange aux trois barres, comme l'icône de la zone de notification.
// Aucune dépendance : on écrit le PNG à la main. Usage : node build/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const T = 256;
const SS = 4; // sur-échantillonnage 4x4 pour des bords lisses
const ORANGE = [217, 119, 87];

// Couverture (0..1) d'un point (x, y) en unités de 0..T
function couleur(x, y) {
  const marge = 24, rayon = 62;
  const cx = Math.min(Math.max(x, marge + rayon), T - marge - rayon);
  const cy = Math.min(Math.max(y, marge + rayon), T - marge - rayon);
  const dansCarre = x >= marge && x <= T - marge && y >= marge && y <= T - marge && (x - cx) ** 2 + (y - cy) ** 2 <= rayon * rayon;
  if (!dansCarre) return null;
  const barre = [92, 124, 156].some((by) => y >= by && y < by + 20) && x >= 72 && x <= 184;
  return barre ? [255, 255, 255] : ORANGE;
}

const raw = Buffer.alloc((T * 4 + 1) * T);
for (let y = 0; y < T; y++) {
  raw[y * (T * 4 + 1)] = 0; // filtre « aucun »
  for (let x = 0; x < T; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = couleur(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (c) { r += c[0]; g += c[1]; b += c[2]; n++; }
      }
    }
    const i = y * (T * 4 + 1) + 1 + x * 4;
    if (n) { raw[i] = Math.round(r / n); raw[i + 1] = Math.round(g / n); raw[i + 2] = Math.round(b / n); raw[i + 3] = Math.round((255 * n) / (SS * SS)); }
  }
}

function morceau(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(T, 0); ihdr.writeUInt32BE(T, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  morceau('IHDR', ihdr),
  morceau('IDAT', zlib.deflateSync(raw, { level: 9 })),
  morceau('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log('build/icon.png écrit (' + png.length + ' octets)');

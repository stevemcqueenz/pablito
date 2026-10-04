// Open Graph images: every painting on its room's wall at 1200 × 630, nothing written on it,
// plus one image for the public pages: the entrance painting on gallery white.
//
//   node scripts/og.mjs            # all works, skipping ones already up to date
//   node scripts/og.mjs --force
//
// Files go to public/og/<artist>/<piece>.jpg and public/og/pablito.jpg, which are ignored by git
// and regenerated before every build.

import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hang } from './hang.mjs';
import { creditFor, showWeb } from './credit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(readFileSync(resolve(root, 'src/data/collection.json'), 'utf8'));
const force = process.argv.includes('--force');
const painter = (id) => collection.artists.find((a) => a.id === id) ?? (collection.exhibitions ?? []).flatMap((s) => s.guests ?? []).find((g) => g.id === id);

// Wide and shallow, so the painting keeps a margin of wall on every side even where a feed crops the card.
const CARD = { width: 1200, height: 630, box: [0.8, 0.78], centreY: 0.5 };
// The public pages share the painting the entrance opens on.
const ENTRANCE = { artist: 'hopper', piece: 'laundromat', wall: '#ffffff' };

function findImage(artistId, pieceId) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const p = resolve(root, 'src/art', artistId, `${pieceId}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

const fresh = (out, source) => !force && existsSync(out) && statSync(out).mtimeMs >= statSync(source).mtimeMs;

let made = 0, skipped = 0;
const jobs = [];
for (const artist of collection.artists) {
  for (const piece of artist.pieces) {
    const source = findImage(artist.id, piece.id);
    if (source) jobs.push({ source, wall: artist.wall, dir: resolve(root, 'public/og', artist.id), out: `${piece.id}.jpg`, meta: creditFor(artist, piece, 'share image') });
  }
}
for (const show of collection.exhibitions ?? []) {
  for (const work of show.works) {
    const artist = painter(work.artist);
    const source = findImage(`exhibitions/${show.id}`, artist.id);
    if (source) jobs.push({ source, wall: show.wall, dir: resolve(root, 'public/og/exhibitions', show.id), out: `${artist.id}.jpg`, meta: creditFor(artist, work, 'share image', showWeb(show, artist)) });
  }
}
const entrance = findImage(ENTRANCE.artist, ENTRANCE.piece);
if (entrance) {
  const a = collection.artists.find((x) => x.id === ENTRANCE.artist);
  jobs.push({ source: entrance, wall: ENTRANCE.wall, dir: resolve(root, 'public/og'), out: 'pablito.jpg', meta: creditFor(a, a.pieces.find((p) => p.id === ENTRANCE.piece), 'share image') });
}

for (const job of jobs) {
  mkdirSync(job.dir, { recursive: true });
  const out = resolve(job.dir, job.out);
  if (fresh(out, job.source)) { skipped++; continue; }
  await hang(job.source, job.wall, CARD, out, { quality: 84, credit: job.meta });
  made++;
}
console.log(`og: ${made} written, ${skipped} up to date`);

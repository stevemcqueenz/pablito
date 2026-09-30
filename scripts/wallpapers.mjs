// Hang every painting on its room's wall at phone and desktop sizes.
//
//   node scripts/wallpapers.mjs            # all works, skipping ones already up to date
//   node scripts/wallpapers.mjs klimt      # one room
//   node scripts/wallpapers.mjs klimt the-selfie --force
//
// Nothing is cropped and nothing is written on the wall. The painting keeps
// its proportions, sits on the room's wall colour, and the file goes to
// public/wallpapers/<artist>/<piece>-<size>.jpg, which is ignored by git and
// regenerated before every build.

import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hang } from './hang.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(readFileSync(resolve(root, 'src/data/collection.json'), 'utf8'));

// Canvas sizes, and where the painting sits on each.
//   box: the largest fraction of the canvas width and height the painting may take.
//   centreY: where the painting's vertical centre goes, as a fraction of the height.
//            Phones sit lower to leave the clock its room; desktops hang at eye line.
export const SIZES = {
  phone: { width: 1290, height: 2796, box: [0.86, 0.58], centreY: 0.56 },
  mac: { width: 3456, height: 2234, box: [0.78, 0.70], centreY: 0.50 },
  wide: { width: 3840, height: 2160, box: [0.78, 0.70], centreY: 0.50 },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const [onlyArtist, onlyPiece] = args.filter((a) => !a.startsWith('--'));

function findImage(artistId, pieceId) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const p = resolve(root, 'src/art', artistId, `${pieceId}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

let made = 0, skipped = 0;
for (const artist of collection.artists) {
  if (onlyArtist && artist.id !== onlyArtist) continue;
  for (const piece of artist.pieces) {
    if (onlyPiece && piece.id !== onlyPiece) continue;
    const source = findImage(artist.id, piece.id);
    if (!source) continue;
    const dir = resolve(root, 'public/wallpapers', artist.id);
    mkdirSync(dir, { recursive: true });
    for (const [name, size] of Object.entries(SIZES)) {
      const out = resolve(dir, `${piece.id}-${name}.jpg`);
      if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(source).mtimeMs) { skipped++; continue; }
      await hang(source, artist.wall, size, out);
      made++;
    }
  }
}
console.log(`wallpapers: ${made} written, ${skipped} up to date`);

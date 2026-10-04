// File a rendered painting or clip where the museum hangs it.
//
//   node scripts/ingest.mjs hopper laundromat /path/to/result.png          # a painting
//   node scripts/ingest.mjs hopper laundromat https://…/result.png         # from a URL
//   node scripts/ingest.mjs hopper laundromat result.png --trim            # trim a photographed margin
//   node scripts/ingest.mjs hopper laundromat clip.mp4 --motion            # a moving painting
//   node scripts/ingest.mjs hopper laundromat result.png --force           # replace what hangs
//   node scripts/ingest.mjs --show formation vermeer result.png            # a work in a show
//
// A painting is re-encoded as a progressive JPEG and gets the credit written into its
// EXIF and XMP (scripts/credit.mjs). --trim cuts away any even border the model painted
// around the canvas, so the museum shows the painting to its edge. A clip is filed as it
// came; set loopSeconds on the work in src/data/collection.json so its label can say it.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { credit, creditFor, showWeb } from './credit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(readFileSync(resolve(root, 'src/data/collection.json'), 'utf8'));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const showIdx = args.indexOf('--show');
const showId = showIdx >= 0 ? args[showIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--show');
const motion = flags.has('--motion');
const trim = flags.has('--trim');
const force = flags.has('--force');

let artist, piece, source, dir, out, web = null;
if (showId) {
  const show = (collection.exhibitions ?? []).find((s) => s.id === showId);
  if (!show) { console.error(`Unknown show "${showId}". Known: ${(collection.exhibitions ?? []).map((s) => s.id).join(', ')}`); process.exit(1); }
  const [artistId, src] = positional;
  artist = collection.artists.find((a) => a.id === artistId);
  piece = artist && show.works.find((w) => w.artist === artist.id);
  if (!piece) { console.error(`No work for "${artistId}" in ${show.id}. Known: ${show.works.map((w) => w.artist).join(', ')}`); process.exit(1); }
  source = src;
  dir = resolve(root, motion ? 'src/motion' : 'src/art', 'exhibitions', show.id);
  out = resolve(dir, `${artist.id}.${motion ? 'mp4' : 'jpg'}`);
  web = showWeb(show, artist);
} else {
  const [artistId, pieceId, src] = positional;
  artist = collection.artists.find((a) => a.id === artistId);
  if (!artist) { console.error(`Unknown painter "${artistId}". Known: ${collection.artists.map((a) => a.id).join(', ')}`); process.exit(1); }
  piece = artist.pieces.find((p) => p.id === pieceId);
  if (!piece) { console.error(`Unknown work "${pieceId}" in ${artist.id}. Known: ${artist.pieces.map((p) => p.id).join(', ')}`); process.exit(1); }
  source = src;
  dir = resolve(root, motion ? 'src/motion' : 'src/art', artist.id);
  out = resolve(dir, `${piece.id}.${motion ? 'mp4' : 'jpg'}`);
}
if (!source) { console.error('Give the rendered file: a path or a URL.'); process.exit(1); }
if (existsSync(out) && !force) { console.error(`${rel(out)} already hangs. Use --force to replace it.`); process.exit(1); }

const input = /^https?:\/\//.test(source)
  ? Buffer.from(await (await fetch(source).then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${source}`); return r; })).arrayBuffer())
  : readFileSync(source);

mkdirSync(dir, { recursive: true });

if (motion) {
  writeFileSync(out, input);
  console.log(`filed ${rel(out)} (${(input.length / 1e6).toFixed(1)} MB)`);
  if (!piece.loopSeconds) console.log(`set "loopSeconds" on the work in src/data/collection.json`);
} else {
  const before = await sharp(input).metadata();
  let image = sharp(input);
  if (trim) image = image.trim({ threshold: 24 });
  const jpeg = await image.jpeg({ quality: 92, progressive: true, mozjpeg: true }).toBuffer();
  const after = await sharp(jpeg).metadata();
  writeFileSync(out, credit(jpeg, creditFor(artist, piece, 'painting', web)));
  const trimmed = trim && (after.width !== before.width || after.height !== before.height) ? ` (trimmed from ${before.width}×${before.height})` : '';
  console.log(`hung ${rel(out)} ${after.width}×${after.height}${trimmed}, credit written`);
}

function rel(p) { return p.replace(root + '/', ''); }

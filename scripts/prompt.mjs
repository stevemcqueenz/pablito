// Print the brief for a work, with the Weave settings it is rendered at.
//
//   node scripts/prompt.mjs hopper             # the five Hopper commissions
//   node scripts/prompt.mjs vermeer video-call # one of them
//   node scripts/prompt.mjs hopper --json      # as JSON, for pasting into a run
//   node scripts/prompt.mjs --show formation   # every brief in a show
//   node scripts/prompt.mjs --show formation vermeer
//
// Paintings are rendered on Weave with GPT Image 2.5 (Flare, quality high), about 8 credits
// each, at the pixel size for the room's canvas proportion below, then filed with
// scripts/ingest.mjs.

import { readFileSync } from 'node:fs';

export const MODEL = { name: 'GPT Image 2.5', variant: 'Flare', quality: 'high', output_format: 'jpeg', credits: 8 };
// About 3 MP, every side a multiple of 16, which GPT Image requires.
export const DIMS = { '3:2': [2160, 1440], '4:5': [1600, 2000], '4:3': [2000, 1504], '1:1': [1728, 1728], '2:3': [1440, 2160], '16:9': [2304, 1296] };

const c = JSON.parse(readFileSync(new URL('../src/data/collection.json', import.meta.url)));
const args = process.argv.slice(2);
const json = args.includes('--json');
const showIdx = args.indexOf('--show');
const showId = showIdx >= 0 ? args[showIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--show');

// Each entry: the painter, the work, and the id the work is filed under.
let jobs;
if (showId) {
  const show = (c.exhibitions ?? []).find((s) => s.id === showId);
  if (!show) { console.error(`Unknown show "${showId}". Known: ${(c.exhibitions ?? []).map((s) => s.id).join(', ')}`); process.exit(1); }
  const [only] = positional;
  const order = (w) => c.artists.findIndex((a) => a.id === w.artist);
  jobs = [...show.works].sort((a, b) => order(a) - order(b)).filter((w) => !only || w.artist === only)
    .map((w) => ({ artist: c.artists.find((a) => a.id === w.artist), piece: w, filed: `exhibitions/${show.id}/${w.artist}` }));
  if (!jobs.length) { console.error(`No work for "${only}" in ${show.id}`); process.exit(1); }
} else {
  const [artistId, pieceId] = positional;
  const artist = c.artists.find((a) => a.id === artistId);
  if (!artist) { console.error(`Unknown painter "${artistId}". Known: ${c.artists.map((a) => a.id).join(', ')}`); process.exit(1); }
  const pieces = pieceId ? artist.pieces.filter((p) => p.id === pieceId) : artist.pieces;
  if (!pieces.length) { console.error(`Unknown work "${pieceId}"`); process.exit(1); }
  jobs = pieces.map((p) => ({ artist, piece: p, filed: `${artist.id}/${p.id}` }));
}

for (const { artist, piece: p, filed } of jobs) {
  const [width, height] = DIMS[artist.aspect] ?? DIMS['3:2'];
  const prompt = `${p.subject}. ${artist.styleBrief}. ${artist.renderSuffix}.`;
  if (json) {
    console.log(JSON.stringify({ filed, artist: artist.id, title: p.title, prompt, model: MODEL.variant, quality: MODEL.quality, image_size: { width, height }, output_format: MODEL.output_format }));
    continue;
  }
  console.log(`# ${artist.name} — ${p.title} [${artist.aspect}, ${width}×${height}] → ${filed}`);
  console.log(`# Weave: ${MODEL.name} · ${MODEL.variant} · quality ${MODEL.quality} · ${MODEL.output_format} · ~${MODEL.credits} credits`);
  console.log(prompt);
  console.log();
}

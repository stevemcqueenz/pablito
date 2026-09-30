// Print the generation prompt for a piece: node scripts/prompt.mjs hopper laundromat
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync(new URL('../src/data/collection.json', import.meta.url)));
const [artistId, pieceId] = process.argv.slice(2);
const artist = c.artists.find((a) => a.id === artistId);
if (!artist) { console.error('unknown artist'); process.exit(1); }
const pieces = pieceId ? artist.pieces.filter((p) => p.id === pieceId) : artist.pieces;
for (const p of pieces) {
  console.log(`# ${artist.name} — ${p.title} [${artist.aspect}]`);
  console.log(`${p.subject}. ${artist.styleBrief}. ${artist.renderSuffix}.`);
  console.log();
}

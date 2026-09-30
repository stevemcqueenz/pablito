// Render commissioned pieces with Flux Pro 1.1 Ultra on fal.ai and save them
// where the site picks them up.
//
//   node scripts/render.mjs hopper                 # every piece in the wing
//   node scripts/render.mjs hopper laundromat      # one piece
//   node scripts/render.mjs hopper --wallpaper     # 16:9 wallpaper variants
//   node scripts/render.mjs hopper --force         # re-render existing files
//   node scripts/render.mjs hopper --seed 1234     # reproducible
//   node scripts/render.mjs hopper --model gpt-image-1.5   # pick a generator
//
// Needs FAL_KEY in the environment. Cost is roughly $0.06 per image on the
// default model; see MODELS below for the others.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Pixel sizes per aspect for models that take width/height (about 3 MP).
// Every side is a multiple of 16, which GPT Image requires.
const DIMS = { '3:2': [2160, 1440], '4:5': [1600, 2000], '4:3': [2000, 1504], '1:1': [1728, 1728], '2:3': [1440, 2160], '16:9': [2304, 1296] };
// Flux 1.1 Ultra only takes 21:9 16:9 4:3 3:2 1:1 2:3 3:4 9:16 9:21. Map the rest.
const ULTRA_ASPECT = { '3:2': '3:2', '4:5': '3:4', '4:3': '4:3', '1:1': '1:1', '2:3': '2:3', '16:9': '16:9' };

// Each entry: fal endpoint plus a function turning (prompt, aspect, seed) into a request body.
const MODELS = {
  'flux-1.1-ultra': ['fal-ai/flux-pro/v1.1-ultra', (prompt, aspect, seed) =>
    ({ prompt, aspect_ratio: ULTRA_ASPECT[aspect] ?? '3:2', output_format: 'jpeg', safety_tolerance: '2', raw: false, ...(seed !== undefined ? { seed } : {}) })],
  'flux-2-max': ['fal-ai/flux-2-max', (prompt, aspect, seed) =>
    ({ prompt, image_size: { width: DIMS[aspect][0], height: DIMS[aspect][1] }, output_format: 'jpeg', ...(seed !== undefined ? { seed } : {}) })],
  'nano-banana-pro': ['fal-ai/nano-banana-pro', (prompt, aspect) =>
    ({ prompt, aspect_ratio: aspect, resolution: '2K', output_format: 'jpeg' })],
  // Flare is OpenAI's fast variant; Sunburst is slower and tuned for product imagery. Sizes are free-form up to 3840px.
  'gpt-image-2.5': ['openai/gpt-image-2.5/flare/text-to-image', (prompt, aspect) =>
    ({ prompt, image_size: { width: DIMS[aspect][0], height: DIMS[aspect][1] }, quality: 'high', output_format: 'jpeg' })],
  // Only 1024x1024, 1536x1024 and 1024x1536 exist, so every landscape aspect becomes 3:2 and every portrait one 2:3.
  'gpt-image-1.5': ['fal-ai/gpt-image-1.5', (prompt, aspect) =>
    ({ prompt, image_size: aspect === '1:1' ? '1024x1024' : DIMS[aspect][0] > DIMS[aspect][1] ? '1536x1024' : '1024x1536', quality: 'high', output_format: 'jpeg' })],
  'seedream-4.5': ['fal-ai/bytedance/seedream/v4.5/text-to-image', (prompt, aspect, seed) =>
    ({ prompt, image_size: { width: DIMS[aspect][0], height: DIMS[aspect][1] }, ...(seed !== undefined ? { seed } : {}) })],
};
const DEFAULT_MODEL = 'flux-1.1-ultra';

const key = process.env.FAL_KEY;
if (!key) { console.error('FAL_KEY is not set. Add it to the environment secrets.'); process.exit(1); }

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const seedIdx = args.indexOf('--seed');
const seed = seedIdx >= 0 ? Number(args[seedIdx + 1]) : undefined;
const modelIdx = args.indexOf('--model');
const modelName = modelIdx >= 0 ? args[modelIdx + 1] : DEFAULT_MODEL;
if (!MODELS[modelName]) { console.error(`Unknown model "${modelName}". Known: ${Object.keys(MODELS).join(', ')}`); process.exit(1); }
const [ENDPOINT, buildBody] = MODELS[modelName];
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--seed' && args[i - 1] !== '--model');
const [artistId, pieceId] = positional;
const wallpaper = flags.has('--wallpaper');
const force = flags.has('--force');

const collection = JSON.parse(readFileSync(new URL('../src/data/collection.json', import.meta.url)));
const artist = collection.artists.find((a) => a.id === artistId);
if (!artist) { console.error(`Unknown artist "${artistId}". Known: ${collection.artists.map((a) => a.id).join(', ')}`); process.exit(1); }
const pieces = pieceId ? artist.pieces.filter((p) => p.id === pieceId) : artist.pieces;
if (!pieces.length) { console.error(`Unknown piece "${pieceId}"`); process.exit(1); }

const outDir = resolve(new URL('../src/art/', import.meta.url).pathname, artist.id);
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fal(path, init) {
  const res = await fetch(path, { ...init, headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}: ${await res.text()}`);
  return res.json();
}

async function render(prompt, aspect) {
  const submit = await fal(`https://queue.fal.run/${ENDPOINT}`, { method: 'POST', body: JSON.stringify(buildBody(prompt, aspect, seed)) });
  process.stdout.write(`req=${submit.request_id} … `);
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = await fal(submit.status_url);
    if (status.status === 'COMPLETED') break;
    if (status.status === 'FAILED') throw new Error(`fal run failed: ${JSON.stringify(status)}`);
  }
  const result = await fal(submit.response_url);
  const image = result.images?.[0];
  if (!image?.url) throw new Error(`No image in response: ${JSON.stringify(result)}`);
  const bytes = Buffer.from(await (await fetch(image.url)).arrayBuffer());
  return { bytes, width: image.width, height: image.height, seed: result.seed };
}

for (const piece of pieces) {
  const file = resolve(outDir, `${piece.id}${wallpaper ? '.wallpaper' : ''}.jpg`);
  if (existsSync(file) && !force) { console.log(`skip   ${artist.id}/${piece.id}${wallpaper ? ' (wallpaper)' : ''} — exists, use --force`); continue; }
  const subject = wallpaper ? `${piece.subject}, wide panoramic composition with room at the sides` : piece.subject;
  const prompt = `${subject}. ${artist.styleBrief}. ${artist.renderSuffix}.`;
  const aspect = wallpaper ? '16:9' : artist.aspect in DIMS ? artist.aspect : '3:2';
  process.stdout.write(`render ${artist.id}/${piece.id}${wallpaper ? ' (wallpaper)' : ''} [${modelName} ${aspect}] … `);
  try {
    const { bytes, width, height, seed: usedSeed } = await render(prompt, aspect);
    writeFileSync(file, bytes);
    console.log(`${width ?? '?'}x${height ?? '?'} seed=${usedSeed ?? '-'} → ${file.replace(process.cwd() + '/', '')}`);
  } catch (err) {
    console.log('failed');
    console.error(`  ${err.message}`);
  }
}

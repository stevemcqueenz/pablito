// A short silent film of the museum, for sharing: the entrance painting, one wall text, then a walk
// through the rooms in the order the painters were born, each painting whole on its room's wall.
//
//   node scripts/film.mjs            # both cuts
//   node scripts/film.mjs wide       # 1920 × 1080 only
//   node scripts/film.mjs tall       # 1080 × 1920 only
//
// Needs ffmpeg and a headless Chromium (for the type, set in the site's own fonts):
//   FFMPEG=/path/to/ffmpeg CHROME=/path/to/chrome node scripts/film.mjs
// Work files go to $FILM_WORK (default: a folder in the system temp directory).
// The films go to docs/film/pablito.mp4 and docs/film/pablito-vertical.mp4.
//
// The film is cut to the museum's rules:
// - Only two things move: the paintings' own clips, and text, which only fades, in 400 ms.
// - Every painting is shown whole, at its own proportions, on its room's wall, with its label
//   in the room's ink, the way scripts/hang.mjs and the site hang it.
// - A moving painting shows its still first. The clip then begins on its first frame, which is
//   the still, so the painting comes alive in place.
// - Rooms change on a hard cut; the change of wall is the transition. Only the head and the
//   tail fade, from and to black.
// - No sound.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { museum, artists } = JSON.parse(readFileSync(resolve(root, 'src/data/collection.json'), 'utf8'));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || 'chromium';
const WORK = process.env.FILM_WORK || join(tmpdir(), 'pablito-film');
const OUT = resolve(root, 'docs/film');
const FPS = 24;

// The house colours: the rooms' two inks and the public spaces' white (see Museum.astro).
const INK = { light: '#f2f1ed', dark: '#141414' };
const MUTED_ON_WHITE = '#5b5b5b';
const BLACK = '#000000';
const GALLERY = '#f5f4f0';
const TEXT_FADE = 0.4;   // text fades in and out, never faster or slower
const WAKE = 0.25;       // the still gives way to the clip's first frame, which is the same picture

// The film. Seconds throughout.
//   room + piece: a painting on its room's wall with its label. With `clip`, the still holds for
//   `still` seconds and the painting then moves for `clip` seconds; without, it holds for `seconds`.
//   beside: sentences of the museum's own text set beside the painting, each fading in at `at`.
//   card: text alone, on black or on a wall.
const FILM = [
  { black: 0.5 },
  { card: [{ text: museum.tagline, role: 'tagline', at: 0.1, until: 4.0 }], wall: BLACK, ink: INK.light, seconds: 4.5 },
  { black: 0.3 },
  // The entrance opens on the painting the site opens on. Its clip's life (the tubes flickering on,
  // the page turning) is all in the first five seconds; after that only the view creeps closer.
  { room: 'hopper', piece: 'laundromat', still: 1.5, clip: 5, fadeIn: 0.4 },
  // What the museum is, said once, beside a painting that shows it.
  { room: 'vermeer', piece: 'video-call', seconds: 9.5, beside: [
    { text: 'Twenty-five painters, each given a studio in the present day.', at: 0.8 },
    { text: 'Nothing here reproduces an existing work.', at: 3.4 },
    { text: 'The painter’s name is never in the prompt.', at: 6.0 },
  ] },
  // The walk, in the order the painters were born.
  { room: 'bruegel', piece: 'ikea-saturday', seconds: 4.5 },
  { room: 'goya', piece: 'livestream', still: 1.5, clip: 4.5 },
  { room: 'monet', piece: 'solar-morning', seconds: 4.5 },
  { room: 'af-klint', piece: 'network', still: 1.5, clip: 4.5 },
  { room: 'toulouse-lautrec', piece: 'dj', seconds: 4.5 },
  { room: 'mondrian', piece: 'metro', still: 1.5, clip: 4.5 },
  { room: 'kahlo', piece: 'commuter', still: 1.5, clip: 4.5 },
  { room: 'basquiat', piece: 'gig-worker', seconds: 4.5 },
  // The way in.
  { card: [
    { text: museum.name, role: 'wordmark', at: 0.5 },
    { text: 'stevemcqueenz.github.io/pablito', role: 'address', at: 1.1 },
  ], wall: GALLERY, ink: INK.dark, seconds: 6.2, fadeOut: 0.6 },
  { black: 0.6 },
];

// Two cuts. A painting's box is the most room it may take; every painting is scaled to fit it,
// uncropped, and centred on the eye line, with its label beneath, flush with its left edge.
const FORMATS = {
  wide: {
    width: 1920, height: 1080, file: 'pablito.mp4',
    box: { w: 1400, h: 740 }, eye: 482, labelGap: 26,
    // Beside: the painting moves left, the text stands to its right, its last line level with the painting's foot.
    beside: { h: 740, gap: 80, textW: 600 },
    type: {
      who: [26, 32], what: [32, 40], statement: [44, 58], tagline: [46, 60], taglineW: 1400,
      wordmark: [84, 96], address: [26, 34],
    },
  },
  tall: {
    width: 1080, height: 1920, file: 'pablito-vertical.mp4',
    box: { w: 920, h: 1150 }, eye: 880, labelGap: 28,
    // Beside, on a phone, is beneath: the painting higher and smaller, the text below its label.
    beside: { h: 860, top: 190, gap: 96, textW: 900 },
    type: {
      who: [30, 38], what: [37, 46], statement: [48, 62], tagline: [54, 68], taglineW: 860,
      wordmark: [96, 110], address: [30, 38],
    },
  },
};

const wanted = process.argv.slice(2).filter((a) => FORMATS[a]);
const formats = wanted.length ? wanted : Object.keys(FORMATS);

const frames = (s) => Math.round(s * FPS);
const secs = (s) => (frames(s) / FPS).toFixed(4);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

function artistOf(id) {
  const a = artists.find((x) => x.id === id);
  if (!a) throw new Error(`No room for ${id}`);
  return a;
}
function findImage(artistId, pieceId) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const p = resolve(root, 'src/art', artistId, `${pieceId}.${ext}`);
    if (existsSync(p)) return p;
  }
  throw new Error(`No painting at src/art/${artistId}/${pieceId}`);
}
const motionOf = (artistId, pieceId) => resolve(root, 'src/motion', artistId, `${pieceId}.mp4`);

// Where a painting hangs in a frame.
function place(fmt, shot, meta) {
  const r = meta.width / meta.height;
  if (shot.beside) {
    const b = fmt.beside;
    const h = b.h, w = Math.round(h * r);
    if (fmt === FORMATS.wide) {
      const x = Math.round((fmt.width - (w + b.gap + b.textW)) / 2);
      const y = Math.round(fmt.eye - h / 2);
      return { x, y, w, h };
    }
    return { x: Math.round((fmt.width - w) / 2), y: b.top, w, h };
  }
  const scale = Math.min(fmt.box.w / meta.width, fmt.box.h / meta.height);
  const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
  return { x: Math.round((fmt.width - w) / 2), y: Math.round(fmt.eye - h / 2), w, h };
}

// ---------- Type ----------
// Set once per cut in a headless Chromium with the site's own variable fonts, as transparent layers,
// all on one page (a grid of frames) so the browser starts once.

const fontDir = resolve(root, 'node_modules/@fontsource-variable');
const FONT_CSS = `
@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 200 800; src: url(${pathToFileURL(join(fontDir, 'newsreader/files/newsreader-latin-opsz-normal.woff2'))}) format('woff2'); }
@font-face { font-family: 'Newsreader'; font-style: italic; font-weight: 200 800; src: url(${pathToFileURL(join(fontDir, 'newsreader/files/newsreader-latin-opsz-italic.woff2'))}) format('woff2'); }
@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; src: url(${pathToFileURL(join(fontDir, 'archivo/files/archivo-latin-wdth-normal.woff2'))}) format('woff2'); }
`;

function style(fmt, role, ink) {
  const [size, lead] = fmt.type[role];
  const serif = (opsz, extra = '') => `font-family:'Newsreader';font-weight:400;font-variation-settings:'opsz' ${opsz};font-size:${size}px;line-height:${lead}px;color:${ink};${extra}`;
  const sans = (weight, colour = ink) => `font-family:'Archivo';font-weight:${weight};font-size:${size}px;line-height:${lead}px;color:${colour};`;
  switch (role) {
    // The tombstone: "In the manner of" in Archivo semibold, the title in Newsreader italic, then the year.
    case 'who': return sans(600);
    case 'what': return serif(18, 'margin-top:4px;');
    // What the curator says: Newsreader, set as a wall text.
    case 'statement': return serif(20, 'text-wrap:balance;margin:0 0 14px;');
    case 'tagline': return serif(36, 'text-wrap:balance;text-align:center;');
    case 'wordmark': return serif(72, 'font-style:italic;text-align:center;');
    case 'address': return sans(400, MUTED_ON_WHITE) + 'text-align:center;margin-top:18px;';
  }
}

// Each layer is one frame's worth of text; returns HTML positioned inside a frame-sized band.
function labelLayer(fmt, artist, piece, at) {
  const ink = INK[artist.ink];
  return `<div style="position:absolute;left:${at.x}px;top:${at.y + at.h + fmt.labelGap}px;width:${Math.max(at.w, 700)}px">
    <p style="margin:0;${style(fmt, 'who', ink)}">In the manner of ${esc(artist.name)}</p>
    <p style="margin:0;${style(fmt, 'what', ink)}"><i>${esc(piece.title)}</i>, 2026</p></div>`;
}
function besideLayer(fmt, artist, at, lines, show) {
  const ink = INK[artist.ink];
  const b = fmt.beside;
  const paras = lines.map((l, i) => `<p style="${style(fmt, 'statement', ink)}visibility:${i === show ? 'visible' : 'hidden'}">${esc(l.text)}</p>`).join('');
  if (fmt === FORMATS.wide) {
    // Bottom-aligned with the painting's foot, the way the site's piece page sets its label.
    return `<div style="position:absolute;left:${at.x + at.w + b.gap}px;bottom:${fmt.height - (at.y + at.h) - 14}px;width:${b.textW}px">${paras}</div>`;
  }
  const top = at.y + at.h + fmt.labelGap + fmt.type.who[1] + fmt.type.what[1] + 4 + b.gap;
  // On one left edge with the painting and its label.
  return `<div style="position:absolute;left:${at.x}px;top:${top}px;width:${Math.min(b.textW, fmt.width - at.x - 72)}px">${paras}</div>`;
}
function cardLayer(fmt, lines, ink, show) {
  const items = lines.map((l, i) => `<p style="margin:0;${style(fmt, l.role, ink)}visibility:${i === show ? 'visible' : 'hidden'}">${esc(l.text)}</p>`).join('');
  return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="max-width:${fmt.type.taglineW}px">${items}</div></div>`;
}

async function setType(fmt, layers, dir) {
  const cols = Math.ceil(Math.sqrt(layers.length));
  const rows = Math.ceil(layers.length / cols);
  const bands = layers.map((l, i) => `<section style="position:absolute;overflow:hidden;left:${(i % cols) * fmt.width}px;top:${Math.floor(i / cols) * fmt.height}px;width:${fmt.width}px;height:${fmt.height}px">${l.html}</section>`).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
    html, body { margin: 0; background: transparent; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-kerning: normal; font-variant-numeric: lining-nums; }
    p { margin: 0; }
  </style></head><body>${bands}</body></html>`;
  const page = join(dir, 'type.html');
  const shot = join(dir, 'type.png');
  writeFileSync(page, html);
  execFileSync(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--window-size=${cols * fmt.width},${rows * fmt.height}`,
    '--virtual-time-budget=5000', `--screenshot=${shot}`, pathToFileURL(page).href,
  ], { stdio: 'ignore' });
  const meta = await sharp(shot).metadata();
  if (meta.width !== cols * fmt.width || meta.height !== rows * fmt.height) throw new Error(`Type sheet came back ${meta.width} × ${meta.height}`);
  for (const [i, l] of layers.entries()) {
    await sharp(shot).extract({ left: (i % cols) * fmt.width, top: Math.floor(i / cols) * fmt.height, width: fmt.width, height: fmt.height }).png().toFile(l.file);
  }
}

// ---------- The handoff ----------
// A clip is a little darker than its still (the video encode). Measure the difference on the first
// frame and lift the clip by it, so nothing shifts when the painting starts to move.
const offsets = new Map();
async function clipOffset(artistId, pieceId, dir) {
  const key = `${artistId}/${pieceId}`;
  if (offsets.has(key)) return offsets.get(key);
  const first = join(dir, `first-${artistId}-${pieceId}.png`);
  run(['-i', motionOf(artistId, pieceId), '-vf', 'scale=in_color_matrix=bt601:in_range=tv,format=rgb24', '-frames:v', '1', first]);
  const m = await sharp(first).metadata();
  const c = await sharp(first).removeAlpha().raw().toBuffer();
  const s = await sharp(findImage(artistId, pieceId)).resize(m.width, m.height, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const sum = [0, 0, 0];
  for (let i = 0; i < s.length; i++) sum[i % 3] += s[i] - c[i];
  const n = s.length / 3;
  const off = sum.map((v) => Math.round(v / n));
  offsets.set(key, off);
  return off;
}

// ---------- Shots ----------

async function build(name) {
  const fmt = FORMATS[name];
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });

  // First pass: what each shot needs, and every text layer.
  const layers = [];
  const plans = [];
  for (const [i, shot] of FILM.entries()) {
    const id = String(i).padStart(2, '0');
    if (shot.black) { plans.push({ id, black: shot.black }); continue; }
    if (shot.card) {
      const texts = shot.card.map((l, k) => {
        const file = join(dir, `${id}-card-${k}.png`);
        layers.push({ file, html: cardLayer(fmt, shot.card, shot.ink, k) });
        return { file, at: l.at, until: l.until };
      });
      plans.push({ id, seconds: shot.seconds, wall: shot.wall, texts, fadeOut: shot.fadeOut });
      continue;
    }
    const artist = artistOf(shot.room);
    const piece = artist.pieces.find((p) => p.id === shot.piece);
    const source = findImage(artist.id, piece.id);
    const at = place(fmt, shot, await sharp(source).metadata());
    const label = join(dir, `${id}-label.png`);
    layers.push({ file: label, html: labelLayer(fmt, artist, piece, at) });
    const texts = (shot.beside || []).map((l, k) => {
      const file = join(dir, `${id}-beside-${k}.png`);
      layers.push({ file, html: besideLayer(fmt, artist, at, shot.beside, k) });
      return { file, at: l.at, until: l.until };
    });
    const seconds = shot.clip ? shot.still + shot.clip : shot.seconds;
    plans.push({ id, artist, piece, source, at, label, texts, seconds, still: shot.still, clip: shot.clip, fadeIn: shot.fadeIn, fadeOut: shot.fadeOut });
  }
  await setType(fmt, layers, dir);

  // Second pass: one lossless segment per shot.
  const segments = [];
  for (const p of plans) {
    const seg = join(dir, `${p.id}.mkv`);
    segments.push(seg);
    if (p.black) {
      run(['-f', 'lavfi', '-i', `color=c=black:s=${fmt.width}x${fmt.height}:r=${FPS}`, '-t', secs(p.black),
        '-vf', 'format=rgb24', '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', seg]);
      continue;
    }
    const base = join(dir, `${p.id}-wall.png`);
    const wall = p.wall || p.artist.wall;
    const over = [];
    if (p.source) {
      const painting = await sharp(p.source).resize(p.at.w, p.at.h, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().toBuffer();
      over.push({ input: painting, left: p.at.x, top: p.at.y }, { input: p.label, left: 0, top: 0 });
    }
    await sharp({ create: { width: fmt.width, height: fmt.height, channels: 3, background: wall } }).composite(over).removeAlpha().png().toFile(base);

    const T = secs(p.seconds);
    const inputs = ['-loop', '1', '-framerate', String(FPS), '-t', T, '-i', base];
    const graph = [`[0:v]format=rgb24[v0]`];
    let last = 'v0', n = 1;
    if (p.clip) {
      const [dr, dg, db] = await clipOffset(p.artist.id, p.piece.id, dir);
      inputs.push('-i', motionOf(p.artist.id, p.piece.id));
      graph.push(`[${n}:v]fps=${FPS},trim=duration=${secs(p.clip)},setpts=PTS-STARTPTS,` +
        `scale=${p.at.w}:${p.at.h}:flags=lanczos:in_color_matrix=bt601:in_range=tv,format=rgb24,` +
        `lutrgb=r='clip(val+${dr},0,255)':g='clip(val+${dg},0,255)':b='clip(val+${db},0,255)',` +
        `format=rgba,fade=t=in:st=0:d=${WAKE}:alpha=1,setpts=PTS+${secs(p.still)}/TB[c]`);
      graph.push(`[${last}][c]overlay=x=${p.at.x}:y=${p.at.y}:format=rgb:eof_action=repeat[v${n}]`);
      last = `v${n}`; n++;
    }
    for (const t of p.texts) {
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', T, '-i', t.file);
      let f = `[${n}:v]format=rgba,fade=t=in:st=${secs(t.at)}:d=${TEXT_FADE}:alpha=1`;
      if (t.until != null) f += `,fade=t=out:st=${secs(t.until)}:d=${TEXT_FADE}:alpha=1`;
      graph.push(`${f}[t${n}]`);
      graph.push(`[${last}][t${n}]overlay=0:0:format=rgb[v${n}]`);
      last = `v${n}`; n++;
    }
    const tail = [];
    if (p.fadeIn) tail.push(`fade=t=in:st=0:d=${secs(p.fadeIn)}`);
    if (p.fadeOut) tail.push(`fade=t=out:st=${secs(p.seconds - p.fadeOut)}:d=${secs(p.fadeOut)}`);
    graph.push(`[${last}]${tail.length ? tail.join(',') + ',' : ''}format=rgb24[out]`);
    run([...inputs, '-filter_complex', graph.join(';'), '-map', '[out]', '-t', T, '-r', String(FPS),
      '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', seg]);
  }

  // Join, and encode once, for the web: H.264, BT.709, 4:2:0, no audio track.
  const list = join(dir, 'segments.txt');
  writeFileSync(list, segments.map((s) => `file '${s}'`).join('\n') + '\n');
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, fmt.file);
  run(['-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-r', String(FPS),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-an', out]);
  const total = plans.reduce((s, p) => s + frames(p.black || p.seconds), 0) / FPS;
  console.log(`film: ${fmt.file}, ${total.toFixed(2)} s`);
}

for (const name of formats) await build(name);

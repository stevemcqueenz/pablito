// Hang one painting on a wall: the painting keeps its proportions, is scaled to fit its box,
// and is placed on a canvas of the wall colour. Nothing is cropped and nothing is written on it,
// but the credit goes inside the file.
//   size: { width, height, box: [fraction of width, fraction of height], centreY: fraction of height }
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { credit } from './credit.mjs';

export async function hang(source, wall, size, out, { quality = 86, credit: words = null } = {}) {
  const { width: cw, height: ch, box, centreY } = size;
  const meta = await sharp(source).metadata();
  const scale = Math.min((cw * box[0]) / meta.width, (ch * box[1]) / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const left = Math.round((cw - w) / 2);
  const top = Math.round(ch * centreY - h / 2);
  const painting = await sharp(source).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  const jpeg = await sharp({ create: { width: cw, height: ch, channels: 3, background: wall } })
    .composite([{ input: painting, left, top }])
    .jpeg({ quality, progressive: true })
    .toBuffer();
  // credit: the words to write into the file (see credit.mjs); without them the file carries none.
  writeFileSync(out, words ? credit(jpeg, words) : jpeg);
}

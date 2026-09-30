// Hang one painting on a wall: the painting keeps its proportions, is scaled to fit its box,
// and is placed on a canvas of the wall colour. Nothing is cropped and nothing is written on it.
//   size: { width, height, box: [fraction of width, fraction of height], centreY: fraction of height }
import sharp from 'sharp';

export async function hang(source, wall, size, out, { quality = 86 } = {}) {
  const { width: cw, height: ch, box, centreY } = size;
  const meta = await sharp(source).metadata();
  const scale = Math.min((cw * box[0]) / meta.width, (ch * box[1]) / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const left = Math.round((cw - w) / 2);
  const top = Math.round(ch * centreY - h / 2);
  const painting = await sharp(source).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  await sharp({ create: { width: cw, height: ch, channels: 3, background: wall } })
    .composite([{ input: painting, left, top }])
    .jpeg({ quality, progressive: true })
    .toFile(out);
}

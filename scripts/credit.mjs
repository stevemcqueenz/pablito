// Put the credit inside the file. Every painting, wallpaper and share image carries EXIF and XMP
// saying what it is: its title, whose manner it is in, who curated it, where it lives, and that it
// is a generated image (the IPTC digital source type for that). Screenshots lose it; saved files keep it.
//
//   node scripts/credit.mjs            # write the credit into every painting in src/art, losslessly
//   node scripts/credit.mjs --show hopper/laundromat
//
// The JPEG data itself is never re-encoded here: only the metadata segments are replaced.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import piexif from 'piexifjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(readFileSync(resolve(root, 'src/data/collection.json'), 'utf8'));

export const SITE = 'https://stevemcqueenz.github.io/pablito/';
export const CURATOR = 'Stanislav Kulik';
const YEAR = 2026;

/** The words for one work. kind: 'painting' | 'wallpaper' | 'share image'. */
export function creditFor(artist, piece, kind = 'painting') {
  const manner = `in the manner of ${artist.name}`;
  const what = kind === 'painting' ? '' : kind === 'wallpaper' ? ' Wallpaper:' : ' Link preview:';
  return {
    title: piece.title,
    creator: `${collection.museum.name}, curated by ${CURATOR}`,
    description: `${what ? what.trim() + ' ' : ''}${piece.title}, ${manner}. A new work commissioned to a written brief and rendered with an image model for ${collection.museum.name}, ${collection.museum.tagline.replace(/\.$/, '').toLowerCase()}. No painting by ${artist.name} is reproduced.`,
    rights: `© ${YEAR} ${CURATOR}. ${piece.title[0].toUpperCase()}${piece.title.slice(1)}, ${manner}. ${SITE}${artist.id}/${piece.id}/`,
    web: `${SITE}${artist.id}/${piece.id}/`,
  };
}

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/©/g, '(c)').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?');
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function xmpPacket(m) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    photoshop:Credit="${xml(collection.museum.name)}"
    xmpRights:Marked="True"
    xmpRights:WebStatement="${xml(m.web)}">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(m.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xml(m.creator)}</rdf:li></rdf:Seq></dc:creator>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xml(m.rights)}</rdf:li></rdf:Alt></dc:rights>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(m.description)}</rdf:li></rdf:Alt></dc:description>
   <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';

/** Split a JPEG into its leading marker segments and the rest (from the first non-APP/COM segment on). */
function segments(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  const segs = [];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (!isApp && marker !== 0xfe) break;
    const len = buf.readUInt16BE(i + 2);
    segs.push({ marker, start: i, end: i + 2 + len });
    i += 2 + len;
  }
  return { segs, rest: i };
}

/** Return the JPEG with the given EXIF and XMP in place of any it had. Pixel data is untouched. */
export function credit(buf, m) {
  // 1. EXIF, via piexif, into a copy stripped of any earlier EXIF.
  const zeroth = {
    [piexif.ImageIFD.ImageDescription]: ascii(m.description),
    [piexif.ImageIFD.Artist]: ascii(m.creator),
    [piexif.ImageIFD.Copyright]: ascii(m.rights),
  };
  const exif = piexif.dump({ '0th': zeroth, Exif: {}, GPS: {} });
  let out = Buffer.from(piexif.insert(exif, piexif.remove(buf.toString('binary'))), 'binary');
  // 2. XMP: drop any old packet, then add ours right after the EXIF segment.
  const { segs } = segments(out);
  const isXmp = (s) => s.marker === 0xe1 && out.toString('binary', s.start + 4, s.start + 4 + XMP_NS.length) === XMP_NS;
  const keep = segs.filter((s) => !isXmp(s));
  const exifSeg = keep.find((s) => s.marker === 0xe1 && out.toString('binary', s.start + 4, s.start + 10) === 'Exif\0\0');
  const payload = Buffer.concat([Buffer.from(XMP_NS, 'binary'), Buffer.from(xmpPacket(m), 'utf8')]);
  const seg = Buffer.alloc(4 + payload.length);
  seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(payload.length + 2, 2); payload.copy(seg, 4);
  const parts = [out.subarray(0, 2)];
  let inserted = false;
  for (const s of keep) {
    parts.push(out.subarray(s.start, s.end));
    if (s === exifSeg) { parts.push(seg); inserted = true; }
  }
  if (!inserted) parts.push(seg);
  const firstRemoved = segs.find(isXmp);
  parts.push(out.subarray(segments(out).rest));
  void firstRemoved;
  return Buffer.concat(parts);
}

/** Read the credit back, for checking. */
export function readCredit(buf) {
  const ex = piexif.load(buf.toString('binary'));
  const z = ex['0th'] || {};
  const { segs } = segments(buf);
  const x = segs.find((s) => s.marker === 0xe1 && buf.toString('binary', s.start + 4, s.start + 4 + XMP_NS.length) === XMP_NS);
  return {
    exif: { description: z[piexif.ImageIFD.ImageDescription], artist: z[piexif.ImageIFD.Artist], copyright: z[piexif.ImageIFD.Copyright] },
    xmp: x ? buf.toString('utf8', x.start + 4 + XMP_NS.length, x.end) : null,
  };
}

function findImage(artistId, pieceId) {
  for (const ext of ['jpg', 'jpeg']) {
    const p = resolve(root, 'src/art', artistId, `${pieceId}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const show = args.indexOf('--show');
  if (show >= 0) {
    const [a, p] = args[show + 1].split('/');
    const file = findImage(a, p);
    const r = readCredit(readFileSync(file));
    console.log(file); console.log(r.exif); console.log(r.xmp);
  } else {
    let n = 0;
    for (const artist of collection.artists) {
      for (const piece of artist.pieces) {
        const file = findImage(artist.id, piece.id);
        if (!file) continue;
        const before = readFileSync(file);
        const after = credit(before, creditFor(artist, piece));
        if (!before.equals(after)) { writeFileSync(file, after); n++; }
      }
    }
    console.log(`credit: ${n} files written`);
  }
}

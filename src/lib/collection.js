import collection from '../data/collection.json';

export const museum = collection.museum;

// The site may be served under a subpath (GitHub Pages does this). Every hand-written URL goes through url().
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
export const url = (path) => `${BASE}${path}`;
// Artists are stored in the order the painters were born; that order is the room number.
export const artists = collection.artists;

// Rendered images live in src/art/<artist>/<piece>.{jpg,png,webp}
// Wallpapers (16:10) live in src/art/<artist>/<piece>.wallpaper.{jpg,png,webp}
const files = import.meta.glob('../art/**/*.{jpg,jpeg,png,webp}', { eager: true });
// A piece set in motion lives in src/motion/<artist>/<piece>.mp4. It plays on its page, in its room and, for Night Shift, at the entrance.
const motion = import.meta.glob('../motion/**/*.mp4', { eager: true, query: '?url', import: 'default' });

function findMotion(artistId, pieceId) {
  const key = Object.keys(motion).find((k) => k.endsWith(`/motion/${artistId}/${pieceId}.mp4`));
  return key ? motion[key] : null;
}

function findImage(artistId, pieceId, variant) {
  const suffix = variant ? `.${variant}` : '';
  const re = new RegExp(`/art/${artistId}/${pieceId}${suffix.replace('.', '\\.')}\\.(jpg|jpeg|png|webp)$`);
  const key = Object.keys(files).find((k) => re.test(k));
  return key ? files[key].default : null;
}

export function buildPrompt(artist, piece) {
  return `${piece.subject}. ${artist.styleBrief}. ${artist.renderSuffix}.`;
}

export function getArtist(id) {
  return artists.find((a) => a.id === id);
}

/** "1882 – 1967" becomes "1882–1967", the way a label sets it. */
export function lifeDates(artist) {
  return artist.years.replace(/\s*–\s*/g, '–');
}

export function roomNumber(artist) {
  return artists.findIndex((a) => a.id === artist.id) + 1;
}

export function roomHref(artist) {
  return url(`/${artist.id}/`);
}

function ratioOf(artist) {
  const [w, h] = artist.aspect.split(':').map(Number);
  return w / h;
}

function buildPieces(artist) {
  const room = roomNumber(artist);
  return artist.pieces.map((p, i) => {
    const image = findImage(artist.id, p.id);
    const catNo = `${room}.${i + 1}`;
    return {
      ...p,
      index: i,
      artistId: artist.id,
      artist,
      room,
      catNo,
      accession: `PAB 2026.${catNo}`,
      href: url(`/${artist.id}/${p.id}/`),
      image,
      // The ratio comes from the file itself, never from a crop box.
      ratio: image ? image.width / image.height : ratioOf(artist),
      size: p.size ?? artist.size ?? null,
      wallpaper: findImage(artist.id, p.id, 'wallpaper'),
      motion: findMotion(artist.id, p.id),
      prompt: buildPrompt(artist, p),
      alt: `${p.title}, in the manner of ${artist.name}`,
    };
  });
}

const byArtist = new Map(artists.map((a) => [a.id, buildPieces(a)]));

/** Every work in the museum, in walking order: room 1, work 1 to the last work of the last room. */
export const works = artists.flatMap((a) => byArtist.get(a.id));

export function getPieces(artist) {
  return byArtist.get(artist.id);
}

export function getLead(artist) {
  const pieces = getPieces(artist);
  return pieces.find((p) => p.id === artist.lead) ?? pieces[0];
}

/** The works either side of this one on the walk. The walk crosses rooms; past the last work it returns to the entrance. */
export function walkNeighbours(piece) {
  const i = works.findIndex((w) => w.artistId === piece.artistId && w.id === piece.id);
  return { prev: works[i - 1] ?? null, next: works[i + 1] ?? null };
}

export function roomNeighbours(artist) {
  const i = artists.findIndex((a) => a.id === artist.id);
  return { prev: artists[i - 1] ?? null, next: artists[i + 1] ?? null };
}

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** Where the site has a number, it writes it as a word. */
export function inWords(n) {
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + SMALL[n % 10] : '');
  if (n < 200) return 'a hundred' + (n % 100 ? ' and ' + inWords(n % 100) : '');
  return String(n);
}
export const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the layout needs to paint and name a room. */
export function roomInfo(artist) {
  return { number: roomNumber(artist), title: artist.wing, href: roomHref(artist), wall: artist.wall ?? '#ffffff', ink: artist.ink ?? 'dark' };
}

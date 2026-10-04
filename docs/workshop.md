# The workshop

How the museum is built and run. The front page of the repository is for visitors; this page is for anyone who wants to run it, change it or add to it.

## Running it

Node 22 or later.

```
npm install
npm run dev        # http://localhost:4321
npm run build      # wallpapers and share images first, then the static site in dist/
npm run preview    # serve dist/ locally
```

The site is static Astro with no framework on the client and one small script for the keyboard walk and the moving paintings. `.github/workflows/pages.yml` builds and publishes `main` to GitHub Pages. The site address and base path come from the deploy environment, so the same build runs under a subpath or at a domain's root.

## The collection file

`src/data/collection.json` is the whole museum. Painters are listed in the order they were born, and that order is the room number. Each painter has:

- `wing`, the room title, and `wallText`, the room's panel.
- `styleBrief`, the painter's hand described without naming the painter, and `subjectRule`, the rule for the modern twist.
- `renderSuffix`, the closing line of every prompt, asking for a flat frontal reproduction of a physical painting.
- `wall` and `ink`, the room's paint colour and whether its text is light or dark on it; `nationality`; `size`, the height and width in centimetres its works are catalogued at; and `lead`, the work that hangs at the entrance.
- Five `pieces`, each with an `id`, a `title`, a `subject`, an extended `label`, and `loopSeconds` if it moves.

`src/lib/collection.js` builds the prompt for any work (`subject`, then `styleBrief`, then `renderSuffix`), finds its image and clip on disk, and numbers the rooms and works.

## Commissioning a painting

Paintings are rendered on Weave, which the curator's Claude session reaches through the Figma connector. The generator is GPT Image 2.5, the Flare variant at quality high, about 8 credits a painting. Each room's canvas proportion has a pixel size, listed in `scripts/prompt.mjs`, so every work in a room is rendered at the same size: 2160 × 1440 for a 3:2 room, 1600 × 2000 for 4:5, 2000 × 1504 for 4:3, 1728 × 1728 for 1:1, 1440 × 2160 for 2:3.

1. Print the brief and its settings.

   ```
   node scripts/prompt.mjs hopper             # the five Hopper commissions
   node scripts/prompt.mjs vermeer video-call # one of them
   node scripts/prompt.mjs hopper --json      # one line per work, for a run
   ```

2. Run it on Weave with those settings, as many times as it takes. The curator looks at every result and keeps one or none. A result that quotes a known painting means the subject is rewritten, not the result kept.

3. File the one that is kept.

   ```
   node scripts/ingest.mjs hopper laundromat /path/to/result.png
   node scripts/ingest.mjs hopper laundromat https://…/result.png --trim
   node scripts/ingest.mjs hopper laundromat result.png --force     # replace what hangs
   ```

   The painting is re-encoded as a progressive JPEG at `src/art/<painter>/<work>.jpg` and the credit is written into its EXIF and XMP. `--trim` cuts away an even border the model painted around the canvas: the museum shows every image whole, at its own proportions, on a painted wall, so a photographed margin would show. Hokusai's prints keep their paper.

A painting dropped straight into `src/art` hangs too; run `node scripts/credit.mjs` afterwards so it carries the credit.

## Exhibitions

A show sends every painter in the building to one subject, each under the rule of their own room, and may invite painters who have no room yet. Shows live in `exhibitions` in the collection file. Each has:

- `id`, `title`, `subtitle`, and `opens` and `closes` as dates; `closes` may be null.
- `wall` and `ink`, like a room; `lead`, the painter whose work announces the show; `subject`, the one brief every painter received; and `wallText`.
- `guests`, visiting painters with the same fields a room's painter has, plus `born`, since they have no room to be numbered by.
- `works`, one per painter, each with `artist`, `title`, `subject`, an extended `label` once painted, and `loopSeconds` if it moves.

Works hang in the order the painters were born, guests among them, and are filed at `src/art/exhibitions/<show>/<painter>.jpg` and `src/motion/exhibitions/<show>/<painter>.mp4`. The brief and ingest scripts take `--show <id>`.

A show opens by itself. Before `opens` the build makes only the announcement: the show page with its wall text and the lead work, no hang, no work pages, and no entry in the list of works. From the opening day the whole show is built. The deploy runs every night just after midnight UTC as well as on every push, so the opening needs no one at the keyboard; GitHub may run a scheduled build some minutes late. To see the site as it will stand on a date:

```
PABLITO_NOW=2026-10-20 npm run build
```

## Moving paintings

`src/motion/<painter>/<work>.mp4` sets a work in motion. Clips are made on Weave from the still, and filed with `node scripts/ingest.mjs <painter> <work> clip.mp4 --motion`. The still shows first and the clip begins once someone has looked at it for a moment; the still is what downloads. Clips are short, silent, made from the still as their first frame, and looped either plainly or forward-and-back when the model drifts from where it started. Record the loop length as `loopSeconds` on the piece so the label can say it.

## Wallpapers and share images

Neither is stored in the repository. Before every build:

- `scripts/wallpapers.mjs` hangs each painting on its room's wall at phone (1290 × 2796), Mac (3456 × 2234) and wide (3840 × 2160) sizes into `public/wallpapers/`.
- `scripts/og.mjs` does the same at 1200 × 630 into `public/og/` for link previews, plus one image for the public pages.

Both skip files that are already up to date and take `--force` to redo everything, which you need after changing a room's wall colour.

## The credit inside the files

Every painting in `src/art` carries EXIF and XMP metadata: its title, whose manner it is in, the curator, the address of its page, and the IPTC digital source type for a generated image. `node scripts/credit.mjs` writes it losslessly, replacing only the metadata segments, and is safe to run again after adding a painting. The wallpapers, share images and films get the same credit when they are built.

## The film

`scripts/film.mjs` cuts a short silent film of the museum from the paintings, their clips and the site's own type, and writes it to `public/film/`, where the site serves it on its film page. It needs ffmpeg and a headless Chromium:

```
FFMPEG=/path/to/ffmpeg CHROME=/path/to/chrome node scripts/film.mjs          # all three cuts
FFMPEG=/path/to/ffmpeg CHROME=/path/to/chrome node scripts/film.mjs short    # the short cut alone
```

The shots are plain data at the top of the script: a room and a work, how long the still holds and how long it moves, and any sentences set beside it. The film keeps the museum's rules. Nothing moves but the paintings and text, which only fades. Every painting is whole, at its own proportions, on its room's wall, with its label. Cuts are hard, and the wall colour changing is the transition. Clips whose camera drifts are shown as stills.

## House rules for every commission

1. Never name the painter in a prompt. Describe the hand, the light, the palette and the surface instead.
2. The subject must be something the painter could not have seen in their lifetime.
3. One painting, one idea.
4. No frames, no text, no signatures, no famous compositions. If a result quotes a known painting, the subject is rewritten until it stops.

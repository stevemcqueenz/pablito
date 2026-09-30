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

## Printing a brief

```
node scripts/prompt.mjs hopper             # the five Hopper commissions
node scripts/prompt.mjs vermeer video-call # one of them
```

## Paintings

`src/art/<painter>/<work>.jpg` is a finished painting. Drop a file in and it hangs at the next build. Crop to the canvas edge: the museum shows every image whole, at its own proportions, on a painted wall, so a photographed margin would show. Hokusai's prints keep their paper.

`scripts/render.mjs` renders a room's briefs through fal.ai:

```
FAL_KEY=… node scripts/render.mjs hopper                       # the whole room
FAL_KEY=… node scripts/render.mjs hopper laundromat --force    # one work, again
FAL_KEY=… node scripts/render.mjs hopper --model gpt-image-2.5 # choose the generator
```

Generators are listed in the `MODELS` table at the top of the script; add one there. Every run logs the request id, so a render whose download fails can still be fetched.

## Moving paintings

`src/motion/<painter>/<work>.mp4` sets a work in motion. The still shows first and the clip begins once someone has looked at it for a moment; the still is what downloads. Clips are short, silent, made from the still as their first frame, and looped either plainly or forward-and-back when the model drifts from where it started. Record the loop length as `loopSeconds` on the piece so the label can say it.

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

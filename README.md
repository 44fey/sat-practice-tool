# SAT Practice Tool

I was supposed to be studying for the SAT. I procrastinated and made this instead.

The College Board has every disclosed practice question on their site —
about 1,400 of them across Math and Reading & Writing — but the website
is slow, the "Export to PDF" button is broken, you can't bookmark a
question, you can't make a list of "ones I keep getting wrong," there's
no calculator, no timer. Pretty hard to actually use it as a study tool.

So I gave up studying and built my own version.

## Get it

Download the [latest installer](https://github.com/44fey/sat-practice-tool/releases/latest)
(`SAT-Practice-Tool-Setup-x.y.z.exe`). Run it. There's also a portable
single-file version for USB sticks — same thing, but the cold start
takes ~30s every launch because it has to extract itself first.

Both binaries are unsigned, so the first time you run one, Windows will
pop up a SmartScreen warning ("Windows protected your PC"). Click
**More info → Run anyway**.

## What's in it

- Every disclosed question, downloaded once. **826 Math + 596 R&W.**
  No login, no internet needed afterwards.
- Looks like the actual digital SAT. Same dashed multi-color divider,
  same "Mark for Review" button, same choice cards. I matched it on
  purpose — felt weird studying in a UI that didn't match the real test.
- A **Submit** button. You pick an answer, *think for a second*, then
  hit Submit. Only then does it tell you if you're right. The official
  site doesn't do this, which I think is wild.
- **Per-question stopwatch.** Tells me when I'm spending too long on
  one item.
- **Playlists.** Build them by filter (e.g. "Algebra → Linear functions
  → Hard → Wrong") or by hand-picking questions one by one. Then drill
  the playlist with Back / Next.
- **Mark for review** on individual questions, plus a filter to pull up
  just the marked ones.
- **Embedded Desmos**, fully offline. Drag-resizable side panel.
- Saves what I got right/wrong across sessions. Sidebar shows status
  dots so I can see at a glance how I'm doing in each domain.
- Math / R&W toggle in the sidebar. Progress and playlists are scoped
  per section.

## How it works

The College Board site loads questions through a couple of undocumented
JSON APIs. I poked around the network tab and found:

- `POST .../questionbank/digital/get-questions` returns the full list
  of items for a section.
- `GET .../questionbank/lookup` returns `mathLiveItems` and
  `readingLiveItems` — the questions currently in active Bluebook
  practice tests.

Subtract the active set from the full set and you get exactly the same
826 + 596 = 1,422 questions the official "Exclude Active Questions"
toggle shows. Then for each question I either hit
`POST /digital/get-question` (modern, MathML-rich HTML) or
`GET https://saic.collegeboard.org/disclosed/{ibn}.json` (older items,
math is rasterised to PNGs). Each response is one JSON file under
`data/{section}/questions/<id>.json`.

The viewer is just plain HTML/CSS/JS, no framework. The desktop app is
Electron — same viewer, just wrapped in a window.

## Run from source

Node 18+:

```bash
git clone https://github.com/44fey/sat-practice-tool
cd sat-practice-tool
npm install
npm run electron     # opens the desktop app
# or
npm run serve        # serves at http://localhost:5173 if you'd rather use a browser
```

The repo already has the data and the Desmos bundle in it, so you can
run immediately. To refresh against any new College Board updates:
`npm run scrape`.

## Build the .exe yourself

```bash
npm install
npm run icon         # regenerate the icon (only if you change build/make-icon.cjs)
npm run build:exe    # produces dist/SAT-Practice-Tool-Setup-*.exe and -Portable-*.exe
```

## Project layout

```
viewer/             # HTML + CSS + JS for the actual app
data/               # the scraped questions
  math/             # 826 Math
  reading/          # 596 R&W
desmos-offline-main/   # Desmos calculator, runs locally
electron-main.cjs   # Electron main process (used for the .exe)
scrape.mjs          # the scraper
serve.mjs           # tiny static server for browser dev
verify.mjs          # opens every question in headless Chromium and audits it
build/              # icon source + build hooks
tests/              # one-off scripts I wrote during development
```

## Verifier

Because this thing renders MathML, SVG, base64 PNGs, and ~1,400 different
question shapes, I wrote a verifier that loads every question in headless
Chromium and checks for: broken images, missing source content, console
errors, choice-count mismatches, etc. Runs in about 90 seconds across all
1,422 items.

```bash
node verify.mjs
```

## Credits

I wrote the viewer, scraper, and packaging. Question content is
© The College Board, and the embedded calculator is © Desmos, Inc. —
not mine. Details in [CREDITS.md](CREDITS.md).

## License

MIT for the code I wrote. The bundled questions and Desmos calculator
have their own licensing — see [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).

— Faisal Al-Naamani ([@44fey](https://github.com/44fey))

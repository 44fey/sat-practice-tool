# SAT Practice Tool

A local, no-login, fast-as-you-can-click study tool for the digital SAT.

I built this while procrastinating SAT prep. The official **College Board SAT Suite Question Bank** has every disclosed practice question — about 1,400 of them across Math and Reading & Writing — but the website is sluggish, the export-to-PDF is broken, and there is no progress tracking, no playlists, no built-in calculator, no way to bookmark items for review. So I made my own.

It runs entirely on your computer. Open it in any modern browser, pick a question, hit Submit, see how you did. Build playlists by skill or by hand. Bookmark stuff for review. Use the embedded Desmos. Switch between Math and R&W with one click. Everything you do (correct/wrong, marked-for-review, named playlists) is saved in `localStorage` so it persists between sessions.

## What it does

- **All disclosed (non-active) SAT items, locally**: 826 Math + 596 Reading & Writing, the same set you get when you check "Exclude Active Questions" on the official site.
- **Bluebook-style UI**: matches the look of the actual digital SAT — dashed multi-color divider, choice cards with letter circles, "Mark for Review" bookmark, footer with **Back / Question N of M / Next**.
- **Deferred grading**: pick an answer, *think*, then hit **Submit**. Only then does it reveal ✓/✗ and the correct one — no spoilers on click.
- **Per-question stopwatch**: counts up while you work; locks green if you got it right, red if not.
- **Progress tracking**: every attempt is saved with status (correct / wrong / unattempted). Status dots in the sidebar show your performance at a glance.
- **Playlists**: build named study sets two ways:
  - **+ Filter** — captures everything matching your current filter (e.g. "Algebra → Linear functions, Hard, Wrong") in one click
  - **+ Pick** — multi-select mode: tick individual question rows and save them as a playlist
  - Activate a playlist and it becomes the universe for Back / Next.
- **Nested domain → skill filter**: each domain expands to show its skills, so you can drill into a specific weakness.
- **Mark for review**: bookmark questions and filter to just those with one click on the gold star.
- **Embedded Desmos calculator**: full graphing calculator in a draggable, resizable side panel. **Works offline** (uses a local copy of the calculator bundle).
- **Math / R&W section toggle**: switch subjects with one click; progress and playlists are scoped per section.
- **Hide-the-sidebar focus mode**: press `\` (or click the icon) to collapse the navigation and just look at the question.
- **Keyboard shortcuts**: `←` / `→` to navigate, `\` to toggle the sidebar.

## How it works

The College Board Question Bank web app calls a couple of undocumented JSON
APIs to power its own UI. This tool reuses them directly — no headless
browser, no PDF parsing.

1. `POST .../questionbank/digital/get-questions` returns the full list of
   questions for a given test (Math = `test:2`, R&W = `test:1`) and domains.
2. `GET .../questionbank/lookup` returns `mathLiveItems` and
   `readingLiveItems` — the IDs currently appearing in active Bluebook
   practice tests.

Subtracting the active list from the full list gives the disclosed
(non-active) set the official UI shows when you check "Exclude Active
Questions": **826 Math** and **596 Reading & Writing** as of the time of
scraping.

For each disclosed question the scraper then fetches the full body using
whichever endpoint the original site uses for that item:

- **Modern questions** (`ibn` empty): `POST /digital/get-question` with
  `{external_id}` → `{stem, stimulus, answerOptions, keys, rationale}`.
  Stems are MathML-rich HTML (rendered via MathJax 3 in the browser).
- **Legacy questions** (Math only, non-empty `ibn`): `GET https://saic.collegeboard.org/disclosed/{ibn}.json` → `{prompt, body, answer:{style, choices, rationale, correct_choice}}`.
  These often carry rasterised math images (`<img src="data:image/png;base64,...">`).

Each response is saved as a JSON file under `data/{section}/questions/<id>.json` together with the index metadata, so the viewer renders it from disk afterward.

## Get it

**Just want to use it?** Grab the portable Windows build from the
[latest release](https://github.com/44fey/sat-practice-tool/releases/latest)
— a single 97 MB `.exe` you can run from anywhere (Desktop, USB stick,
network share). No install, no Node.js, no setup. Double-click and the app
opens in its own window with all 1,422 questions and the offline Desmos
calculator bundled inside.

## Setup (from source)

You need Node.js 18+.

```bash
git clone https://github.com/<you>/sat-practice-tool
cd sat-practice-tool
npm install
npm run scrape      # downloads all 1,422 questions (~2 minutes, ~23 MB on disk)
npm run serve       # http://localhost:5173
```

To re-scrape only one section: `node scrape.mjs math` or `node scrape.mjs reading`.

The `data/` and `desmos-offline-main/` folders are committed in this repo
so you can clone and go without a scrape if you just want to look at it
quickly. To get a fresh copy after College Board updates the bank, run
`npm run scrape` again — existing files are skipped.

## Layout

```
viewer/             HTML + CSS + JS for the local web app (no build step)
data/
  math/             826 disclosed Math questions
    index.json      list metadata
    questions/      one JSON per question
  reading/          596 disclosed R&W questions
desmos-offline-main/  Desmos graphing calculator, served locally
scrape.mjs          scraper / refresher
serve.mjs           tiny static server (port 5173)
verify.mjs          loads every question in headless Chromium and audits rendering
smoke.mjs           quick smoke test of the viewer
tests/              one-off Playwright scripts used during development
electron-main.cjs   Electron main process (used for the portable .exe build)
run-electron.cjs    dev launcher for `npm run electron`
run-electron-builder.cjs   wrapper for `npm run build:exe`
CREDITS.md          attribution for College Board content + Desmos calculator
```

## Building the portable Windows .exe yourself

```bash
npm install
npm run electron     # dev mode — opens the app in its own window
npm run build:exe    # produces dist/SAT-Practice-Tool.exe (~97 MB)
```

Bundles the viewer, all 1,422 questions, and the offline Desmos calculator
into a single portable executable. No code-signing — the build skips
winCodeSign so you don't need Windows Developer Mode or admin rights.

## Verification

Every question is rendered in headless Chromium and checked for: broken
images, missing source content, console errors, failed network requests,
choice-count mismatches, and SPR-mode regressions. The verifier runs
across all 1,422 in about a minute and a half.

```bash
npm run smoke       # 5 representative + 10 random
node verify.mjs     # full sweep, writes verify-out/report.json
```

## Notes

- I am a student, not a lawyer. This tool only calls public endpoints the
  official educator-facing College Board site already calls from a
  logged-out browser. Use it for personal study.
- **Active Bluebook items are intentionally not fetched** — they're the
  ones you'd see in actual practice tests anyway.
- Question content in `data/` is © **The College Board**. See
  [CREDITS.md](CREDITS.md) for full attribution.
- The Desmos bundle in `desmos-offline-main/` is © **Desmos Inc.** and is
  redistributed via the public
  [desmos-offline](https://github.com/coolfreshmint/desmos-offline) project.
- This was a procrastination project. Use at your own risk.

## Contributing

PRs welcome. Things on my list:
- Spaced-repetition mode (re-surface wrong-answered items after N days)
- Export a playlist as PDF for offline paper practice
- A "review session" view that shows only your wrong answers + rationales
- Auto-pull weekly to catch new disclosed items

## License

MIT for the code. See [LICENSE](LICENSE). Question content and the Desmos
bundle are not under the MIT license — see [CREDITS.md](CREDITS.md).

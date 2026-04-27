# Credits

Two big things in this repo aren't mine, and I want to be clear about
where they came from.

## The SAT questions

Everything inside `data/` — 826 Math + 596 R&W questions, including the
stems, choices, rationales, embedded math images, and SVG figures — is
copyright **The College Board**.

I downloaded them from the public
[SAT Suite Educator Question Bank](https://satsuiteeducatorquestionbank.collegeboard.org/),
which is open to anyone with a free account. The scraper just sends the
same JSON requests their own JavaScript sends. Only the **disclosed
(non-active)** items are included — the ones the College Board has
already released for review. The questions still being used in active
Bluebook practice tests are intentionally not in here.

I'm not affiliated with the College Board. "SAT," "Bluebook," "Digital
SAT," and the College Board name and logo are their trademarks. If
anyone from the College Board would prefer the questions not be in this
repo, open an issue and I'll take them down — anyone using the tool can
re-fetch their own copy with `npm run scrape`.

## The Desmos calculator

Everything inside `desmos-offline-main/` is © **Desmos, Inc.** That's
their actual graphing calculator, running locally inside the app.

Desmos publishes a free embedding API at
[desmos.com/api](https://www.desmos.com/api), but the standard version
needs internet. The offline build I'm shipping comes from the
[desmos-offline](https://github.com/coolfreshmint/desmos-offline)
project, which packages the calculator into a self-contained folder
that runs without a connection.

I'm not affiliated with Desmos either.

## Other libraries I used

- [MathJax 3](https://www.mathjax.org/) — renders the MathML in modern
  question stems. Loaded from a CDN. Apache 2.0.
- [Playwright](https://playwright.dev/) — headless Chromium for the
  verifier and the Playwright-based test scripts. Dev-only. Apache 2.0.
- [Electron](https://www.electronjs.org/) — wraps the viewer into the
  desktop app. MIT.
- [electron-builder](https://www.electron.build/) — builds the .exe
  installers. MIT.

## My code

Everything else — the viewer (HTML/CSS/JS in `viewer/`), the scraper,
the Electron main process, the build hooks, the icon generator, the
verifier, all the test scripts — I wrote myself. MIT licensed (see
[LICENSE](LICENSE)).

— Faisal Al-Naamani ([@44fey](https://github.com/44fey))

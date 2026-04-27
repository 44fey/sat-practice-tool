# Credits & Attribution

This project bundles two things I did not create. Full credit and
acknowledgment goes to:

## SAT Question Content

All question stems, stimuli, answer choices, rationales, and associated
images in the `data/` directory are © **The College Board**.

- They are sourced from the publicly-accessible **SAT Suite Question Bank**
  for educators: <https://satsuiteeducatorquestionbank.collegeboard.org/>
- "SAT", "Bluebook", "Digital SAT", and the College Board name and logo
  are trademarks owned by the College Board.
- This project is **not** affiliated with, endorsed by, or sponsored by
  the College Board.
- Only **disclosed (non-active)** items are included — i.e. questions the
  College Board has explicitly released for educator and student review.
  Active Bluebook practice-test items are intentionally excluded.
- The content is included in this repo to make the tool runnable
  out-of-the-box for personal study. If you are the rights holder and
  would prefer it not be redistributed here, open an issue and I will
  remove it; you can always re-fetch your own copy via `npm run scrape`.

## Desmos Graphing Calculator

The contents of `desmos-offline-main/` are © **Desmos, Inc.** Desmos provides a
free educational graphing calculator at <https://www.desmos.com/calculator>
and a free embeddable JavaScript API at <https://www.desmos.com/api>.

- The offline bundle in this repo originates from the
  [desmos-offline](https://github.com/coolfreshmint/desmos-offline) project,
  which packages the calculator into a self-contained folder that runs
  without an internet connection.
- "Desmos" and the Desmos logo are trademarks owned by Desmos, Inc.
- This project is **not** affiliated with, endorsed by, or sponsored by
  Desmos.

## Other libraries

- [MathJax 3](https://www.mathjax.org/) — used to render MathML in
  question stems. Loaded from `cdn.jsdelivr.net` via `<script>` tag in
  [viewer/index.html](viewer/index.html). Apache 2.0 licensed.
- [Playwright](https://playwright.dev/) — used in `tests/` and in
  [verify.mjs](verify.mjs) for headless rendering checks. Apache 2.0
  licensed. Dev dependency only.

## My code

Everything outside `data/`, `desmos-offline-main/`, and `node_modules/` —
i.e. `viewer/`, `scrape.mjs`, `serve.mjs`, `smoke.mjs`, `verify.mjs`,
`tests/`, and configuration files — is my own work, MIT-licensed (see
[LICENSE](LICENSE)).

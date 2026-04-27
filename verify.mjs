// verify.mjs — exhaustive renderer-quality check over all 826 questions.
//
// Loads each question in headless Chromium and inspects the resulting DOM:
//   - all <img> tags actually loaded (naturalWidth > 0)
//   - the stem has visible content (not 1-2 chars of leftover text)
//   - the answer/rationale exposed when revealed
//   - choice count matches the data (MCQ has 2-6 choices, etc.)
//   - no unresolved "above"/"shown"/"the table" references when nothing is rendered above the prompt
//   - no console errors, no failed network requests
//
// Output: verify-report.json with per-question status and an overall summary.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const BASE = 'http://localhost:5173';
const section = process.argv[2] || 'math';   // 'math' | 'reading'
if (!['math', 'reading'].includes(section)) {
  console.error('usage: node verify.mjs [math|reading]'); process.exit(1);
}

const index = JSON.parse(await readFile(`./data/${section}/index.json`, 'utf-8'));
console.log(`Verifying ${index.length} ${section} questions...`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on('pageerror', (e) => consoleErrors.push({ qid: 'global', text: e.message }));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push({ qid: 'global', text: msg.text() });
});
page.on('requestfailed', (req) => {
  const u = req.url();
  // ignore expected MathJax font preload failures (harmless)
  if (u.includes('mathjax') && /\.(woff2?|otf|ttf)/.test(u)) return;
  failedRequests.push({ qid: 'global', url: u, error: req.failure()?.errorText });
});

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Switch to the requested section
await page.evaluate((s) => {
  const btn = document.querySelector(`#section-switch button[data-section="${s}"]`);
  if (btn) btn.click();
}, section);
await page.waitForFunction((expected) => {
  const el = document.querySelector('#all-count');
  return el && Number(el.textContent) === expected;
}, index.length, { timeout: 15000 });

const issues = [];
const ok = [];
let n = 0;
const T0 = Date.now();

for (const meta of index) {
  n++;
  const qid = meta.questionId;

  // mark current qid for any console listeners that fire during this iteration
  const before = consoleErrors.length;
  const beforeFail = failedRequests.length;

  // Bypass the search/list path — just call selectQuestion(qid) directly.
  // Faster and avoids depending on visible list items.
  const selectErr = await page.evaluate(async (qid) => {
    try {
      await window.__test_selectQuestion(qid);
      return null;
    } catch (e) {
      return e.message || String(e);
    }
  }, qid);

  if (selectErr) {
    issues.push({ qid, kind: 'select-failed', detail: selectErr });
    if (n % 25 === 0) process.stdout.write(`\r  ${n}/${index.length} (${issues.length} issues)`);
    continue;
  }

  // Reveal answer + rationale so we can inspect them too
  await page.evaluate(() => {
    const a = document.querySelector('#q-answer'); if (a) a.hidden = false;
    const r = document.querySelector('#q-rationale'); if (r) r.hidden = false;
  });

  // Wait for MathJax + image loading. Two cycles since reveal added DOM.
  try {
    await page.evaluate(async () => {
      if (window.MathJax && window.MathJax.typesetPromise) {
        await window.MathJax.typesetPromise([
          document.querySelector('#q-stem'),
          document.querySelector('#q-choices'),
          document.querySelector('#q-answer'),
          document.querySelector('#q-rationale'),
        ].filter(Boolean));
      }
      // wait for images
      const imgs = Array.from(document.querySelectorAll('#question-content img'));
      await Promise.all(imgs.map((im) => im.complete ? null : new Promise((r) => {
        im.addEventListener('load', r, { once: true });
        im.addEventListener('error', r, { once: true });
      })));
    });
  } catch (e) {
    issues.push({ qid, kind: 'wait-failed', detail: e.message });
  }

  // Pull the raw payload so we can compare against what's actually rendered.
  const payload = await page.evaluate(async ([qid, section]) => {
    const r = await fetch(`../data/${section}/questions/${qid}.json`);
    return r.json();
  }, [qid, section]);

  const audit = await page.evaluate(() => {
    const stem = document.querySelector('#q-stem');
    const choicesEl = document.querySelector('#q-choices');
    const ans = document.querySelector('#q-answer');
    const rat = document.querySelector('#q-rationale');
    const sprEl = document.querySelector('#q-spr-input');
    const numChoicesEl = document.querySelector('#q-choices');
    const numChoicesNow = numChoicesEl?.children?.length || 0;
    const sprVisibleNow = sprEl ? !sprEl.hidden : false;
    const visType = numChoicesNow > 0 ? 'Multiple choice'
                    : sprVisibleNow ? 'Student-produced response'
                    : '';

    const stemText = (stem?.innerText || '').trim();
    const stemHTML = stem?.innerHTML || '';
    const ratText = (rat?.innerText || '').trim();
    const ratHTML = rat?.innerHTML || '';
    const ansText = (ans?.innerText || '').trim();

    const imgs = Array.from(stem?.querySelectorAll('img') || [])
      .concat(Array.from(choicesEl?.querySelectorAll('img') || []))
      .concat(Array.from(rat?.querySelectorAll('img') || []));
    const brokenImgs = imgs
      .filter((im) => !im.complete || im.naturalWidth === 0)
      .map((im) => im.getAttribute('src')?.slice(0, 60));

    const numChoices = choicesEl?.children?.length || 0;

    // a "shown above"/"the table above" reference with no <img|svg|table|figure|math>
    // anywhere in the stem is suspicious.
    const stemHasVisual = /<(img|svg|table|figure|math)\b/i.test(stemHTML);
    const refsAbove = /\b(shown above|figure above|graph above|table above|equation above|system above|expression above|equations? shown|graph shown|figure shown|table shown|data shown)\b/i.test(stemText);
    const orphanReference = refsAbove && !stemHasVisual;

    return {
      stemTextLen: stemText.length,
      stemHTMLLen: stemHTML.length,
      stemHTML, // for structural diff vs raw payload
      stemHasVisual,
      orphanReference,
      ratHasContent: ratText.length > 10,
      ansHasContent: ansText.length > 0,
      numChoices,
      visType,
      sprVisible: sprEl ? !sprEl.hidden : false,
      brokenImgsCount: brokenImgs.length,
      brokenImgsSample: brokenImgs.slice(0, 3),
    };
  });

  // Structural integrity: each non-empty source field must show up in the DOM.
  // Look for keyword tokens (alphanumeric runs) instead of a positional probe —
  // robust against entity decoding, MathJax DOM injection, and whitespace shifts.
  const tokensFrom = (html) => {
    const t = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x?[0-9a-f]+;/gi, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Words ≥ 4 chars, alphanumeric only — least likely to collide with math glyphs.
    const words = (t.match(/[A-Za-z][A-Za-z0-9]{3,}/g) || []);
    return words;
  };
  const stemTokens = new Set(tokensFrom(audit.stemHTML).map((w) => w.toLowerCase()));
  const fieldHasContent = (html) => {
    const tks = tokensFrom(html);
    if (tks.length === 0) return true; // pure-math/SVG payload — can't probe by word
    // require at least 60% of source words to appear in the rendered stem
    let hits = 0;
    for (const w of tks) if (stemTokens.has(w.toLowerCase())) hits++;
    return hits / tks.length >= 0.6;
  };

  const missingFields = [];
  if (payload.source === 'legacy') {
    const body = (payload.detail.body || '').trim();
    const prompt = (payload.detail.prompt || '').trim();
    if (body && !fieldHasContent(body)) missingFields.push('body');
    if (prompt && !fieldHasContent(prompt)) missingFields.push('prompt');
  } else {
    const stem = (payload.detail.stem || '').trim();
    const stimulus = (payload.detail.stimulus || '').trim();
    if (stimulus && !fieldHasContent(stimulus)) missingFields.push('stimulus');
    if (stem && !fieldHasContent(stem)) missingFields.push('stem');
  }
  delete audit.stemHTML;

  const flags = [];
  if (audit.stemTextLen < 10) flags.push('stem-empty');
  if (audit.brokenImgsCount > 0) flags.push(`broken-imgs(${audit.brokenImgsCount})`);
  if (audit.orphanReference) flags.push('orphan-reference');
  if (missingFields.length) flags.push(`missing-fields(${missingFields.join('+')})`);
  if (!audit.ratHasContent) flags.push('no-rationale');
  if (audit.visType === 'Multiple choice' && (audit.numChoices < 2 || audit.numChoices > 6)) flags.push(`choice-count(${audit.numChoices})`);
  if (audit.visType === 'Multiple choice' && audit.sprVisible) flags.push('spr-shown-on-mcq');
  if (audit.visType === 'Student-produced response' && !audit.sprVisible) flags.push('spr-hidden-on-spr');

  const newConsoleErrs = consoleErrors.slice(before);
  const newFailedReqs = failedRequests.slice(beforeFail);
  if (newConsoleErrs.length) flags.push(`console-err(${newConsoleErrs.length})`);
  if (newFailedReqs.length) flags.push(`req-failed(${newFailedReqs.length})`);

  if (flags.length) {
    issues.push({ qid, flags, audit, consoleErrs: newConsoleErrs, failedReqs: newFailedReqs });
  } else {
    ok.push(qid);
  }

  if (n % 25 === 0 || n === index.length) {
    process.stdout.write(`\r  ${n}/${index.length} (${issues.length} issues)`);
  }
}
process.stdout.write('\n');

await browser.close();

const summary = {
  total: index.length,
  ok: ok.length,
  issues: issues.length,
  byFlag: {},
  durationSec: Math.round((Date.now() - T0) / 1000),
};
for (const it of issues) {
  for (const f of (it.flags || [it.kind || 'unknown'])) {
    const key = f.replace(/\(.+\)$/, '');
    summary.byFlag[key] = (summary.byFlag[key] || 0) + 1;
  }
}

await mkdir('./verify-out', { recursive: true });
await writeFile('./verify-out/report.json', JSON.stringify({ summary, issues }, null, 2));

console.log('\n=== summary ===');
console.log(JSON.stringify(summary, null, 2));
console.log(`\nFull report: ./verify-out/report.json`);

if (summary.issues > 0) {
  console.log('\nFirst 5 issues:');
  for (const it of issues.slice(0, 5)) {
    console.log(`  ${it.qid}: ${(it.flags || [it.kind]).join(', ')}`);
  }
}

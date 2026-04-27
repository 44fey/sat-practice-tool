// Exercises the new submit/timer/Desmos flow end-to-end and screenshots each state.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('./smoke-out', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// ---- 1. Modern MCQ — pre-submit (selected, no colour) ----
await page.evaluate(() => window.__test_selectQuestion('00b9bd37'));
await page.waitForTimeout(1500);
await page.click('#q-choices .choice[data-letter="C"]');  // wrong choice
await page.waitForTimeout(300);
await page.screenshot({ path: './smoke-out/FLOW-1-pre-submit.png', fullPage: false });

// ---- 2. After submit — incorrect (red on picked, green on actual correct) ----
await page.click('#submit-btn');
await page.waitForTimeout(500);
await page.screenshot({ path: './smoke-out/FLOW-2-after-incorrect.png', fullPage: false });

// ---- 3. Try again, pick correct, submit ----
await page.click('#retry-btn');
await page.waitForTimeout(800);
await page.click('#q-choices .choice[data-letter="B"]');
await page.click('#submit-btn');
await page.waitForTimeout(500);
await page.screenshot({ path: './smoke-out/FLOW-3-correct.png', fullPage: false });

// ---- 4. SPR — type wrong, submit, then fix ----
await page.evaluate(() => window.__test_selectQuestion('002dba45'));
await page.waitForTimeout(1500);
await page.fill('#spr-attempt', '0.5');
await page.waitForTimeout(200);
await page.click('#submit-btn');
await page.waitForTimeout(400);
await page.screenshot({ path: './smoke-out/FLOW-4-spr-wrong.png', fullPage: false });

// ---- 5. Open Desmos panel ----
await page.click('#toggle-desmos');
await page.waitForTimeout(2500);  // give Desmos time to load
await page.screenshot({ path: './smoke-out/FLOW-5-desmos-open.png', fullPage: false });

// ---- 6. Verify timer is running ----
await page.evaluate(() => window.__test_selectQuestion('ac472881'));
await page.waitForTimeout(1500);
const t1 = await page.textContent('#timer-display');
await page.waitForTimeout(2200);
const t2 = await page.textContent('#timer-display');
console.log(`timer started at ${t1}, after 2.2s = ${t2}`);

// ---- 7. Progress persistence: reload, status dot should remain ----
const before = await page.$$eval('#question-list li[data-id="00b9bd37"] .status-dot', els => els.map(e => e.className));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
const after = await page.$$eval('#question-list li[data-id="00b9bd37"] .status-dot', els => els.map(e => e.className));
console.log('status dot before reload:', before, '→ after:', after);

await browser.close();
console.log('\nerrors:', errs.length);
errs.forEach(e => console.log('  ' + e));

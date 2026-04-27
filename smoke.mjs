import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = './smoke-out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const errors = [];
const warns = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
  if (msg.type() === 'warning') warns.push(msg.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push(`reqfailed: ${r.url()} ${r.failure()?.errorText}`));

console.log('Navigating http://localhost:5173/ ...');
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

// wait for index to populate the count
await page.waitForFunction(() => {
  const el = document.querySelector('#all-count');
  return el && /\d/.test(el.textContent);
}, { timeout: 10000 });

const total = await page.textContent('#all-count');
const filtered = await page.textContent('#filtered-count');
const listCount = await page.locator('#question-list li').count();
console.log(`total=${total} filtered=${filtered} listItemsRendered=${listCount}`);

await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: false });

// pick a known modern MCQ (00b9bd37 — has SVG figure + MathML choices)
console.log('Loading modern MCQ 00b9bd37...');
await page.fill('#search-id', '00b9bd37');
await page.waitForFunction(() => document.querySelectorAll('#question-list li[data-id]').length === 1);
await page.click('#question-list li[data-id="00b9bd37"]');
await page.waitForSelector('#q-content, #q-stem');
await page.waitForTimeout(2500); // let MathJax typeset
await page.screenshot({ path: `${OUT}/02-modern-mcq.png`, fullPage: true });

// click the answer + rationale reveals
await page.click('#reveal-answer');
await page.click('#reveal-rationale');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-modern-mcq-revealed.png`, fullPage: true });

// pick a modern SPR (002dba45)
console.log('Loading modern SPR 002dba45...');
await page.fill('#search-id', '002dba45');
await page.waitForFunction(() => document.querySelectorAll('#question-list li[data-id]').length === 1);
await page.click('#question-list li[data-id="002dba45"]');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/04-modern-spr.png`, fullPage: true });

// pick a legacy MC (000259aa)
console.log('Loading legacy MC 000259aa...');
await page.fill('#search-id', '000259aa');
await page.waitForFunction(() => document.querySelectorAll('#question-list li[data-id]').length === 1);
await page.click('#question-list li[data-id="000259aa"]');
await page.waitForTimeout(2000);
await page.click('#reveal-answer');
await page.click('#reveal-rationale');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/05-legacy-mc.png`, fullPage: true });

// pick a legacy SPR (0231050d)
console.log('Loading legacy SPR 0231050d...');
await page.fill('#search-id', '0231050d');
await page.waitForFunction(() => document.querySelectorAll('#question-list li[data-id]').length === 1);
await page.click('#question-list li[data-id="0231050d"]');
await page.waitForTimeout(2000);
await page.click('#reveal-rationale');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/06-legacy-spr.png`, fullPage: true });

// Stress test: click random IDs from across the bank.
console.log('\nStress: 10 random questions...');
await page.fill('#search-id', '');
await page.waitForTimeout(200);
const allIds = await page.$$eval('#question-list li[data-id]', (els) => els.map((e) => e.dataset.id));
const sample = [];
const idsAvailable = allIds.length;
for (let i = 0; i < 10 && idsAvailable; i++) sample.push(allIds[Math.floor(Math.random() * idsAvailable)]);
for (const id of sample) {
  await page.fill('#search-id', id);
  try {
    await page.waitForFunction(
      (qid) => Array.from(document.querySelectorAll('#question-list li[data-id]')).some((li) => li.dataset.id === qid),
      id,
      { timeout: 3000 }
    );
    await page.click(`#question-list li[data-id="${id}"]`);
    await page.waitForTimeout(400);
    const ok = await page.$eval('#q-id', (el) => el.textContent.length > 0);
    console.log(`  ${id}: ${ok ? 'rendered' : 'EMPTY'}`);
  } catch (e) {
    console.log(`  ${id}: ERROR — ${e.message.split('\n')[0]}`);
  }
}

await browser.close();

console.log('\n=== console errors ===');
errors.forEach(e => console.log('  ' + e));
console.log('\n=== console warnings ===');
warns.slice(0, 10).forEach(e => console.log('  ' + e));
console.log(`\nScreenshots in ${OUT}/`);

import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Reset progress so screenshots aren't polluted by previous runs
await page.evaluate(() => {
  localStorage.removeItem('sat-math-progress-v1');
  localStorage.removeItem('sat-reading-progress-v1');
  localStorage.removeItem('sat-section-v1');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Switch to R&W
await page.click('#section-switch button[data-section="reading"]');
await page.waitForFunction(() => Number(document.querySelector('#all-count').textContent) === 596);
await page.waitForTimeout(500);

// Pick the first R&W question to render
const firstId = await page.$eval('#question-list li[data-id]', el => el.dataset.id);
await page.evaluate((q) => window.__test_selectQuestion(q), firstId);
await page.waitForTimeout(2500);
await page.screenshot({ path: './smoke-out/READING-1-first.png', fullPage: false });

// Find a question that has a stimulus (passage) so the new rendering is exercised
const sample = await page.evaluate(async () => {
  for (let i = 0; i < 50; i++) {
    const li = document.querySelectorAll('#question-list li[data-id]')[i];
    if (!li) break;
    const qid = li.dataset.id;
    const r = await fetch(`../data/reading/questions/${qid}.json`);
    const d = await r.json();
    if (d.detail.stimulus && d.detail.stimulus.length > 200) return qid;
  }
  return null;
});
console.log('stimulus sample:', sample);
if (sample) {
  await page.evaluate((q) => window.__test_selectQuestion(q), sample);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: './smoke-out/READING-2-stimulus.png', fullPage: true });
}

// Verify isolated progress: math attempts shouldn't affect R&W counts.
// Switch to math, mark + answer one
await page.click('#section-switch button[data-section="math"]');
await page.waitForFunction(() => Number(document.querySelector('#all-count').textContent) === 826);
await page.waitForTimeout(400);
await page.evaluate(() => window.__test_selectQuestion('00b9bd37'));
await page.waitForTimeout(1500);
await page.click('#bb-mark');
await page.waitForTimeout(150);
const mathMarked = await page.textContent('#ps-marked-n');
const mathLeft = await page.textContent('#ps-todo-n');
console.log(`math: marked=${mathMarked} left=${mathLeft}`);

// Switch back to R&W: counters should be zero
await page.click('#section-switch button[data-section="reading"]');
await page.waitForFunction(() => Number(document.querySelector('#all-count').textContent) === 596);
await page.waitForTimeout(400);
const readMarked = await page.textContent('#ps-marked-n');
const readLeft = await page.textContent('#ps-todo-n');
console.log(`reading: marked=${readMarked} left=${readLeft}`);

await page.screenshot({ path: './smoke-out/READING-3-after-switch.png', fullPage: false });

await browser.close();
console.log('errors:', errs.length);
errs.forEach(e => console.log('  ' + e));

import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Reset any previous progress so this test is deterministic.
await page.evaluate(() => { localStorage.removeItem('sat-math-progress-v1'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

const targets = ['00b9bd37', '002dba45', '364a2d25'];
for (const qid of targets) {
  await page.evaluate((q) => window.__test_selectQuestion(q), qid);
  await page.waitForTimeout(800);
  await page.click('#bb-mark');
  await page.waitForTimeout(120);
}

// Marked count in summary
const markedCount = await page.textContent('#ps-marked-n');
console.log('marked count in summary:', markedCount);

// Click the filter
await page.click('#filter-marked');
await page.waitForTimeout(300);
const filteredCount = await page.textContent('#filtered-count');
const visibleIds = await page.$$eval('#question-list li[data-id]', els => els.map(el => el.dataset.id));
console.log('filter result:', { filteredCount, visibleIds });

await page.screenshot({ path: './smoke-out/MARKED-1-filter.png', fullPage: false });

// Check the bookmark icons render in those rows
const iconStates = await page.$$eval('#question-list li[data-id]', els => els.map((el) => ({
  id: el.dataset.id,
  iconVisible: el.querySelector('.mark-icon')?.style.visibility,
})));
console.log('icons:', iconStates);

// Toggle off via the progress-summary pill
await page.click('#ps-marked-pill');
await page.waitForTimeout(300);
const afterToggle = await page.textContent('#filtered-count');
console.log('after toggle off via summary pill:', afterToggle);

// Persist across reload
await page.click('#filter-marked');
await page.waitForTimeout(200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
const persistedMarked = await page.textContent('#ps-marked-n');
console.log('marked count after reload:', persistedMarked);

await browser.close();
console.log('\nerrors:', errs.length);
errs.forEach(e => console.log('  ' + e));

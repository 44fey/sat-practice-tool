// Visual sanity-check of the new collapsible sidebar across three states:
//   1. Idle, no playlist
//   2. Active playlist + Algebra expanded (the "crowded" case the user reported)
//   3. Same crowded state but using a 416px-wide viewport like the user's screenshot
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('./smoke-out', { recursive: true });

async function setup(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
  await page.evaluate(() => {
    localStorage.removeItem('sat-playlists-v1');
    localStorage.removeItem('sat-math-progress-v1');
    localStorage.removeItem('sat-section-open-filters-section');
    localStorage.removeItem('sat-section-open-playlists-section');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// 1. Idle, default 1500x950
await setup(page, { width: 1500, height: 950 });
await page.screenshot({ path: './smoke-out/REDESIGN-1-idle.png', fullPage: false });

// 2. Active playlist + Algebra expanded, 1500x950
await page.evaluate(() => {
  // Save a few playlists, mark one
  localStorage.setItem('sat-playlists-v1', JSON.stringify({
    'pl_1': { id: 'pl_1', name: 'Hard Algebra Drill',  section: 'math', ids: ['ac472881','002dba45','f224df07','3008cfc3','d1b66ae6'], created: Date.now() - 30000 },
    'pl_2': { id: 'pl_2', name: 'Geometry Review',     section: 'math', ids: ['cb8f449f','3cdbf026','ff501705'], created: Date.now() - 20000 },
    'pl_3': { id: 'pl_3', name: 'Wrong from Tuesday',  section: 'math', ids: ['2937ef4f','9bbce683'], created: Date.now() - 10000 },
    'pl_4': { id: 'pl_4', name: 'Advanced Math',       section: 'math', ids: ['ac472881','002dba45','f224df07','3008cfc3','d1b66ae6','cb8f449f','3cdbf026','ff501705','2937ef4f','9bbce683'], created: Date.now() },
  }));
  localStorage.setItem('sat-math-progress-v1', JSON.stringify({
    'ac472881': { status: 'correct', ts: Date.now() },
    '002dba45': { status: 'correct', ts: Date.now() },
    'f224df07': { status: 'incorrect', ts: Date.now() },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
// activate the Advanced Math playlist + expand the Algebra category
await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('.playlist-row'))
    .find(r => r.querySelector('.pl-name')?.textContent === 'Advanced Math');
  row?.querySelector('.pl-name').click();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const dets = Array.from(document.querySelectorAll('details.cat-domain'));
  const adv = dets.find(d => d.querySelector('.cat-name')?.textContent === 'Advanced Math');
  if (adv) adv.open = true;
});
await page.waitForTimeout(300);
await page.screenshot({ path: './smoke-out/REDESIGN-2-active.png', fullPage: false });

// 3. Same state, narrow viewport like the user's screenshot
await page.setViewportSize({ width: 416, height: 900 });
await page.waitForTimeout(200);
await page.screenshot({ path: './smoke-out/REDESIGN-3-narrow.png', fullPage: false });

// 4. Verify question list still has visible rows in the narrow case
const visibleRows = await page.$$eval('#question-list li[data-id]', els => els.filter(el => {
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}).length);
console.log('Visible question rows in narrow viewport:', visibleRows);

await browser.close();
console.log('done');

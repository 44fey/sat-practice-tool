import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Seed two demo playlists, mark one active, sprinkle some progress
await page.evaluate(() => {
  localStorage.setItem('sat-playlists-v1', JSON.stringify({
    'pl_1': { id: 'pl_1', name: 'Hard Algebra Drill',  section: 'math', ids: ['ac472881','002dba45','f224df07','3008cfc3','d1b66ae6'], created: Date.now() - 20000 },
    'pl_2': { id: 'pl_2', name: 'Geometry Review',     section: 'math', ids: ['cb8f449f','3cdbf026','ff501705'], created: Date.now() - 10000 },
    'pl_3': { id: 'pl_3', name: "Wrong from Tuesday",  section: 'math', ids: ['2937ef4f','9bbce683'], created: Date.now() },
  }));
  localStorage.setItem('sat-math-progress-v1', JSON.stringify({
    'ac472881': { status: 'correct', ts: Date.now() },
    '002dba45': { status: 'correct', ts: Date.now() },
    'f224df07': { status: 'incorrect', ts: Date.now() },
    'cb8f449f': { status: 'correct', ts: Date.now(), marked: true },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Idle screenshot
await page.screenshot({ path: './smoke-out/BREATHE-1-idle.png', fullPage: false });

// Activate a playlist
await page.evaluate(() => {
  document.querySelectorAll('.playlist-row .pl-name')[0].click();
});
await page.waitForTimeout(500);
await page.screenshot({ path: './smoke-out/BREATHE-2-active.png', fullPage: false });

await browser.close();
console.log('done');

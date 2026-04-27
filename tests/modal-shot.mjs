// Verify the new modal-based playlists UX:
//   1. Sidebar with no playlists section (more breathing room)
//   2. Modal open via the icon button
//   3. After activating a playlist: banner shows in sidebar, modal closed
//   4. Question list visible in all three states
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('./smoke-out', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Seed three playlists with real IDs so they actually filter to something
await page.evaluate(() => {
  localStorage.setItem('sat-playlists-v1', JSON.stringify({
    'pl_a': { id: 'pl_a', name: 'Hard Algebra Drill', section: 'math',
              ids: ['ac472881','002dba45','f224df07','3008cfc3','d1b66ae6','cb8f449f','3cdbf026'],
              created: Date.now() - 30000 },
    'pl_b': { id: 'pl_b', name: 'Geometry Review',    section: 'math',
              ids: ['ff501705','2937ef4f','9bbce683','b86123af','608eeb6e'],
              created: Date.now() - 20000 },
    'pl_c': { id: 'pl_c', name: 'Wrong Tuesday',      section: 'math',
              ids: ['be9cb6a2','84664a7c','e62cfe5f'],
              created: Date.now() - 10000 },
  }));
  localStorage.setItem('sat-math-progress-v1', JSON.stringify({
    'ac472881': { status: 'correct',   ts: Date.now() },
    '002dba45': { status: 'correct',   ts: Date.now() },
    'f224df07': { status: 'incorrect', ts: Date.now() },
    'cb8f449f': { status: 'correct',   ts: Date.now(), marked: true },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// 1. Idle sidebar — no playlists section, just filters + question list
await page.screenshot({ path: './smoke-out/MODAL-1-sidebar-clean.png', fullPage: false });
const visibleAtIdle = await page.$$eval('#question-list li[data-id]', els => els.length);
console.log('Visible question rows when idle:', visibleAtIdle);

// 2. Open the playlists modal via the header icon button
await page.click('#open-playlists');
await page.waitForTimeout(300);
const modalShown = await page.isVisible('#playlists-modal .modal-card');
console.log('Modal visible after click:', modalShown);
await page.screenshot({ path: './smoke-out/MODAL-2-open.png', fullPage: false });

// 3. Activate "Hard Algebra Drill" by clicking it
await page.click('.modal-card .playlist-row:has-text("Hard Algebra Drill") .pl-name');
await page.waitForTimeout(400);
const modalAfter = await page.isVisible('#playlists-modal .modal-card');
const bannerAfter = await page.isVisible('#active-playlist-banner');
const filteredCount = await page.textContent('#filtered-count');
console.log('After activate → modal:', modalAfter, '· banner:', bannerAfter, '· filtered:', filteredCount);
await page.screenshot({ path: './smoke-out/MODAL-3-active.png', fullPage: false });

// 4. Open modal again, close via Escape key
await page.click('#open-playlists');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const modalAfterEsc = await page.isVisible('#playlists-modal .modal-card');
console.log('Modal after Escape:', modalAfterEsc);

// 5. Open modal, close via backdrop click (corner avoids the centered card)
await page.click('#open-playlists');
await page.waitForTimeout(200);
await page.mouse.click(20, 20);
await page.waitForTimeout(200);
const modalAfterBackdrop = await page.isVisible('#playlists-modal .modal-card');
console.log('Modal after backdrop click:', modalAfterBackdrop);

// 6. Narrow viewport: question list should still be visible
await page.setViewportSize({ width: 416, height: 900 });
await page.waitForTimeout(300);
await page.screenshot({ path: './smoke-out/MODAL-4-narrow.png', fullPage: false });
const narrowRows = await page.$$eval('#question-list li[data-id]', els => els.length);
console.log('Visible question rows in narrow viewport:', narrowRows);

await browser.close();
console.log('\nerrors:', errs.length);
errs.forEach(e => console.log('  ' + e));

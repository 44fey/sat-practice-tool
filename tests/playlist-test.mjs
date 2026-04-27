import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Reset to a known state
await page.evaluate(() => {
  localStorage.removeItem('sat-playlists-v1');
  localStorage.removeItem('sat-math-progress-v1');
  localStorage.removeItem('sat-sidebar-hidden');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// === Test 1: build a playlist from a filter (Algebra → Linear functions) ===
await page.evaluate(() => {
  const dets = Array.from(document.querySelectorAll('details.cat-domain'));
  const alg = dets.find(d => d.querySelector('.cat-name')?.textContent === 'Algebra');
  alg.open = true;
  const linfn = Array.from(alg.querySelectorAll('.cat-skill'))
    .find(s => s.querySelector('.cat-name')?.textContent === 'Linear functions');
  linfn.click();
});
await page.waitForTimeout(300);
const filteredAfter = await page.textContent('#filtered-count');
console.log('Filter "Linear functions":', filteredAfter, 'questions');

// Save as playlist via prompt
page.once('dialog', d => d.accept('Linear Functions Drill'));
await page.click('#save-filter-as-playlist');
await page.waitForTimeout(500);

// Confirm playlist appears + auto-activated
const banner = await page.isVisible('#active-playlist-banner');
const activeName = await page.textContent('#active-playlist-name');
const activeCount = await page.textContent('#active-playlist-count');
console.log('After save → banner visible:', banner, 'name:', activeName, 'count:', activeCount);
const playlistRows = await page.$$eval('.playlist-row', rs => rs.map(r => ({
  name: r.querySelector('.pl-name').textContent,
  count: r.querySelector('.pl-count').textContent,
  active: r.classList.contains('active'),
})));
console.log('Playlists in sidebar:', playlistRows);

// Clear the domain/skill filter — playlist should still constrain results
await page.click('#clear-btn');
await page.waitForTimeout(300);
const stillInPlaylist = await page.textContent('#filtered-count');
console.log('After clearing other filters, playlist still constrains to:', stillInPlaylist);

await page.screenshot({ path: './smoke-out/PLAYLIST-1-active.png', fullPage: false });

// === Test 2: navigate within the playlist ===
await page.click('#question-list li[data-id]:not([style*="italic"])');
await page.waitForTimeout(800);
const pos1 = await page.textContent('#position-pill');
console.log('First question opened →', pos1);
await page.click('#next-btn');
await page.waitForTimeout(400);
const pos2 = await page.textContent('#position-pill');
console.log('After Next →', pos2);

// === Test 3: exit playlist returns to all 826 ===
await page.click('#exit-playlist');
await page.waitForTimeout(300);
const exited = await page.textContent('#filtered-count');
const bannerAfter = await page.isVisible('#active-playlist-banner');
console.log('After Exit → filtered:', exited, 'banner:', bannerAfter);

// === Test 4: multi-select mode → save 3 hand-picked questions ===
await page.click('#toggle-select-mode');
await page.waitForTimeout(200);
const toolbar = await page.isVisible('#select-toolbar');
console.log('Select-mode toolbar visible:', toolbar);
// Click 3 different question rows
const ids = await page.$$eval('#question-list li[data-id]', els => els.slice(0, 3).map(el => el.dataset.id));
for (const id of ids) {
  await page.click(`#question-list li[data-id="${id}"]`);
  await page.waitForTimeout(80);
}
const selectCount = await page.textContent('#select-count');
console.log(`Picked ${selectCount} questions:`, ids);

page.once('dialog', d => d.accept('Three Specific Picks'));
await page.click('#save-selection');
await page.waitForTimeout(500);
const playlistsAfter = await page.$$eval('.playlist-row .pl-name', els => els.map(e => e.textContent));
console.log('Playlists now:', playlistsAfter);
const newActive = await page.textContent('#active-playlist-name');
console.log('Newly-active playlist:', newActive);

await page.screenshot({ path: './smoke-out/PLAYLIST-2-handpicked.png', fullPage: false });

// === Test 5: persistence across reload ===
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
const persisted = await page.$$eval('.playlist-row .pl-name', els => els.map(e => e.textContent));
console.log('After reload → playlists:', persisted);

// === Test 6: rename + delete ===
page.once('dialog', d => d.accept('Renamed Linear'));
await page.click('.playlist-row:has-text("Linear Functions Drill") [data-action="rename"]');
await page.waitForTimeout(300);
const renamed = await page.$$eval('.playlist-row .pl-name', els => els.map(e => e.textContent));
console.log('After rename →', renamed);

page.once('dialog', d => d.accept(true)); // confirm delete
await page.click('.playlist-row:has-text("Three Specific Picks") [data-action="delete"]');
await page.waitForTimeout(300);
const afterDelete = await page.$$eval('.playlist-row .pl-name', els => els.map(e => e.textContent));
console.log('After delete →', afterDelete);

await browser.close();
console.log('\nerrors:', errs.length);
errs.forEach(e => console.log('  ' + e));

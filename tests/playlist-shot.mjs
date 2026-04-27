import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Pre-populate two playlists in localStorage so the screenshot has content.
await page.evaluate(() => {
  const playlists = {
    'pl_demo_1': { id: 'pl_demo_1', name: 'Hard Algebra Drill', section: 'math', ids: Array(45).fill(0).map((_,i)=>'x'+i), created: Date.now() - 10000 },
    'pl_demo_2': { id: 'pl_demo_2', name: 'Geometry Review',    section: 'math', ids: Array(28).fill(0).map((_,i)=>'y'+i), created: Date.now() - 5000 },
    'pl_demo_3': { id: 'pl_demo_3', name: 'Yesterday’s Wrong Ones', section: 'math', ids: Array(7).fill(0).map((_,i)=>'z'+i), created: Date.now() },
  };
  localStorage.setItem('sat-playlists-v1', JSON.stringify(playlists));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

await page.screenshot({ path: './smoke-out/PLAYLIST-3-clean.png', fullPage: false });
await browser.close();
console.log('done');

import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
await page.evaluate(() => window.__test_selectQuestion('00b9bd37'));
await page.waitForTimeout(1500);
await page.click('#toggle-desmos');
await page.waitForFunction(() => !!window.Desmos, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: './smoke-out/DESMOS-open.png', fullPage: false });

// Drag wider
const handle = await page.$('#desmos-resize');
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 250, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
await page.screenshot({ path: './smoke-out/DESMOS-resized-wider.png', fullPage: false });

await browser.close();
console.log('done');

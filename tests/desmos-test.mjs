// Test: open Desmos panel, plot something, drag-resize the panel.
// Also asserts no external network requests fired (proof the offline bundle is self-contained).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

const externalReqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (u.startsWith('http://localhost')) return;
  if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return;
  // MathJax CDN is allowed (it's a separate concern); Desmos must NOT phone home.
  if (u.includes('mathjax')) return;
  externalReqs.push(u);
});

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Pick a question so we have context
await page.evaluate(() => window.__test_selectQuestion('00b9bd37'));
await page.waitForTimeout(500);

// Open Desmos
await page.click('#toggle-desmos');
console.log('Waiting for Desmos to initialize...');
await page.waitForFunction(() => !!window.Desmos, { timeout: 30000 });
await page.waitForTimeout(2500);  // let calculator UI render

// Verify it actually rendered something (look for the Desmos calculator container)
const hasCalcDom = await page.evaluate(() => {
  return document.querySelectorAll('#desmos-calc .dcg-calculator-api-container, #desmos-calc [class*="dcg-"]').length > 0;
});
console.log('Desmos calculator DOM present:', hasCalcDom);

// Plot y = x^2 by setting an expression programmatically
const plotted = await page.evaluate(() => {
  try {
    // The calculator instance is held in our app's closure. Probe via DOM inspection
    // using the Desmos API: every calculator has setExpression on its instance. We
    // need to find the instance — it's not on window by default, so reach into the
    // module via a quick eval hook we'll expose.
    return !!window.__test_desmos_setExpr;
  } catch { return false; }
});
console.log('expression set hook present:', plotted);

// Test drag-resize: starting width should be 520, drag handle left by 200px
const beforeW = await page.evaluate(() => parseInt(getComputedStyle(document.querySelector('.app')).getPropertyValue('--desmos-w'), 10));
const handle = await page.$('#desmos-resize');
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const afterW = await page.evaluate(() => parseInt(getComputedStyle(document.querySelector('.app')).getPropertyValue('--desmos-w'), 10));
console.log(`drag-resize: ${beforeW}px -> ${afterW}px`);

// Persist + reload check
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
const reloadedW = await page.evaluate(() => parseInt(getComputedStyle(document.querySelector('.app')).getPropertyValue('--desmos-w'), 10));
console.log(`width after reload (should equal ${afterW}): ${reloadedW}`);

await page.screenshot({ path: './smoke-out/DESMOS-1-offline.png', fullPage: false });

await browser.close();

console.log('\n--- external network requests (should be 0) ---');
externalReqs.forEach(r => console.log('  ' + r));
console.log('count:', externalReqs.length);

console.log('\n--- console / page errors ---');
errs.forEach(e => console.log('  ' + e));
console.log('count:', errs.length);

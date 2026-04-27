import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Reset sidebar pref so we start visible
await page.evaluate(() => localStorage.removeItem('sat-sidebar-hidden'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Pick a question so the question pane has content
await page.evaluate(() => window.__test_selectQuestion('00b9bd37'));
await page.waitForTimeout(2000);
await page.screenshot({ path: './smoke-out/SIDEBAR-1-shown.png', fullPage: false });

// Hide via the toggle button in the sidebar header
await page.click('#toggle-sidebar');
await page.waitForTimeout(400);
const sidebarVisible = await page.isVisible('#sidebar');
const showBtnVisible = await page.isVisible('#show-sidebar');
console.log('after hide → sidebar visible:', sidebarVisible, 'show button visible:', showBtnVisible);
await page.screenshot({ path: './smoke-out/SIDEBAR-2-hidden.png', fullPage: false });

// Restore via the floating button
await page.click('#show-sidebar');
await page.waitForTimeout(300);
const sidebarBack = await page.isVisible('#sidebar');
console.log('after click "Show navigation" → sidebar visible:', sidebarBack);

// Hide again, restore via the keyboard shortcut
await page.click('#toggle-sidebar');
await page.waitForTimeout(200);
await page.keyboard.press('Backslash');
await page.waitForTimeout(300);
const sidebarKey = await page.isVisible('#sidebar');
console.log('after \\ shortcut → sidebar visible:', sidebarKey);

// Persist across reload
await page.click('#toggle-sidebar');
await page.waitForTimeout(200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
await page.waitForTimeout(300);
const persisted = await page.isVisible('#show-sidebar');
console.log('after reload (was hidden) → show button visible:', persisted);

await browser.close();
console.log('errors:', errs.length);
errs.forEach(e => console.log('  ' + e));

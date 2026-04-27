import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));
await page.evaluate(() => {
  localStorage.removeItem('sat-math-progress-v1');
  localStorage.removeItem('sat-sidebar-hidden');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

// Open Algebra + Craft and Structure (any one) to show the nested look
await page.evaluate(() => {
  const dets = Array.from(document.querySelectorAll('details.cat-domain'));
  const alg = dets.find(d => d.querySelector('.cat-name')?.textContent === 'Algebra');
  if (alg) alg.open = true;
});
await page.waitForTimeout(300);
await page.screenshot({ path: './smoke-out/NESTED-1-algebra-open.png', fullPage: false });

// Programmatically check a domain (Algebra) and a skill within it
const result = await page.evaluate(() => {
  const dets = Array.from(document.querySelectorAll('details.cat-domain'));
  const alg = dets.find(d => d.querySelector('.cat-name')?.textContent === 'Algebra');
  // Click the domain checkbox
  const cb = alg.querySelector('summary .cat-checkbox');
  cb.click();
  return {
    cbClass: cb.className,
    filteredCount: document.querySelector('#filtered-count').textContent,
  };
});
console.log('after domain checkbox click:', result);
await page.screenshot({ path: './smoke-out/NESTED-2-algebra-checked.png', fullPage: false });

// Now click a skill row
const result2 = await page.evaluate(() => {
  const dets = Array.from(document.querySelectorAll('details.cat-domain'));
  const alg = dets.find(d => d.querySelector('.cat-name')?.textContent === 'Algebra');
  const skills = Array.from(alg.querySelectorAll('.cat-skill'));
  const skill = skills.find(s => s.querySelector('.cat-name')?.textContent === 'Linear equations in two variables');
  skill.click();
  return {
    skillActive: skill.classList.contains('active'),
    filteredCount: document.querySelector('#filtered-count').textContent,
  };
});
console.log('after skill click:', result2);
await page.screenshot({ path: './smoke-out/NESTED-3-skill-checked.png', fullPage: false });

// Clear via the button
await page.click('#clear-btn');
await page.waitForTimeout(300);
const cleared = await page.evaluate(() => ({
  filteredCount: document.querySelector('#filtered-count').textContent,
  checkedBoxes: document.querySelectorAll('.cat-checkbox.checked').length,
}));
console.log('after Clear:', cleared);

await browser.close();
console.log('errors:', errs.length);
errs.forEach(e => console.log('  ' + e));

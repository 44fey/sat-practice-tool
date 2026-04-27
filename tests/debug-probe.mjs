import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const browser = await chromium.launch();
const page = await browser.newContext().then(c => c.newPage());
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''));

for (const qid of ['dba8d38a', '5cf1bbc9']) {
  console.log('\n=== ' + qid + ' ===');
  const payload = JSON.parse(await readFile(`./data/questions/${qid}.json`, 'utf-8'));
  await page.evaluate((q) => window.__test_selectQuestion(q), qid);
  await page.waitForTimeout(800);
  const stemHTML = await page.evaluate(() => document.querySelector('#q-stem').innerHTML);

  const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const stemPlain = strip(stemHTML);

  if (payload.source === 'legacy') {
    const promptStrip = strip(payload.detail.prompt || '');
    const mid = Math.floor(promptStrip.length / 3);
    const probe = promptStrip.slice(mid, mid + 24);
    console.log('prompt-len:', promptStrip.length, 'stem-len:', stemPlain.length);
    console.log('probe:', JSON.stringify(probe));
    console.log('rendered (around expected position):', JSON.stringify(stemPlain.slice(mid - 5, mid + 35)));
    console.log('match?', stemPlain.includes(probe));
  } else {
    const t = strip(payload.detail.stem || '');
    const mid = Math.floor(t.length / 3);
    const probe = t.slice(mid, mid + 24);
    console.log('stem source-len:', t.length, 'rendered-len:', stemPlain.length);
    console.log('probe:', JSON.stringify(probe));
    console.log('rendered (around expected position):', JSON.stringify(stemPlain.slice(mid - 5, mid + 35)));
    console.log('match?', stemPlain.includes(probe));
  }
}

await browser.close();

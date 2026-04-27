// Verifies localStorage persists across Electron relaunches.
// Bug it tests for: with the old random-port HTTP server, every launch
// created a new origin and localStorage got dropped. With the
// app:// protocol, the origin is stable and progress should survive.

const { _electron: electron } = require('playwright');
const path = require('node:path');

(async () => {
  const args = ['.'];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const cwd = path.resolve(__dirname, '..');

  // ----- Launch 1: write a value -----
  console.log('Launch 1 — writing localStorage value...');
  let appHandle = await electron.launch({ args, env, cwd });
  let win = await appHandle.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  // Wait for the viewer to load enough that localStorage is initialized
  await win.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''), null, { timeout: 30000 });

  const url1 = win.url();
  console.log('  url:', url1);

  await win.evaluate(() => {
    localStorage.setItem('persistence-test-key', 'hello-' + Date.now());
    localStorage.setItem('sat-math-progress-v1', JSON.stringify({
      'TEST-Q1': { status: 'correct', ts: Date.now() },
    }));
  });
  const written = await win.evaluate(() => localStorage.getItem('persistence-test-key'));
  console.log('  wrote:', written);
  await appHandle.close();

  // ----- Launch 2: read the value back -----
  console.log('\nLaunch 2 — reading localStorage value...');
  appHandle = await electron.launch({ args, env, cwd });
  win = await appHandle.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForFunction(() => /\d/.test(document.querySelector('#all-count')?.textContent || ''), null, { timeout: 30000 });

  const url2 = win.url();
  console.log('  url:', url2);

  const read = await win.evaluate(() => localStorage.getItem('persistence-test-key'));
  const progress = await win.evaluate(() => localStorage.getItem('sat-math-progress-v1'));
  console.log('  read back persistence-test-key:', read);
  console.log('  read back sat-math-progress-v1:', progress);

  // Sanity: the in-app counters should reflect the saved progress
  const correctCount = await win.textContent('#ps-correct-n');
  console.log('  correct counter shown in UI:', correctCount);

  await appHandle.close();

  console.log('\n--- result ---');
  if (read && read === written) {
    console.log('✓ localStorage persisted across relaunches.');
    process.exit(0);
  } else {
    console.log('✗ localStorage was DROPPED across relaunches.');
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(2); });

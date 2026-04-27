// Spawn an .exe, poll until a known child electron process appears, and
// print elapsed time. A rough but stable measurement — actual "window
// visible" is a couple hundred ms later but this gives a comparable number.
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const exePath = process.argv[2];
if (!exePath) { console.error('usage: node time-startup.cjs <exe>'); process.exit(2); }

function listProcs(name) {
  try {
    return execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH /FO CSV 2>nul`, { encoding: 'utf-8' });
  } catch { return ''; }
}

const baseName = path.basename(exePath);
// End-users won't have ELECTRON_RUN_AS_NODE set; strip it for a fair test.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const start = Date.now();
const proc = spawn(exePath, [], { detached: true, stdio: 'ignore', env });
proc.unref();

(async () => {
  const cap = 30000;
  let firstSpawn = null;
  let stable = null;
  let priorCount = 0;
  while (Date.now() - start < cap) {
    // "SAT Practice Tool.exe" is the unpacked Electron binary that the
    // portable wrapper / installer eventually launches. Look for it.
    const out = listProcs('SAT Practice Tool.exe');
    const count = (out.match(/SAT Practice Tool\.exe/g) || []).length;
    if (count > 0 && firstSpawn === null) firstSpawn = Date.now();
    // Electron typically spawns ~4 helper processes; "stable" once we hit ≥4
    // and don't increase on the next tick.
    if (count >= 4 && count === priorCount && stable === null) {
      stable = Date.now();
      break;
    }
    priorCount = count;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(JSON.stringify({
    exe: baseName,
    timeToFirstProc: firstSpawn ? firstSpawn - start : null,
    timeToStable:    stable     ? stable - start     : null,
  }));
  // Best-effort cleanup
  try { execSync('taskkill /F /IM "SAT Practice Tool.exe" 2>nul', { stdio: 'ignore' }); } catch {}
  try { execSync(`taskkill /F /IM "${baseName}" 2>nul`, { stdio: 'ignore' }); } catch {}
})();

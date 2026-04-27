// Invoke electron-builder's JS entry directly so we (a) avoid the .cmd shim
// breaking on paths-with-spaces, and (b) clear ELECTRON_RUN_AS_NODE before
// it propagates into helper processes.
const { spawn } = require('node:child_process');
const path = require('node:path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Avoid the winCodeSign extraction that needs Windows Developer Mode / Admin
// to create symlinks. We don't sign anyway.
env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
env.WIN_CSC_LINK = '';

const builderJs = path.join(__dirname, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const child = spawn(process.execPath, [builderJs, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
child.on('exit', (code) => process.exit(code ?? 0));

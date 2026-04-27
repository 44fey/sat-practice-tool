// Launches Electron with ELECTRON_RUN_AS_NODE cleared from env. Some shells
// (Claude Code's bash, certain terminals) set this var globally to make
// the bundled Electron behave as plain Node — which then breaks
// `require('electron')` in our main process. cross-env can't unset, so this
// tiny wrapper does it.
const { spawn } = require('node:child_process');
const electronPath = require('electron');

const args = process.argv.slice(2);
if (args.length === 0) args.push('.');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args, { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));

// electron-builder afterPack hook.
// We disabled signAndEditExecutable in package.json to dodge the broken
// winCodeSign symlink extraction (Windows requires admin/dev mode for
// macOS-style symlinks inside the bundled archive). That flag also disables
// rcedit, which is what embeds the .ico into the .exe — so without this
// hook, the installed binary would show the default Electron icon.
//
// Here we reach into the cached rcedit and run it manually on the unpacked
// Electron binary before electron-builder builds the NSIS / portable
// installer around it. End result: the installed shortcut, the
// taskbar icon, and the .exe's file-explorer icon all use our custom .ico.

const path = require('node:path');
const fs = require('node:fs/promises');
const { rcedit } = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.resolve(__dirname, 'icon.ico');
  const pkg = require('../package.json');

  // Probe — confirm the icon file is on disk before we ask rcedit to embed it.
  await fs.access(iconPath);

  console.log(`  • [afterPack] Embedding icon and version info into ${path.basename(exePath)}`);
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: 'SAT Practice Tool',
      FileDescription: 'SAT Practice Tool',
      CompanyName: '44fey',
      LegalCopyright: 'MIT — see LICENSE.electron.txt and CREDITS.md',
      OriginalFilename: 'SAT Practice Tool.exe',
    },
    'file-version': pkg.version,
    'product-version': pkg.version,
  });
  console.log('  • [afterPack] Done.');
};

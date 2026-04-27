// Electron main process for the SAT Practice Tool.
//
// Earlier versions ran a tiny embedded HTTP server on a random local
// port (server.listen(0, ...)) and pointed the BrowserWindow at it.
// That broke localStorage persistence: a fresh port every launch meant
// a fresh origin every launch, so progress, playlists, and saved
// answers all got dropped on the floor when the user reopened the app.
//
// This version registers a custom `app://` protocol instead. Same
// origin every launch (`app://localhost`), so the renderer's
// localStorage points at the same bucket the user filled in their last
// session. Also a bit faster — no HTTP loop to spin up.

if (typeof require('electron') === 'string') {
  console.error('Electron started in Node-only mode (ELECTRON_RUN_AS_NODE is set in env). Aborting.');
  process.exit(1);
}

const { app, BrowserWindow, shell, Menu, protocol } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

// In dev (`npm run electron`) the project files live next to this
// script. In a packaged build, `extraResources` puts viewer/, data/,
// desmos-offline-main/ under `process.resourcesPath`.
const ROOT = app.isPackaged ? process.resourcesPath : __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// Privilege the scheme BEFORE app is ready. Without `standard: true`,
// relative URLs and fetch() in the page don't behave like they do over
// http(s). Without `secure: true`, the page isn't a "secure context"
// and localStorage gets restricted.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true,
  } },
]);

async function handleAppRequest(req) {
  try {
    const u = new URL(req.url);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname === '/' || pathname === '') pathname = '/viewer/';
    let filePath = path.normalize(path.join(ROOT, pathname));

    // Path traversal guard
    if (!filePath.startsWith(ROOT)) {
      return new Response('forbidden', { status: 403 });
    }

    let stat;
    try { stat = await fs.stat(filePath); }
    catch { return new Response('not found: ' + req.url, { status: 404 }); }

    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(data, {
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response('error: ' + String(err), { status: 500 });
  }
}

async function createWindow() {
  protocol.handle('app', handleAppRequest);

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    title: 'SAT Practice Tool',
    backgroundColor: '#f3f4f6',
    autoHideMenuBar: true,
    show: false,                     // avoid blank-frame flash on cold start
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,   // keep timers responsive
    },
  });
  win.once('ready-to-show', () => win.show());

  // Open external links (e.g. cdn.jsdelivr for MathJax fallbacks) in
  // the user's default browser instead of inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await win.loadURL('app://localhost/viewer/');
}

// Hide the default menu bar entirely (still toggleable with Alt).
Menu.setApplicationMenu(null);

// Trim some Chromium subsystems we don't use (cuts ~50–150ms cold start).
app.commandLine.appendSwitch('disable-features',
  'DialMediaRouteProvider,MediaRouter,WidgetCertificateAuthority,OptimizationHints,Translate');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

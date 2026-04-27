// Electron main process for the SAT Practice Tool.
// Starts a tiny embedded HTTP server on a random local port and loads the
// existing browser-based viewer in a BrowserWindow. The viewer code is
// unchanged from the web version.

// If ELECTRON_RUN_AS_NODE is set in the environment, Electron behaves like
// a plain Node — `require('electron')` returns a path string and the API is
// unavailable. Bail clearly so the user knows.
if (typeof require('electron') === 'string') {
  console.error('Electron started in Node-only mode (ELECTRON_RUN_AS_NODE is set).');
  console.error('Run "set ELECTRON_RUN_AS_NODE=" (cmd) or "$env:ELECTRON_RUN_AS_NODE=$null" (PowerShell) before launching, or use the npm script "npm run electron".');
  process.exit(1);
}
const { app, BrowserWindow, shell, Menu } = require('electron');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

// In dev (`electron .`) the project files live next to this script.
// In a packaged build, `extraResources` puts viewer/, data/,
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

let serverPort = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/') {
          res.writeHead(302, { Location: '/viewer/' });
          res.end();
          return;
        }
        const filePath = path.normalize(path.join(ROOT, pathname));
        if (!filePath.startsWith(ROOT)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const stat = await fs.stat(filePath);
        const real = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
        const buf = await fs.readFile(real);
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(buf);
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found: ' + req.url);
      }
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
    server.on('error', reject);
  });
}

async function createWindow() {
  const port = await startServer();

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    title: 'SAT Practice Tool',
    backgroundColor: '#f3f4f6',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links (e.g. cdn.jsdelivr) in the user's default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${port}`)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
}

// Hide the default menu bar entirely (still toggleable with Alt).
Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

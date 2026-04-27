// Generates build/icon.png (512×512) and build/icon.ico (multi-size) from a
// designed-in-code SVG. Run with: node build/make-icon.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const pngToIco = require('png-to-ico').default;

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <!-- Bluebook-style multi-color dashes -->
  <g stroke-width="6" stroke-linecap="round" opacity="0.85">
    <line x1="64"  y1="106" x2="120" y2="106" stroke="#fff"/>
    <line x1="138" y1="106" x2="180" y2="106" stroke="#facc15"/>
    <line x1="200" y1="106" x2="260" y2="106" stroke="#fff"/>
    <line x1="278" y1="106" x2="320" y2="106" stroke="#3b82f6"/>
    <line x1="340" y1="106" x2="448" y2="106" stroke="#fff"/>
  </g>
  <text x="256" y="300" text-anchor="middle"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="180" font-weight="800" fill="#fff" letter-spacing="6">SAT</text>
  <text x="256" y="380" text-anchor="middle"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="46" font-weight="500" fill="#fff" opacity="0.85">Practice Tool</text>
  <g stroke-width="6" stroke-linecap="round" opacity="0.85">
    <line x1="64"  y1="426" x2="172" y2="426" stroke="#fff"/>
    <line x1="190" y1="426" x2="232" y2="426" stroke="#3b82f6"/>
    <line x1="252" y1="426" x2="312" y2="426" stroke="#fff"/>
    <line x1="332" y1="426" x2="374" y2="426" stroke="#facc15"/>
    <line x1="394" y1="426" x2="448" y2="426" stroke="#fff"/>
  </g>
</svg>
`;

const HTML = `<!doctype html><html><body style="margin:0;background:transparent">
${SVG}
</body></html>`;

(async () => {
  const outDir = __dirname;
  await fs.mkdir(outDir, { recursive: true });

  console.log('Rendering icon SVG to PNG…');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(HTML);
  await page.waitForTimeout(150);
  const pngBuf = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
  await browser.close();

  const pngPath = path.join(outDir, 'icon.png');
  await fs.writeFile(pngPath, pngBuf);
  console.log(`  → ${pngPath} (${pngBuf.length} bytes)`);

  console.log('Building multi-size .ico…');
  const ico = await pngToIco(pngPath);
  const icoPath = path.join(outDir, 'icon.ico');
  await fs.writeFile(icoPath, ico);
  console.log(`  → ${icoPath} (${ico.length} bytes)`);

  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });

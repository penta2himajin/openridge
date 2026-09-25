/**
 * Build public/og.png — Open Graph card (1200×630).
 *
 * Background: latest committed models.json rendered in Compare mode
 * (?view=compare), lightly blurred. Foreground: OpenRidge wordmark with a
 * ridge silhouette whose highest peak sits in the gap between "Open" and
 * "Ridge".
 *
 * Usage: npm run build && npm run og
 * (or: npx tsx scripts/build-og.ts — expects dist/ already built)
 *
 * CI: deploy.yml runs this after `astro build` so openridge.dev/og.png always
 * matches the models.json that just shipped (including daily refresh deploys).
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "public", "og.png");
const CACHE = join(ROOT, "scripts", ".og-cache");
const W = 1200;
const H = 630;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serveDist(port: number): Promise<{ close: () => void; url: string }> {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error("dist/ missing — run `npm run build` first");
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        close: () => server.close(),
        url: `http://127.0.0.1:${port}`,
      }),
    );
  });
}

async function captureCompare(baseUrl: string, dest: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 2,
    });
    await page.goto(`${baseUrl}/?view=compare`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    // Chart is client-rendered; wait for the frontier path or scatter points.
    await page.waitForSelector(
      "svg .ridge-frontier-line, svg circle.ridge-point",
      {
        timeout: 30_000,
      },
    );
    // Let Plot/D3 settle layout after the first paint.
    await page.waitForTimeout(800);
    await page.screenshot({ path: dest, type: "png" });
  } finally {
    await browser.close();
  }
}

/** Soft ridge path; peak X ≈ logo junction (Open | Ridge) at card centre. */
function ridgeSvg(): string {
  // Peak at x=600 (card centre) — sits in the gap between Open and Ridge.
  // y coords: lower number = higher on screen. Peak tip just above the wordmark.
  const peakX = 600;
  const peakY = 235;
  const baseline = 420;
  // Control a mountain silhouette: foothills → main peak → secondary ridge → drop.
  const d = [
    `M 40 ${baseline}`,
    `L 160 390`,
    `L 280 355`,
    `L 380 370`,
    `L 470 310`,
    `L ${peakX} ${peakY}`,
    `L 690 330`,
    `L 780 300`,
    `L 900 360`,
    `L 1020 340`,
    `L 1160 ${baseline}`,
  ].join(" ");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="ridgeFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#BEEE7E" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#BEEE7E" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="${d} L 1160 ${H} L 40 ${H} Z" fill="url(#ridgeFill)"/>
  <path d="${d}" fill="none" stroke="#BEEE7E" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>
</svg>`;
}

async function composeCard(bgPath: string, dest: string) {
  const blurred = await sharp(bgPath)
    .resize(W, H, { fit: "cover", position: "centre" })
    .blur(8)
    .modulate({ brightness: 0.68, saturation: 0.8 })
    .png()
    .toBuffer();

  const dim = await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 26, g: 27, b: 34, alpha: 0.35 },
    },
  })
    .png()
    .toBuffer();

  const ridge = await sharp(Buffer.from(ridgeSvg())).png().toBuffer();

  // Wordmark via Playwright so webfonts actually load (sharp SVG text is unreliable).
  // Measure glyph boxes so the Open|Ridge junction lands exactly on peakX=600
  // (the ridge tip sits in that gap, just above the type).
  const browser = await chromium.launch({ headless: true });
  let wordmarkPng: Buffer;
  try {
    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html><html><head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5.2.5/400.css"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-mono@5.2.5/700.css"/>
        <style>
          html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
          .mark{position:absolute;left:50%;top:248px;transform:translateX(-50%);
            display:flex;align-items:baseline;gap:0.1em;white-space:nowrap;
            font-size:92px;line-height:1;letter-spacing:-0.02em}
          .open{font-family:"Geist Sans",Inter,system-ui,sans-serif;font-style:oblique;
            font-weight:400;color:#9A9CA3}
          .ridge{font-family:"Geist Mono",ui-monospace,monospace;font-weight:700;
            color:#F2F2F5}
        </style></head><body>
        <div class="mark"><span class="open">Open</span><span class="ridge">Ridge</span></div>
      </body></html>`,
      { waitUntil: "networkidle" },
    );
    // Wait until both faces resolve (oblique Sans + bold Mono).
    await page.evaluate(async () => {
      await document.fonts.ready;
      await document.fonts.load('400 92px "Geist Sans"');
      await document.fonts.load('700 92px "Geist Mono"');
    });
    await page.waitForTimeout(200);
    wordmarkPng = await page.screenshot({ type: "png", omitBackground: true });
  } finally {
    await browser.close();
  }

  await sharp(blurred)
    .composite([
      { input: dim, blend: "over" },
      { input: ridge, blend: "over" },
      { input: wordmarkPng, blend: "over" },
    ])
    .png()
    .toFile(dest);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const bgPath = join(CACHE, "compare.png");

  const { close, url } = await serveDist(4177);
  try {
    console.error(`Capturing Compare mode from ${url}/?view=compare …`);
    await captureCompare(url, bgPath);
  } finally {
    close();
  }

  console.error("Composing OG card …");
  await composeCard(bgPath, OUT);
  // Astro copies public/ → dist/ on build; also drop a copy into dist for
  // local preview without a rebuild.
  const distCopy = join(DIST, "og.png");
  if (existsSync(DIST)) writeFileSync(distCopy, readFileSync(OUT));
  console.error(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

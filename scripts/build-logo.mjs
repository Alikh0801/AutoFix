// Builds the AutoFix logo files from one definition.
//
// The mark is the same two polygons the app draws (src/components/Logo.tsx),
// so an exported file and the running app cannot drift apart. It is rasterised
// here rather than by a browser: headless Chromium cannot take screenshots in
// this container, and the shape is simple enough that scanline filling with
// 4x supersampling gives clean edges without pulling in a renderer.
//
// The wordmark is not rasterised — that needs glyph outlines from the font,
// which is a different problem. It ships as SVG plus brand-sheet.html, which
// embeds the real font so any browser can export it at any size.
//
//   node scripts/build-logo.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';

const OUT = 'assets/brand';
const C = { bg: '#0E1116', amber: '#FFB627', cream: '#F5F3EE' };

const BOLT = [[118, 18], [54, 106], [90, 106], [74, 182], [152, 88], [106, 88]];
const NOTCH = [[106, 96], [101, 87.5], [91, 87.5], [86, 96], [91, 104.5], [101, 104.5]];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Standard crossing-number test. The shapes are simple, closed and
 *  non-self-intersecting, so this is enough. */
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The notch is knocked out rather than painted over: filling it with the dark
 * background colour would carry a dark chip onto whatever the mark is placed
 * on, which is exactly what a transparent export is for.
 */
function render(size, color, pad = 0.09) {
  const [r, g, b] = hex(color);
  const png = new PNG({ width: size, height: size });

  const xs = BOLT.map((p) => p[0]);
  const ys = BOLT.map((p) => p[1]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY);
  const scale = (size * (1 - pad * 2)) / span;
  const offX = (size - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (size - (maxY - minY) * scale) / 2 - minY * scale;

  const SS = 4; // supersamples per axis
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - offX) / scale;
          const y = (py + (sy + 0.5) / SS - offY) / scale;
          if (inside(BOLT, x, y) && !inside(NOTCH, x, y)) covered++;
        }
      }
      const i = (py * size + px) << 2;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = Math.round((covered / (SS * SS)) * 255);
    }
  }
  return PNG.sync.write(png);
}

mkdirSync(OUT, { recursive: true });

const pngs = [
  ['autofix-mark-1024.png', 1024, C.amber],
  ['autofix-mark-512.png', 512, C.amber],
  ['autofix-mark-256.png', 256, C.amber],
  ['autofix-mark-cream-1024.png', 1024, C.cream],
];
for (const [name, size, color] of pngs) {
  writeFileSync(join(OUT, name), render(size, color));
  console.log(`✅ ${OUT}/${name}  ${size}×${size}`);
}

// --- Vector ----------------------------------------------------------------

const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');

/** `notch` null leaves the cut-out transparent. */
const markSvg = (fill, notch) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <title>AutoFix</title>
  <path d="M${pts(BOLT).replace(/ /g, 'L')}Z M${pts(NOTCH).replace(/ /g, 'L')}Z"
        fill="${fill}" fill-rule="evenodd"/>${
    notch ? `\n  <polygon points="${pts(NOTCH)}" fill="${notch}"/>` : ''
  }
</svg>
`;

writeFileSync(join(OUT, 'autofix-mark.svg'), markSvg(C.amber, null));
writeFileSync(join(OUT, 'autofix-mark-cream.svg'), markSvg(C.cream, null));
console.log(`✅ ${OUT}/autofix-mark.svg + autofix-mark-cream.svg`);

/** Live text, not outlines: tracing glyphs without the font would guess at
 *  shapes, and a wrong letterform is worse than one that needs the font. */
const lockup = (textColor) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 200" width="620" height="200">
  <title>AutoFix</title>
  <path d="M${pts(BOLT).replace(/ /g, 'L')}Z M${pts(NOTCH).replace(/ /g, 'L')}Z"
        fill="${C.amber}" fill-rule="evenodd"/>
  <text x="200" y="133" font-family="Space Grotesk, Arial, Helvetica, sans-serif"
        font-weight="700" font-size="98" letter-spacing="-2.5" fill="${textColor}">AutoFix</text>
</svg>
`;

writeFileSync(join(OUT, 'autofix-lockup-dark.svg'), lockup(C.cream));
writeFileSync(join(OUT, 'autofix-lockup-light.svg'), lockup(C.bg));
console.log(`✅ ${OUT}/autofix-lockup-dark.svg + autofix-lockup-light.svg`);

// --- Brand sheet ------------------------------------------------------------

const font = readFileSync(
  'node_modules/@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf'
).toString('base64');

writeFileSync(
  join(OUT, 'brand-sheet.html'),
  `<!doctype html>
<html lang="az"><head><meta charset="utf-8">
<title>AutoFix — loqo</title>
<style>
  @font-face{font-family:'Space Grotesk';
    src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:700}
  *{box-sizing:border-box}
  body{margin:0;background:#0E1116;color:#F5F3EE;
       font:15px/1.6 system-ui,sans-serif;padding:40px 20px}
  .wrap{max-width:840px;margin:0 auto}
  h1{font-family:'Space Grotesk';font-size:26px;margin:0 0 6px}
  p.note{color:#93A0AC;margin:0 0 32px;max-width:62ch}
  section{border:1px solid #2A3038;border-radius:16px;padding:28px;margin-bottom:18px}
  h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;
     color:#5B6570;font-weight:600;margin:0 0 20px}
  .lockup{display:flex;align-items:center;gap:22px}
  .lockup svg{width:84px;height:84px;display:block}
  .wm{font-family:'Space Grotesk';font-weight:700;font-size:58px;letter-spacing:-.025em;line-height:1}
  .on-light{background:#fff;border-radius:12px;padding:28px}
  .on-light .wm{color:#0E1116}
  .sizes{display:flex;align-items:flex-end;gap:26px}
  .sizes svg{display:block}
  code{background:#1F242D;padding:2px 6px;border-radius:5px;font-size:13px}
  ul{color:#93A0AC;margin:0;padding-left:20px} li{margin-bottom:5px}
  .sw{display:flex;gap:12px;flex-wrap:wrap;margin-top:4px}
  .sw div{border-radius:10px;padding:12px 14px;font:12px/1.4 ui-monospace,monospace;min-width:120px}
</style></head><body><div class="wrap">

<h1>AutoFix — loqo</h1>
<p class="note">PNG lazımdırsa, bu səhifədən ekran şəkli çıxarmaq əvəzinə
<code>assets/brand/</code> qovluğundakı hazır fayllardan istifadə et. Bu səhifə
sözlü variantı göstərmək və istənilən ölçüdə ixrac etmək üçündür.</p>

<section>
  <h2>Əsas lockup — tünd fon</h2>
  <div class="lockup">${markSvg(C.amber, null).replace('<?xml.*?>', '')}<span class="wm">AutoFix</span></div>
</section>

<section>
  <h2>Açıq fon</h2>
  <div class="lockup on-light">${markSvg(C.amber, null)}<span class="wm">AutoFix</span></div>
</section>

<section>
  <h2>Nişan — ölçülər</h2>
  <div class="sizes">
    <svg viewBox="0 0 200 200" width="96" height="96"><path d="M${pts(BOLT).replace(/ /g, 'L')}Z M${pts(NOTCH).replace(/ /g, 'L')}Z" fill="${C.amber}" fill-rule="evenodd"/></svg>
    <svg viewBox="0 0 200 200" width="64" height="64"><path d="M${pts(BOLT).replace(/ /g, 'L')}Z M${pts(NOTCH).replace(/ /g, 'L')}Z" fill="${C.amber}" fill-rule="evenodd"/></svg>
    <svg viewBox="0 0 200 200" width="40" height="40"><path d="M${pts(BOLT).replace(/ /g, 'L')}Z M${pts(NOTCH).replace(/ /g, 'L')}Z" fill="${C.amber}" fill-rule="evenodd"/></svg>
    <svg viewBox="0 0 200 200" width="24" height="24"><path d="M${pts(BOLT).replace(/ /g, 'L')}Z M${pts(NOTCH).replace(/ /g, 'L')}Z" fill="${C.amber}" fill-rule="evenodd"/></svg>
  </div>
</section>

<section>
  <h2>Rənglər</h2>
  <div class="sw">
    <div style="background:#FFB627;color:#0E1116">#FFB627<br>amber</div>
    <div style="background:#0E1116;color:#F5F3EE;border:1px solid #2A3038">#0E1116<br>bg</div>
    <div style="background:#F5F3EE;color:#0E1116">#F5F3EE<br>cream</div>
  </div>
</section>

<section>
  <h2>Qaydalar</h2>
  <ul>
    <li>Nişanın ətrafında ən azı öz hündürlüyünün dörddə biri qədər boşluq saxla</li>
    <li>Nişanı əzmə, döndərmə, kölgə və ya kontur əlavə etmə</li>
    <li>Rəngli və ya şəkilli fonda <code>autofix-mark-cream</code> variantından istifadə et</li>
    <li>24px-dən kiçik ölçülərdə yalnız nişan, sözsüz</li>
  </ul>
</section>

</div></body></html>
`
);
console.log(`✅ ${OUT}/brand-sheet.html`);

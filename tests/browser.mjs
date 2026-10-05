import { chromium, webkit } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(), out = path.join(root, 'artifacts'); fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); const relative = pathname.replace(/^\/signs-app\//, '/'); const f = path.join(root, relative === '/' ? 'index.html' : relative); if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); } res.setHeader('Content-Type', mime[path.extname(f)] || 'text/plain'); fs.createReadStream(f).pipe(res); });
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
let checks = 0;
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/signs-app/'); await page.waitForFunction(() => document.documentElement.dataset.version === '1.0.0');
    assert.equal(await page.locator('#barcode-details').evaluate(e => e.open), false); checks++;
    await page.locator('#title').fill('לחמניות עשרייה ברמן'); await page.locator('#subtitle').fill('10 לחמניות בשקית'); await page.locator('#price').fill('12.90');
    await page.locator('[data-type=outdoor]').click(); assert.equal(await page.locator('.template-option').count(), 7); checks++;
    for (const id of ['frame', 'banner', 'burst', 'ticket', 'elegant', 'split', 'bold']) { await page.locator(`[data-template=${id}]`).click(); await page.waitForTimeout(80); if (name === 'chromium') await page.locator('#live-preview').screenshot({ path: path.join(out, `template-${id}.png`) }); assert.equal(await page.locator(`[data-template=${id}]`).getAttribute('aria-pressed'), 'true'); checks++; }
    await page.locator('[data-template=frame]').click(); await page.locator('#save-sign').click(); assert.equal(await page.locator('.saved-sign').count(), 1); checks++;
    await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.version === '1.0.0'); assert.equal(await page.locator('#title').inputValue(), 'לחמניות עשרייה ברמן'); assert.equal(await page.locator('.saved-sign').count(), 1); checks++;
    await page.locator('[data-entry=calc]').click(); await page.locator('#cost').fill('10'); await page.locator('#vat').fill('18'); await page.locator('#margin').fill('25'); await page.locator('[data-suggestion="2"]').click(); assert.equal(await page.locator('#price').inputValue(), '31.47'); assert.equal(await page.locator('#quantity').inputValue(), '2'); checks++;
    await page.locator('#price').fill('20'); await page.waitForTimeout(80); assert.ok((await page.locator('#actual-profit').textContent()).includes('נמוך')); checks++;
    await page.locator('[data-entry=manual]').click(); await page.locator('#title').fill('קוקה קולה / זירו'); await page.locator('#subtitle').fill('1.5 ליטר'); await page.locator('#quantity').fill('4'); await page.locator('#price').fill('35');
    await page.locator('#barcode-details summary').click(); await page.locator('#barcode-input').fill('7290110115203'); await page.locator('#add-barcode').click(); await page.locator('#withBarcodes').check();
    await page.locator('#preview-print').click(); await page.waitForSelector('.print-sheet canvas'); assert.equal(await page.locator('.print-sheet').count(), 2); checks++;
    const downloadPromise = page.waitForEvent('download'); await page.locator('#download-pdf').click(); const download = await downloadPromise; await download.saveAs(path.join(out, `${name}-signs.pdf`)); assert.ok(fs.statSync(path.join(out, `${name}-signs.pdf`)).size > 10000); checks++;
    await page.locator('#close-print').click();
    if (name === 'chromium') { await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1100 }); await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false); checks++;
    await page.locator('[data-type=indoor]').click(); await page.locator('#preview-print').click();
    for (const layout of ['4', '2small', '2', '1']) { await page.locator('#print-layout').selectOption(layout); const dimensions = await page.locator('.print-sheet canvas').first().evaluate(c => [c.width, c.height]); assert.deepEqual(dimensions, layout === '1' ? [1754, 1240] : [1240, 1754]); checks++; }
    await page.locator('#close-print').click();
    await page.locator('#title').fill('<img src=x onerror=alert(1)>'); await page.locator('#save-sign').click(); assert.equal(await page.locator('#library-list img').count(), 0); checks++;
    assert.deepEqual(errors, []); checks++;
    await context.close(); await browser.close();
  }
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ checks, browsers: ['chromium', 'webkit'], status: 'passed' }, null, 2)); console.log(`PASS: ${checks} browser assertions (Chromium + WebKit)`);
} finally { server.close(); }

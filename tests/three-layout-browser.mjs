import fs from 'node:fs';
import path from 'node:path';

export async function checkThreeLayout({ page, name, out, ok, eq, load }) {
  // This is the isolated test browser's workspace; keep its saved-sign library.
  await page.evaluate(() => localStorage.removeItem('signs-app:v1:workspace'));
  await load();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-layout="3"]').click();
  eq(await page.locator('#layouts [aria-pressed=true]').textContent(), '3 בדף');
  const titles = ['קוקה קולה / זירו 1.5 ליטר', 'לחמניות עשרייה ברמן', 'בולגרית פיראוס', 'כוסות לשתייה קרה', 'חלב תנובה', 'יוגורט דנונה', 'שוקו יטבתה'];
  for (let i = 0; i < titles.length; i++) {
    if (i) await page.locator('#new-sign').click();
    const card = page.locator('#cards>.card').nth(i);
    await card.locator('[data-field=title]').fill(titles[i]);
    await card.locator('[data-field=price]').fill('9.90');
    await card.locator('[data-field=oldPrice]').fill('12.9');
    await card.locator('[data-field=end]').fill('2026-10-31');
    // Selecting a layout flushes pending edits before counting preview pages.
    await page.locator('[data-layout="3"]').click();
    eq(await page.locator('#signPages canvas').count(), Math.ceil((i + 1) / 3));
  }
  eq(await page.locator('.page-label').allTextContents(), ['עמוד 1 מתוך 3', 'עמוד 2 מתוך 3', 'עמוד 3 מתוך 3']);
  const workspaceBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('signs-app:v1:workspace')));
  await load();
  eq(await page.locator('#layouts [aria-pressed=true]').textContent(), '3 בדף');
  eq(await page.locator('#cards>.card [data-field=title]').evaluateAll(fields => fields.map(field => field.value)), titles);
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('signs-app:v1:workspace'))), workspaceBefore);
  eq(await page.locator('#signPages canvas').count(), 3);
  eq(await page.locator('#signPages canvas').evaluateAll(canvases => canvases.map(canvas => [canvas.width, canvas.height])), Array(3).fill([1240, 1754]));

  // Compare equal stacked slots, including the otherwise easy-to-clip last sign.
  const slots = await page.evaluate(async () => {
    const { renderPage } = await import('./familiar-render.js');
    const { buildSign } = await import('./model.js');
    const signs = JSON.parse(localStorage.getItem('signs-app:v1:workspace')).entries.slice(0, 3).map(entry => buildSign(entry.draft));
    const original = CanvasRenderingContext2D.prototype.strokeRect;
    const rows = [];
    CanvasRenderingContext2D.prototype.strokeRect = function(x, y, w, h) {
      if (this.strokeStyle === '#000000' && this.lineWidth === 5) rows.push({ x, y, w, h });
      return original.call(this, x, y, w, h);
    };
    try {
      renderPage({ kind: 'signs', layout: '3', landscape: false, signs });
      const three = rows.splice(0);
      renderPage({ kind: 'signs', layout: '4', landscape: false, signs });
      return { three, four: rows };
    } finally { CanvasRenderingContext2D.prototype.strokeRect = original; }
  });
  eq(slots.three.length, 3);
  ok(slots.three.every(slot => slot.h === slots.three[0].h && slot.w === slots.three[0].w), 'three signs have equal full-width slots');
  ok(slots.three[0].h > slots.four[0].h, 'three-per-page signs are larger than four-per-page signs');
  for (let i = 0; i < 3; i++) {
    const slot = slots.three[i];
    ok(slot.x >= 40 && slot.x + slot.w <= 1200 && slot.y >= 40 && slot.y + slot.h <= 1714, 'all three signs stay within the portrait A4 safe area');
    if (i) ok(slot.y > slots.three[i - 1].y + slots.three[i - 1].h, 'stacked signs retain a cutting gap');
  }

  await page.evaluate(() => { window.__shared = []; });
  await page.locator('#share-images').click();
  await page.waitForFunction(() => window.__shared.length === 3);
  eq(await page.evaluate(() => window.__shared.map(file => [file.name, file.type])), [['sign-1.png', 'image/png'], ['sign-2.png', 'image/png'], ['sign-3.png', 'image/png']]);
  await page.locator('#preview-print').click();
  eq(await page.locator('.print-sheet').count(), 3);
  eq(await page.locator('#page-count').textContent(), '3 דפי A4');
  eq(await page.locator('.print-sheet.landscape').count(), 0);
  const exportChecks = await page.evaluate(async () => {
    const previews = [...document.querySelectorAll('#signPages canvas')];
    const printed = [...document.querySelectorAll('.print-sheet canvas')];
    const samePixels = (a, b) => {
      if (a.width !== b.width || a.height !== b.height) return false;
      const one = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
      const two = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
      return one.every((value, i) => value === two[i]);
    };
    return Promise.all(previews.map(async (preview, i) => {
      const image = new Image(); image.src = window.__shared[i].url; await image.decode();
      const shared = document.createElement('canvas'); shared.width = image.width; shared.height = image.height;
      shared.getContext('2d').drawImage(image, 0, 0);
      return { shared: samePixels(preview, shared), printed: samePixels(preview, printed[i]), jpeg: preview.toDataURL('image/jpeg', .96), png: preview.toDataURL('image/png') };
    }));
  });
  for (const [i, result] of exportChecks.entries()) {
    ok(result.shared, `three-per-page PNG ${i + 1} matches the preview exactly`);
    ok(result.printed, `three-per-page print ${i + 1} matches the preview exactly`);
    if (name === 'chromium') fs.writeFileSync(path.join(out, `indoor-three-page-${i + 1}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
  }
  const download = page.waitForEvent('download');
  await page.locator('#download-pdf').click();
  const pdfPath = path.join(out, `${name}-three-per-page.pdf`);
  await (await download).saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath), structure = pdf.toString('latin1');
  ok(structure.includes('/Type /Pages /Count 3 '), 'seven signs export to exactly three PDF pages');
  eq((structure.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g) || []).length, 3);
  eq((structure.match(/\/Width 1240 \/Height 1754/g) || []).length, 3);
  for (const result of exportChecks) ok(pdf.includes(Buffer.from(result.jpeg.split(',')[1], 'base64')), 'PDF embeds the exact preview raster');
  await page.emulateMedia({ media: 'print' });
  for (const sheet of await page.locator('.print-sheet').all()) {
    const bounds = await sheet.boundingBox();
    ok(bounds.height > bounds.width, 'native print retains portrait A4 pages');
  }
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
  await page.locator('#native-print').click();
  ok(await page.evaluate(() => window.__printed), 'three-per-page native print action works');
  await page.locator('#close-print').click();
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    eq(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const buttons = await page.locator('#layouts button').evaluateAll(elements => elements.map(element => ({ client: element.clientWidth, content: element.scrollWidth })));
    ok(buttons.every(button => button.content <= button.client + 1), 'all five layout labels fit their buttons');
  }
}

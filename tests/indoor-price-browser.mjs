import fs from 'node:fs';
import path from 'node:path';
export async function checkIndoorPrices({ page, name, out, ok, eq }) {
  const result = await page.evaluate(async () => {
    const { renderPage } = await import('./familiar-render.js');
    const { newDraft, buildSign } = await import('./model.js');
    const labels = [], images = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
      if (text.startsWith('במקום ') || text.startsWith('בתוקף עד ')) {
        const m = this.measureText(text);
        labels.push({ text, color: this.fillStyle, font: this.font, left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight, canvasWidth: this.canvas.width });
      }
      return original.call(this, text, x, y, ...args);
    };
    try {
      for (const layout of ['4', '2small', '2', '1']) {
        const signs = [buildSign({ ...newDraft(), title: 'בולגרית פיראוס 5% 16% 24%', kind: 'bundle', quantity: '2', price: '19.90', oldPrice: '10.9', end: '2026-10-31' })];
        const canvas = renderPage({ kind: 'signs', layout, landscape: layout === '1', signs });
        images.push({ layout, url: canvas.toDataURL() });
      }
      const sign = buildSign({ ...newDraft(), title: 'מחיר ליחידה', price: '19.90', oldPrice: '21.9', end: '2026-10-31' });
      renderPage({ kind: 'signs', layout: '4', landscape: false, signs: [sign] });
      return { labels, images };
    } finally { CanvasRenderingContext2D.prototype.fillText = original; }
  });
  if (name === 'chromium') for (const image of result.images) fs.writeFileSync(path.join(out, `unit-price-${image.layout}.png`), Buffer.from(image.url.split(',')[1], 'base64'));
  eq(result.labels.filter(l => l.text.startsWith('במקום ')).map(l => l.text), [
    ...Array(4).fill('במקום 10.90 ₪ ליחידה'), 'במקום 21.90 ₪ ליחידה'
  ]);
  for (const label of result.labels) {
    eq(label.color, '#000000'); ok(label.font.startsWith('900 '), 'old price and expiry are bold');
    ok(label.left >= 40 && label.right <= label.canvasWidth - 40, 'label stays inside the sign: '+JSON.stringify(label));
  }

}

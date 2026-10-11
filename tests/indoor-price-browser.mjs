import fs from 'node:fs';
import path from 'node:path';

export async function checkIndoorPrices({ page, name, out, ok, eq }) {
  const result = await page.evaluate(async () => {
    const { renderPage } = await import('./familiar-render.js');
    const { newDraft, buildSign } = await import('./model.js');
    const proto = CanvasRenderingContext2D.prototype;
    const originals = Object.fromEntries(['fillText', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'strokeRect'].map(k => [k, proto[k]]));
    let current = null, pen = null, segments = [];
    const point = (ctx, x, y) => {
      const t = ctx.getTransform();
      return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
    };
    proto.fillText = function(text, x, y, ...args) {
      if (current) {
        const m = this.measureText(text);
        const a = point(this, x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent);
        const b = point(this, x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent);
        current.labels.push({ text, color: this.fillStyle, font: this.font, left: a.x, right: b.x, top: a.y, bottom: b.y });
      }
      return originals.fillText.call(this, text, x, y, ...args);
    };
    proto.beginPath = function(...args) { pen = null; segments = []; return originals.beginPath.apply(this, args); };
    proto.moveTo = function(x, y) { pen = point(this, x, y); return originals.moveTo.call(this, x, y); };
    proto.lineTo = function(x, y) {
      const next = point(this, x, y);
      if (pen) segments.push({ from: pen, to: next });
      pen = next;
      return originals.lineTo.call(this, x, y);
    };
    proto.stroke = function(...args) {
      if (current) current.strokes.push(...segments.map(segment => ({ ...segment, color: this.strokeStyle })));
      return originals.stroke.apply(this, args);
    };
    proto.strokeRect = function(x, y, w, h) {
      if (current && this.strokeStyle === '#e11d48') {
        const a = point(this, x, y), b = point(this, x + w, y + h);
        current.bounds = { left: a.x, right: b.x, top: a.y, bottom: b.y };
      }
      return originals.strokeRect.call(this, x, y, w, h);
    };
    const cases = [], images = [];
    const render = (draft, layout, id, screenshot = false) => {
      current = { id, layout, labels: [], strokes: [] };
      const canvas = renderPage({ kind: 'signs', layout, landscape: layout === '1', signs: [buildSign({ ...newDraft(), ...draft })] });
      const captured = current;
      current = null;
      if (screenshot) images.push({ id, layout, url: canvas.toDataURL() });
      return captured;
    };
    try {
      const examples = [
        { id: 'cold-cups', title: 'כוסות לשתייה קרה שקד', quantity: '3', oldPrice: '4' },
        { id: 'hot-cups', title: 'כוסות לשתייה חמה שקד', quantity: '2', oldPrice: '5.9' }
      ];
      for (const layout of ['4', '2small', '2', '1']) {
        for (const example of examples) {
          const draft = { ...example, kind: 'bundle', price: '10' };
          cases.push({
            ...render(draft, layout, example.id, true), expectedOld: `${example.oldPrice} ליח׳`,
            baseline: render({ ...draft, oldPrice: '' }, layout, `${example.id}-baseline`)
          });
        }
        const dense = {
          title: 'בולגרית פיראוס 5% 16% 24%', kind: 'bundle', quantity: '2', price: '10', oldPrice: '10.9',
          note: 'ניתן לערבב בין המוצרים', start: '2026-10-01', end: '2026-10-31',
          barcodes: Array.from({ length: 12 }, (_, i) => String(7290110115200 + i))
        };
        cases.push({ ...render(dense, layout, 'dense', true), expectedOld: '10.9 ליח׳', dense: true });
      }
      for (const [price, oldPrice] of [['19.90', '21.9'], ['5', '5.95']]) {
        cases.push({ ...render({ title: 'מחיר ליחידה', price, oldPrice, end: '2026-10-31' }, '4', `unit-${oldPrice}`), expectedOld: `${oldPrice} ליח׳` });
      }
      return { cases, images };
    } finally {
      for (const [key, fn] of Object.entries(originals)) proto[key] = fn;
    }
  });

  if (name === 'chromium') for (const image of result.images) {
    fs.writeFileSync(path.join(out, `indoor-price-${image.id}-${image.layout}.png`), Buffer.from(image.url.split(',')[1], 'base64'));
  }
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const priceLabels = row => row.labels.filter(label => ['10', '2', '3', ' יח׳ ב- ', ' ₪'].includes(label.text));
  for (const row of result.cases) {
    const context = `${name} ${row.layout} ${row.id}`;
    const old = row.labels.filter(label => label.text.endsWith('ליח׳'));
    eq(old.map(label => label.text), [row.expectedOld]);
    ok(!row.labels.some(label => label.text.includes('במקום') || label.text.includes('ליחידה') && label.text !== 'מחיר ליחידה'), `${context}: compact comparison only`);
    const label = old[0];
    eq(label.color, '#000000');
    ok(label.font.startsWith('900 '), `${context}: old unit price stays bold`);
    for (const text of row.labels.filter(item => item === label || item.text.startsWith('בתוקף עד ') || item.text.startsWith('* '))) {
      ok(text.left >= row.bounds.left && text.right <= row.bounds.right && text.top >= row.bounds.top && text.bottom <= row.bounds.bottom, `${context}: label stays inside the sign: ${JSON.stringify(text)}`);
    }
    ok(row.strokes.some(stroke => stroke.color === '#000000'
      && Math.abs(stroke.from.y - stroke.to.y) < 0.1
      && stroke.from.y > label.top && stroke.from.y < label.bottom
      && Math.min(stroke.from.x, stroke.to.x) <= label.left + 2
      && Math.max(stroke.from.x, stroke.to.x) >= label.right - 2), `${context}: old unit price has a visible strike-through`);
    for (const other of row.labels.filter(item => item !== label)) {
      ok(!overlap(label, other), `${context}: old price must not overlap ${JSON.stringify(other.text)}`);
    }
    if (row.baseline) {
      eq({ context, offer: priceLabels(row).map(({ text, font }) => ({ text, font })) }, { context, offer: priceLabels(row.baseline).map(({ text, font }) => ({ text, font })) });
      ok(priceLabels(row).length >= 4, `${context}: main offer was checked`);
    }
    for (const date of row.labels.filter(item => item.text.startsWith('בתוקף עד '))) {
      eq(date.color, '#000000');
      ok(date.font.startsWith('900 '), `${context}: expiry stays bold`);
    }
    if (row.dense) {
      const note = row.labels.find(item => item.text.startsWith('* '));
      const barcodeHeader = row.labels.find(item => item.text === 'המבצע חל על הברקודים:');
      ok(!!note && !!barcodeHeader, `${context}: note and barcode list are rendered`);
      ok(label.bottom <= note.top + 1, `${context}: comparison precedes note`);
      ok(note.bottom <= barcodeHeader.top + 1, `${context}: note clears the barcode list`);
      for (const offer of priceLabels(row)) {
        ok(!overlap(offer, note) && !overlap(offer, barcodeHeader), `${context}: offer clears the note and barcode list`);
      }
    }
  }
}

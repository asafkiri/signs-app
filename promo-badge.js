// Paint the original sign first. Only the new badge may adapt to the space left.
const box = (x, y, w, h, pad = 0) => ({ x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 });
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

export function findPromoBadge(slot, occupied, storeBox) {
  const safe = box(slot.x + 20, slot.y + 20, slot.w - 40, slot.h - 40);
  // Prefer a side sticker. Keep the visual space between quantity and price clear.
  const max = Math.min(210, Math.floor(slot.h * .32));
  const sideWidth = safe.w * .32;
  for (const area of [box(safe.x, safe.y, sideWidth, safe.h), box(safe.x + safe.w - sideWidth, safe.y, sideWidth, safe.h)]) {
    for (let size = max; size >= 88; size -= 8) {
      const step = 12;
      for (let x = area.x; x + size <= area.x + area.w; x += step) {
        for (let y = safe.y; y + size <= safe.y + safe.h; y += step) {
          const candidate = box(x, y, size, size);
          if (!occupied.some(r => overlaps(box(candidate.x, candidate.y, size, size, 7), r))) return { mode: 'circle', ...candidate };
        }
      }
    }
  }
  // A crowded sign may reuse its existing store-name tag. No offer/date moves.
  if (storeBox && contains(box(slot.x + 11, slot.y + 11, slot.w - 22, slot.h - 22), storeBox)
      && !occupied.some(r => !r.store && overlaps(box(storeBox.x, storeBox.y, storeBox.w, storeBox.h, 3), r))) {
    return { mode: 'header', ...storeBox };
  }
  return { mode: 'omitted' };
}

export function drawWithPromoBadge(ctx, drawOriginal, slot) {
  const occupied = [];
  let storeBox = null, path = [], pen = null;
  const captureText = (text, x, y, stroke) => {
    const m = ctx.measureText(text), padding = stroke ? ctx.lineWidth / 2 + 2 : 2;
    const r = box(x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent,
      m.actualBoundingBoxLeft + m.actualBoundingBoxRight, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, padding);
    r.store = !!storeBox && String(text).startsWith('🛒 ') && contains(storeBox, r);
    occupied.push(r);
  };
  // A per-draw proxy avoids mutating the shared Canvas prototype or context.
  const paint = new Proxy(ctx, {
    get(target, key) {
      if (key === 'fillText' || key === 'strokeText') return (text, x, y, ...rest) => {
        captureText(text, x, y, key === 'strokeText'); return target[key](text, x, y, ...rest);
      };
      if (key === 'roundRect' || key === 'rect') return (x, y, w, h, ...rest) => {
        if (target.fillStyle === '#fff1f2') {
          storeBox = box(x - 1, y - 1, w + 2, h + 2);
          occupied.push({ ...storeBox, store: true });
        }
        return target[key](x, y, w, h, ...rest);
      };
      if (key === 'beginPath') return () => { path = []; pen = null; return target.beginPath(); };
      if (key === 'moveTo') return (x, y) => { pen = { x, y }; return target.moveTo(x, y); };
      if (key === 'lineTo') return (x, y) => {
        if (pen) path.push(box(Math.min(x, pen.x), Math.min(y, pen.y), Math.abs(x - pen.x), Math.abs(y - pen.y)));
        pen = { x, y }; return target.lineTo(x, y);
      };
      if (key === 'stroke') return (...args) => {
        occupied.push(...path.map(r => box(r.x, r.y, r.w, r.h, target.lineWidth / 2 + 2)));
        return target.stroke(...args);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); }
  });
  drawOriginal(paint);
  const badge = findPromoBadge(slot, occupied, storeBox);
  if (badge.mode === 'omitted') return badge;
  ctx.save();
  ctx.fillStyle = '#000000'; ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2; ctx.setLineDash([]);
  if (badge.mode === 'circle') {
    const r = badge.w / 2;
    ctx.translate(badge.x + r, badge.y + r);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r - 5, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(-Math.PI / 12);
    ctx.font = `900 ${Math.floor(badge.w * .29)}px Heebo, Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff'; ctx.fillText('מבצע', 0, 0);
  } else {
    // Reuse exactly the old tag footprint, including its stroke, without
    // changing the original layout calculations or any other text pixels.
    ctx.fillRect(badge.x, badge.y, badge.w, badge.h);
    let size = Math.floor(badge.h * .70);
    ctx.font = `900 ${size}px Heebo, Arial`;
    while (ctx.measureText('מבצע').width > badge.w - 12 && size > 12) ctx.font = `900 ${--size}px Heebo, Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff'; ctx.fillText('מבצע', badge.x + badge.w / 2, badge.y + badge.h / 2);
  }
  ctx.restore();
  return badge;
}

// Port of Yotvata sign renderer; source blob 5323d9996e4d2ffb236326cec639e1f9ecb25764.
// See README for adapters; the original drawing geometry and price segments are preserved.
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const signProductsFor = s => (s.barcodes || []).map(barcode => ({ barcode }));
export function indoorSign(s) {
  const f = d => d ? d.split('-').reverse().join('.') : '';
  return { ...s, qty: s.quantity, title: [s.title, s.subtitle].filter(Boolean).join(' '),
    validUntil: f(s.end), oldPrice: s.oldPrice ? s.oldPrice * (s.kind === 'bundle' ? s.quantity : 1) : '',
    note: [s.note, s.start ? 'בתוקף מ־' + f(s.start) : ''].filter(Boolean).join(' · ') };
}
function signPriceTxt(v) {
  v = r2(Number(v) || 0);
  const sh = Math.floor(v);
  const ag = Math.round((v - sh) * 100);
  return ag > 0 ? ('₪' + sh + '-' + (ag < 10 ? '0' + ag : ag)) : ('₪' + sh);
}
function signPriceSegs(s) {
  if (s.kind === 'pct' || s.kind === 'free') return null;
  const v = r2(Number(s.price) || 0); if (!(v > 0)) return null;
  const sh = Math.floor(v), ag = Math.round((v - sh) * 100);
  const segs = [];
  if (s.kind === 'bundle') {
    const q = parseInt(s.qty, 10); if (!(q > 0)) return null;
    segs.push({ t: String(q), k: 'big' });
    segs.push({ t: ' יח׳ ב- ', k: 'small' });
  } else {
    segs.push({ t: 'רק ב- ', k: 'small' });
  }
  if (ag > 0) segs.push({ t: (ag < 10 ? '0' + ag : String(ag)), k: 'sup' });
  segs.push({ t: String(sh), k: 'big' });
  segs.push({ t: ' ₪', k: 'small' });
  return segs;
}
function priceSegFonts(bigSize) {
  return {
    big: '900 ' + bigSize + 'px Heebo, Arial',
    small: '800 ' + Math.max(14, Math.round(bigSize * 0.3)) + 'px Heebo, Arial',
    sup: '900 ' + Math.max(16, Math.round(bigSize * 0.42)) + 'px Heebo, Arial'
  };
}
function measurePriceSegs(ctx, segs, bigSize) {
  const F = priceSegFonts(bigSize);
  const gap = Math.max(2, Math.round(bigSize * 0.04));
  let total = 0;
  segs.forEach(sg => { ctx.font = F[sg.k]; total += ctx.measureText(sg.t).width + gap; });
  return total - gap;
}
function drawPriceSegs(ctx, segs, centerX, baseY, bigSize) {
  const F = priceSegFonts(bigSize);
  const gap = Math.max(2, Math.round(bigSize * 0.04));
  const ws = segs.map(sg => { ctx.font = F[sg.k]; return ctx.measureText(sg.t).width; });
  const total = ws.reduce((a, b) => a + b, 0) + gap * (segs.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'right';
  let x = centerX + total / 2;
  segs.forEach((sg, i) => {
    ctx.font = F[sg.k];
    const yy = (sg.k === 'sup') ? baseY - Math.round(bigSize * 0.42) : baseY;
    ctx.fillText(sg.t, x, yy);
    if (sg.k === 'sup') {
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(2, Math.round(bigSize * 0.03));
      ctx.beginPath(); ctx.moveTo(x - ws[i], yy + Math.round(bigSize * 0.07)); ctx.lineTo(x, yy + Math.round(bigSize * 0.07)); ctx.stroke();
    }
    x -= ws[i] + gap;
  });
  ctx.textAlign = prevAlign;
}
function signLineText(s) {
  if (s.kind === 'free') return s.free || '';
  if (s.kind === 'unit') return (s.price !== '' && Number(s.price) > 0) ? ('רק ב-' + signPriceTxt(s.price)) : '';
  if (s.kind === 'bundle') return (Number(s.qty) > 0 && Number(s.price) > 0) ? (parseInt(s.qty, 10) + ' יח׳ ב-' + signPriceTxt(s.price)) : '';
  if (s.kind === 'pct') return (Number(s.pct) > 0) ? (r2(Number(s.pct)) + '% הנחה') : '';
  return '';
}
function signWrapText(ctx, text, maxW) {
  const rawWords = (text || '').split(/\s+/).filter(Boolean);
  const words = [];
  rawWords.forEach(w => {
    if (ctx.measureText(w).width <= maxW) { words.push(w); return; }
    let chunk = '';
    for (const ch of w) {
      const t = chunk + ch;
      if (ctx.measureText(t).width <= maxW || !chunk) chunk = t;
      else { words.push(chunk); chunk = ch; }
    }
    if (chunk) words.push(chunk);
  });
  const lines = []; let cur = '';
  words.forEach(w => {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  return lines;
}
const SIGN_TITLE_SHRINK_FLOOR = 0.55;
function signTitleFontFor(ctx, text, maxW, k, maxF, minF) {
  ctx.font = '900 ' + maxF + 'px Heebo, Arial';
  const sum = ctx.measureText((text || '').split(/\s+/).filter(Boolean).join(' ')).width - (k - 1) * ctx.measureText(' ').width;
  for (let sz = Math.min(maxF, Math.floor(maxF * maxW * k / Math.max(1, sum)) + 1); sz >= minF; sz--) {
    ctx.font = '900 ' + sz + 'px Heebo, Arial';
    const tl = signWrapText(ctx, text, maxW);
    if (tl.length <= k && tl.every(ln => ctx.measureText(ln).width <= maxW)) return sz;
  }
  return 0;
}
export function drawSignSlot(ctx, s, y0, slotH, W) {
    const storeName = s.store || '';
    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'alphabetic';
  const pad = 40;
    const x0 = pad, x1 = W - pad, cx = W / 2;
    ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 5;
    ctx.strokeRect(x0, y0, x1 - x0, slotH);
    ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 10, y0 + 10, x1 - x0 - 20, slotH - 20);
    const prods = signProductsFor(s);
    const buildLines = (font) => {
      ctx.font = font;
      const out = [], counts = [];
      let line = '', cnt = 0;
      prods.forEach(p => {
        const item = p.barcode || p.name;
        const cand = line ? line + '  ·  ' + item : item;
        if (line && ctx.measureText(cand).width > widthAvail) { out.push(line); counts.push(cnt); line = item; cnt = 1; }
        else { line = cand; cnt++; }
      });
      if (line) { out.push(line); counts.push(cnt); }
      return { out, counts };
    };
    const big = signLineText(s);
    const oldP = (s.kind !== 'pct' && s.oldPrice !== '' && Number(s.oldPrice) > 0) ? r2(Number(s.oldPrice)) : null;
    const hasValid = !!(s.validUntil && s.validUntil.trim());
    const widthAvail = x1 - x0 - 80;
    const innerH = slotH - 22;
    const slotScale = Math.max(1, slotH / 316);
    let badgeFont = Math.round(34 * Math.min(slotScale, 2.2));
    ctx.font = '800 ' + badgeFont + 'px Heebo, Arial';
    let badgeTextW = ctx.measureText('🛒 ' + storeName).width;
    while (badgeTextW > (x1 - x0) * 0.45 && badgeFont > 18) { badgeFont -= 2; ctx.font = '800 ' + badgeFont + 'px Heebo, Arial'; badgeTextW = ctx.measureText('🛒 ' + storeName).width; }
    const badgeH = Math.round(badgeFont * 1.5), badgeW = Math.round(badgeTextW) + 30;
    const badgeX1 = x1 - 14, badgeX0v = badgeX1 - badgeW, badgeTopY = y0 + 14, badgeBottomRel = 14 + badgeH;
    const validFont = Math.round(20 * Math.min(slotScale, 2));
    ctx.font = '900 ' + validFont + 'px Heebo, Arial';
    const validW = hasValid ? ctx.measureText('בתוקף עד ' + s.validUntil.trim()).width : 0;
    const B = { title: 58, titleLH: 62, big: 96, bigPad: 26, bigAfter: 44, old: 30, note: 30, listHead: 24, list: 24, listSmall: 22, listLH: 30, topPad: 78 };
    let M = null, titleLines = null, fitsAll = false, linesOut = [], lineCounts = [], brandShift = 0, titleCx = cx;
    let F0 = 0;
    for (let f = r2(slotScale), fewer = false; f >= 0.4; ) {
      const m = {}; Object.keys(B).forEach(k => m[k] = Math.max(10, Math.round(B[k] * f)));
      const listF = Math.min(f, 1.6);
      ['listHead', 'list', 'listSmall', 'listLH'].forEach(k => m[k] = Math.max(10, Math.round(B[k] * listF)));
      let tl;
      for (;;) {
        ctx.font = '900 ' + m.title + 'px Heebo, Arial';
        tl = signWrapText(ctx, s.title || '', widthAvail);
        const widest = tl.reduce((a, ln) => Math.max(a, ctx.measureText(ln).width), 0);
        if ((tl.length <= 3 && widest <= widthAvail) || m.title <= 26) break;
        m.title = Math.max(26, Math.round(m.title * 0.88));
        m.titleLH = Math.round(m.title * 1.07);
      }
      if (!F0) F0 = m.title;
      const many = tl.length > 1 && tl.length <= 3;
      if (fewer && many) {
        for (let k = 1; k < tl.length; k++) {
          const fk = signTitleFontFor(ctx, s.title || '', widthAvail, k, m.title, Math.max(26, Math.ceil(F0 * SIGN_TITLE_SHRINK_FLOOR)));
          if (fk) { m.title = fk; m.titleLH = Math.round(fk * 1.07); break; }
        }
        ctx.font = '900 ' + m.title + 'px Heebo, Arial';
        tl = signWrapText(ctx, s.title || '', widthAvail);
      }
      if (tl.length > 3) { tl = tl.slice(0, 3); tl[2] = tl[2].replace(/\s+\S*$/, '') + '…'; }
      const t0w = tl.length ? ctx.measureText(tl[0]).width : 0;
      const titleTopRel = m.topPad - Math.round(m.title * 0.75);
      let shift = 0, tCx = cx;
      if (titleTopRel < badgeBottomRel + 6) {
        const rightBound = badgeX0v - 16;
        const leftBound = x0 + (hasValid ? 24 + validW + 14 : 40);
        const hit = (cx + t0w / 2 > rightBound) || (hasValid && cx - t0w / 2 < leftBound);
        if (hit) {
          if (tl.length === 1 && t0w <= rightBound - leftBound) tCx = Math.round(leftBound + (rightBound - leftBound) / 2);
          else shift = badgeBottomRel + 6 - titleTopRel;
        }
      }
      const bl = buildLines('900 ' + m.listSmall + 'px Heebo, Arial');
      const top = shift + m.topPad + tl.length * m.titleLH + (big ? m.bigPad + m.bigAfter : 0) + (s.note ? 20 : 0);
      const listH = prods.length ? 12 + (m.listHead - 6 + m.listLH) + bl.out.length * m.listLH + 14 : 0;
      M = m; titleLines = tl; linesOut = bl.out; lineCounts = bl.counts; brandShift = shift; titleCx = tCx;
      const fits = top + listH <= innerH;
      if (!fewer && many && (fits || r2(f * 0.92) < 0.4)) { fewer = true; continue; }
      if (fits) { fitsAll = true; break; }
      f = r2(f * 0.92);
    }
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(badgeX0v, badgeTopY, badgeW, badgeH, 12); else ctx.rect(badgeX0v, badgeTopY, badgeW, badgeH);
    ctx.fill();
    ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#000000'; ctx.font = '800 ' + badgeFont + 'px Heebo, Arial';
    ctx.textAlign = 'right';
    ctx.fillText('🛒 ' + storeName, badgeX1 - 15, badgeTopY + Math.round(badgeH / 2) + Math.round(badgeFont * 0.35));
    ctx.textAlign = 'center';
    if (hasValid) {
      ctx.fillStyle = '#475569'; ctx.font = '900 ' + validFont + 'px Heebo, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('בתוקף עד ' + s.validUntil.trim(), x0 + 24, y0 + 24 + validFont * 0.4);
      ctx.textAlign = 'center';
    }
    let y = y0 + brandShift + M.topPad;
    ctx.fillStyle = '#0f172a'; ctx.font = '900 ' + M.title + 'px Heebo, Arial';
    titleLines.forEach(ln => { ctx.fillText(ln, titleCx, y); y += M.titleLH; });
    const headH = (M.listHead - 6) + M.listLH;
    const yAfterMiddlePred = y + (big ? M.bigPad + M.bigAfter : 0) + (s.note ? 20 : 0);
    let shown = [], hasMore = false, moreCount = 0, lyAnchor = null;
    if (prods.length) {
      let shownL;
      if (fitsAll) { shownL = linesOut.length; hasMore = false; }
      else {
        const avail = (y0 + innerH) - (yAfterMiddlePred + 12) - headH - 14;
        const cap = Math.max(1, Math.floor(avail / M.listLH));
        if (cap >= linesOut.length) { shownL = linesOut.length; hasMore = false; }
        else { shownL = Math.max(1, cap - 1); hasMore = true; }
      }
      shown = linesOut.slice(0, shownL);
      const shownItems = lineCounts.slice(0, shownL).reduce((a, b) => a + b, 0);
      moreCount = Math.max(0, prods.length - shownItems);
      const linesTotal = shown.length + (hasMore ? 1 : 0);
      lyAnchor = Math.max(yAfterMiddlePred + 12, (y0 + slotH - 26) - headH - Math.max(0, linesTotal - 1) * M.listLH);
    }
    const bandTop = y - Math.round(M.titleLH * 0.3);
    const bandBottom = (lyAnchor != null ? lyAnchor - 16 : y0 + innerH - 6);
    if (big) {
      const segs = signPriceSegs(s);
      const noteH = (s.note ? M.note + 12 : 0);
      const bandH = Math.max(M.bigPad + M.bigAfter, bandBottom - bandTop);
      const oldTxt = (oldP != null ? 'במקום ' + signPriceTxt(oldP) : '');
      ctx.font = '800 ' + M.old + 'px Heebo, Arial';
      const ow = oldTxt ? ctx.measureText(oldTxt).width : 0;
      const oldSpan = oldTxt ? ow + 24 : 0;
      const measureBig = (sz) => { if (segs) return measurePriceSegs(ctx, segs, sz); ctx.font = '900 ' + sz + 'px Heebo, Arial'; return ctx.measureText(big).width; };
      let bigSize = Math.max(M.big, Math.min(Math.round(190 * slotScale), Math.floor((bandH - noteH) / 0.85)));
      while (measureBig(bigSize) + oldSpan > widthAvail && bigSize > Math.round(M.big * 0.7)) { bigSize -= 4; }
      const bw = measureBig(bigSize);
      const groupH = Math.round(bigSize * 0.78) + noteH;
      const topOffset = Math.max(0, Math.min(Math.floor((bandH - groupH) / 2), 10));
      let by = bandTop + topOffset + Math.round(bigSize * 0.72);
      const bigCx = cx + (oldTxt ? Math.round(oldSpan / 2) : 0);
      ctx.fillStyle = '#000000';
      if (segs) drawPriceSegs(ctx, segs, bigCx, by, bigSize);
      else { ctx.font = '900 ' + bigSize + 'px Heebo, Arial'; ctx.fillText(big, bigCx, by); }
      if (oldTxt) {
        const oldCx = bigCx - Math.round(bw / 2) - 24 - Math.round(ow / 2);
        ctx.fillStyle = '#94a3b8'; ctx.font = '800 ' + M.old + 'px Heebo, Arial';
        ctx.fillText(oldTxt, oldCx, by - 4);
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = Math.max(2, Math.round(M.old / 10));
        ctx.beginPath(); ctx.moveTo(oldCx - ow / 2 - 4, by - 4 - M.old * 0.32); ctx.lineTo(oldCx + ow / 2 + 4, by - 4 - M.old * 0.32); ctx.stroke();
      }
      if (s.note) {
        by += M.note + 16; ctx.fillStyle = '#475569';
        let noteF = M.note; ctx.font = '900 ' + noteF + 'px Heebo, Arial';
        while (ctx.measureText('* ' + s.note).width > widthAvail && noteF > 14) { noteF--; ctx.font = '900 ' + noteF + 'px Heebo, Arial'; }
        ctx.fillText('* ' + s.note, cx, by);
      }
    } else if (s.note) {
      ctx.fillStyle = '#475569'; ctx.font = '900 ' + M.note + 'px Heebo, Arial';
      let noteF2 = M.note;
      ctx.font = '900 ' + noteF2 + 'px Heebo, Arial';
      while (ctx.measureText('* ' + s.note).width > widthAvail && noteF2 > 14) { noteF2--; ctx.font = '900 ' + noteF2 + 'px Heebo, Arial'; }
      ctx.fillText('* ' + s.note, cx, bandTop + Math.floor((bandBottom - bandTop) / 2));
    }
    if (prods.length) {
      let ly = lyAnchor;
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0 + 70, ly - 8); ctx.lineTo(x1 - 70, ly - 8); ctx.stroke();
      ctx.fillStyle = '#000000'; ctx.font = '900 ' + M.listHead + 'px Heebo, Arial';
      ctx.fillText('המבצע חל על הברקודים:', cx, ly + M.listHead - 6); ly += headH;
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      shown.forEach(ln => {
        ctx.font = '900 ' + M.listSmall + 'px Heebo, Arial';
        if (ctx.measureText(ln).width > x1 - x0 - 50) ctx.font = '900 ' + Math.max(11, M.listSmall - 3) + 'px Heebo, Arial';
        ctx.lineWidth = Math.max(0.6, M.listSmall * 0.05);
        ctx.fillText(ln, cx, ly); ctx.strokeText(ln, cx, ly); ly += M.listLH;
      });
      if (hasMore && moreCount > 0) { ctx.font = '900 ' + M.listSmall + 'px Heebo, Arial'; ctx.lineWidth = Math.max(0.6, M.listSmall * 0.05); ctx.fillText('ועוד ' + moreCount + ' מוצרים…', cx, ly); ctx.strokeText('ועוד ' + moreCount + ' מוצרים…', cx, ly); }
    }
}

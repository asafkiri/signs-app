// "שלטי מחיר" tab. Self-contained: own state, storage key, preview and print dialog.
import { TAG_SIZES, PER, MEASURES, MAX_TAGS, newTag, cleanState, checkTag, priceParts, tagPages } from './price-tags-model.js';
import { canvasesToPDF } from './pdf.js';
import { startScanner } from './scanner.js';
const $ = id => document.getElementById(id), KEY = 'signs-app:v1:price-tags';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FONT = '"Outdoor Black", Heebo, Arial, sans-serif', W = 1860, H = 2631, MARGIN = 53;
let state = cleanState(null), pages = [], files = [], filesReady = Promise.resolve(), revision = 0, timer, toastTimer, pdfFile = null;
try { state = cleanState(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch {}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('השמירה במכשיר אינה זמינה'); } }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }

// ---- drawing ----
function fitLines(c, str, maxW, maxH, maxSize, maxLines, weight = 800) {
  const words = str.split(' ');
  for (let size = Math.floor(maxSize); size >= 10; size = Math.floor(size * .94)) {
    c.font = `${weight} ${size}px ${FONT}`;
    const lines = [];
    for (const word of words) {
      const next = lines.length ? `${lines.at(-1)} ${word}` : word;
      if (lines.length && c.measureText(next).width <= maxW) lines[lines.length - 1] = next; else lines.push(word);
    }
    if (lines.length <= maxLines && lines.every(l => c.measureText(l).width <= maxW) && lines.length * size * 1.12 <= maxH) return { size, lines };
  }
  c.font = `${weight} 10px ${FONT}`;
  let line = str; while (line.length > 1 && c.measureText(line + '…').width > maxW) line = line.slice(0, -1);
  return { size: 10, lines: [line === str ? line : line + '…'] };
}
// Black only: tags are printed black-and-white. A frame holds the name (underlined) above
// the price on the left and the pack details on the right, so they read as one tag.
const PX_MM = W / 210;
function drawTag(c, t, x, y, w, h) {
  const ink = '#000', inset = PX_MM, frame = Math.round(PX_MM * .8);
  const fx = x + inset, fy = y + inset, fw = w - inset * 2, fh = h - inset * 2;
  const pad = Math.round(Math.min(fw, fh) * .07), ix = fx + frame + pad, iw = fw - (frame + pad) * 2, iy = fy + frame + pad * .5, ih = fh - frame * 2 - pad;
  const info = [t.size, t.unitPrice].filter(Boolean).join(' · '), details = info || t.barcode;
  c.save(); c.fillStyle = ink; c.strokeStyle = ink;
  c.lineWidth = frame; c.strokeRect(fx + frame / 2, fy + frame / 2, fw - frame, fh - frame);
  // Name, then a thick rule under it across the frame.
  const nameH = ih * .3, rule = Math.max(4, Math.round(PX_MM * .7));
  c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const name = fitLines(c, t.name, iw, nameH, nameH * .62, 2);
  c.font = `800 ${name.size}px ${FONT}`;
  const lineH = name.size * 1.12, top = iy + (nameH - lineH * name.lines.length) / 2;
  name.lines.forEach((l, i) => c.fillText(l, ix + iw / 2, top + lineH * (i + .5)));
  c.fillRect(ix, iy + nameH + ih * .02, iw, rule);
  const bodyY = iy + nameH + ih * .02 + rule + ih * .04, bodyH = iy + ih - bodyY;
  const priceBox = { x: ix, y: bodyY, w: details ? iw * .56 : iw, h: bodyH };
  // Hebrew order, laid out left→right: [₪ with the unit label above it] [shekels][agorot]
  const { shekels, agorot } = priceParts(t.price), parts = [];
  const measure = s => {
    parts.length = 0;
    const f = (weight, size) => `${weight} ${size}px ${FONT}`;
    parts.push({ text: '₪', font: f(800, s * .3), gap: s * .07, kind: 'nis', per: t.per, perFont: f(800, s * .19) });
    parts.push({ text: shekels, font: f(900, s), gap: 0, kind: 'shekels' });
    if (agorot) parts.push({ text: agorot, font: f(900, s * .48), gap: 0, kind: 'agorot', lead: s * .03 });
    c.direction = 'ltr';
    return parts.reduce((sum, p) => {
      c.font = p.font; p.w = c.measureText(p.text).width;
      if (p.per) { c.font = p.perFont; p.perW = c.measureText(p.per).width; p.w = Math.max(p.w, p.perW); }
      return sum + (p.lead || 0) + p.w + p.gap;
    }, 0);
  };
  let s = priceBox.h / .8; const total = measure(s); if (total > priceBox.w) { s *= priceBox.w / total; measure(s); }
  const width = parts.reduce((sum, p) => sum + (p.lead || 0) + p.w + p.gap, 0), cap = s * .72, base = priceBox.y + (priceBox.h + cap) / 2;
  // With details the price hugs the left edge; alone it is centred.
  let cx = details ? priceBox.x : priceBox.x + (priceBox.w - width) / 2; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  for (const p of parts) {
    cx += p.lead || 0; c.font = p.font;
    if (p.kind === 'nis') {
      // ₪ sits on the baseline at the right of its column, next to the number; the unit label sits above it.
      c.textAlign = 'right'; c.fillText(p.text, cx + p.w, base);
      if (p.per) { c.font = p.perFont; c.fillText(p.per, cx + p.w, base - s * .34); }
      c.textAlign = 'left';
    } else c.fillText(p.text, cx, p.kind === 'agorot' ? base - cap + s * .48 * .72 : base);
    if (p.kind === 'agorot') c.fillRect(cx, base - cap + s * .48 * .72 + s * .05, p.w, Math.max(2, s * .035));
    cx += p.w + p.gap;
  }
  if (details) {
    // Pack size / unit price and the barcode number, right-aligned beside the price.
    const dx = ix + iw * .6, dw = iw * .4, lineSize = Math.min(bodyH * .22, PX_MM * 4.5), rows = [];
    // Pack size and unit price each get their own line, never broken mid-phrase.
    if (t.size) rows.push({ text: t.size, weight: 700, dir: 'rtl' });
    if (t.unitPrice) rows.push({ text: t.unitPrice, weight: 700, dir: 'rtl' });
    if (t.barcode) rows.push({ text: t.barcode, weight: 600, dir: 'ltr' });
    const fitted = rows.map(r => { const f = fitLines(c, r.text, dw, lineSize * 1.2, lineSize, 1, r.weight); return { ...r, ...f }; });
    // Size and unit price share one size so the two lines look like a pair.
    const textSize = Math.min(...fitted.filter(r => r.dir === 'rtl').map(r => r.size));
    fitted.forEach(r => { if (r.dir === 'rtl') r.size = textSize; });
    const heights = fitted.map(r => r.lines.length * r.size * 1.2), gap = lineSize * .35;
    let ry = bodyY + (bodyH - heights.reduce((a, b) => a + b, 0) - gap * (rows.length - 1)) / 2;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    fitted.forEach((r, i) => {
      c.direction = r.dir; c.font = `${r.weight} ${r.size}px ${FONT}`;
      r.lines.forEach((l, j) => c.fillText(l, dx + dw, ry + r.size * 1.2 * (j + .5)));
      ry += heights[i] + gap;
    });
  }
  c.restore();
}
export function renderTagPage(tags, size) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  const cw = (W - MARGIN * 2) / size.cols, ch = (H - MARGIN * 2) / size.rows;
  tags.forEach((t, i) => {
    // RTL page: the first tag sits at the top right.
    const col = i % size.cols, row = Math.floor(i / size.cols), x = W - MARGIN - (col + 1) * cw, y = MARGIN + row * ch;
    drawTag(c, t, x, y, cw, ch);
    c.strokeStyle = '#a3a3a3'; c.lineWidth = 2; c.strokeRect(x, y, cw, ch);
  });
  return canvas;
}

// ---- editor ----
const options = (list, active) => list.map(([v, label]) => `<option value="${v}" ${v === active ? 'selected' : ''}>${label}</option>`).join('');
function row(t, i) {
  return `<article class="pt-row${t.skip ? ' skipped' : ''}" data-i="${i}">
  <div class="pt-line"><input type="checkbox" data-k="print" ${t.skip ? '' : 'checked'} aria-label="להדפסה, שורה ${i + 1}"><input data-k="name" value="${esc(t.name)}" maxlength="60" placeholder="שם המוצר" aria-label="שם המוצר, שורה ${i + 1}" autocomplete="off"><input data-k="price" class="pt-price" value="${esc(t.price)}" maxlength="10" inputmode="decimal" dir="ltr" placeholder="₪ 0.00" aria-label="מחיר, שורה ${i + 1}" autocomplete="off"></div>
  <div class="pt-line pt-extra"><select data-k="per" aria-label="המחיר הוא">${options(PER, t.per)}</select><input data-k="amount" value="${esc(t.amount)}" maxlength="10" inputmode="decimal" dir="ltr" placeholder="גודל" aria-label="גודל האריזה (רשות)" autocomplete="off"><select data-k="measure" aria-label="יחידת גודל">${options(MEASURES, t.measure)}</select><label class="pt-copies">×<input data-k="copies" value="${esc(t.copies)}" maxlength="2" inputmode="numeric" dir="ltr" aria-label="עותקים"></label><button type="button" data-remove class="pt-remove" aria-label="מחיקת שורה ${i + 1}">×</button></div>
  <div class="pt-line pt-extra"><input data-k="barcode" value="${esc(t.barcode)}" maxlength="32" inputmode="numeric" dir="ltr" placeholder="ברקוד (רשות)" aria-label="ברקוד, שורה ${i + 1}" autocomplete="off"><button type="button" data-scan class="pt-scan">סריקה</button></div>
  <p class="pt-row-error" role="alert" hidden></p></article>`;
}
function renderList() {
  $('pt-list').innerHTML = state.tags.map(row).join('');
  $('pt-sizes').innerHTML = TAG_SIZES.map(z => `<button type="button" data-size="${z.id}" aria-pressed="${z.id === state.size}" class="${z.id === state.size ? 'active' : ''}">${z.id} בדף</button>`).join('');
  refresh();
}
function checked() {
  const results = state.tags.map(t => t.skip ? { empty: true } : checkTag(t));
  $('pt-list').querySelectorAll('.pt-row').forEach((el, i) => { const r = results[i], p = el.querySelector('.pt-row-error'); p.hidden = !r?.error; p.textContent = r?.error || ''; el.classList.toggle('invalid', !!r?.error); });
  const all = state.tags.filter(t => !t.skip).length; $('pt-all').checked = all === state.tags.length; $('pt-all').indeterminate = all > 0 && all < state.tags.length;
  return results;
}
function refresh() {
  clearTimeout(timer); timer = null; persist();
  const results = checked(), valid = results.filter(r => r.tag), errors = results.filter(r => r.error).length;
  const rev = ++revision; files = []; pages.forEach(cv => { cv.width = 0; cv.height = 0; }); pages = []; $('pt-pages').replaceChildren();
  $('pt-error').hidden = true;
  try {
    const plan = tagPages(valid, state.size), count = valid.reduce((n, r) => n + r.copies, 0);
    $('pt-count').textContent = count ? `${count} שלטים · ${plan.pages.length} ${plan.pages.length === 1 ? 'דף' : 'דפים'}` : '';
    if (!count) { $('pt-pages').innerHTML = `<div class="empty-state">${errors ? 'יש לתקן את השורות המסומנות.' : 'הוסיפו שם ומחיר למוצר אחד לפחות.'}</div>`; return; }
    plan.pages.forEach((tags, i) => { const cv = renderTagPage(tags, plan.size); pages.push(cv); if (plan.pages.length > 1) { const l = document.createElement('div'); l.className = 'page-label'; l.textContent = `עמוד ${i + 1} מתוך ${plan.pages.length}`; $('pt-pages').append(l); } $('pt-pages').append(cv); });
    if (errors) { $('pt-error').textContent = `${errors} ${errors === 1 ? 'שורה לא תקינה ולא נכנסה' : 'שורות לא תקינות ולא נכנסו'} לדף.`; $('pt-error').hidden = false; }
    filesReady = Promise.all(pages.map((cv, i) => new Promise((ok, fail) => cv.toBlob(b => b ? ok(new File([b], `price-tags-${i + 1}.png`, { type: 'image/png' })) : fail(new Error('יצירת התמונה נכשלה')), 'image/png')))).then(f => { if (rev === revision) files = f; }).catch(err => { if (rev === revision) toast(err.message); });
  } catch (err) { $('pt-error').textContent = err.message; $('pt-error').hidden = false; $('pt-count').textContent = ''; }
}
function schedule() { persist(); clearTimeout(timer); timer = setTimeout(refresh, 200); }
function addRow(focus = true) {
  if (state.tags.length >= MAX_TAGS) return toast(`אפשר עד ${MAX_TAGS} מוצרים ברשימה`);
  const last = state.tags.at(-1); state.tags.push({ ...newTag(), per: last?.per || '', measure: last?.measure || 'g' }); renderList();
  if (focus) $('pt-list').lastElementChild.querySelector('[data-k=name]').focus();
}
const indexOf = el => Number(el.closest('[data-i]')?.dataset.i);
$('pt-list').addEventListener('input', ev => {
  const i = indexOf(ev.target), k = ev.target.dataset.k; if (!state.tags[i] || !k) return;
  if (k === 'print') { state.tags[i].skip = !ev.target.checked; ev.target.closest('.pt-row').classList.toggle('skipped', state.tags[i].skip); return refresh(); }
  state.tags[i][k] = ev.target.value; ev.target.tagName === 'SELECT' ? refresh() : schedule();
});
$('pt-list').addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
  ev.preventDefault(); const i = indexOf(ev.target);
  if (ev.target.dataset.k === 'name') return $('pt-list').children[i].querySelector('[data-k=price]').focus();
  if (i === state.tags.length - 1) return addRow();
  $('pt-list').children[i + 1].querySelector('[data-k=name]').focus();
});
$('pt-list').addEventListener('click', ev => {
  const scan = ev.target.closest('[data-scan]'); if (scan) return openScan(state.tags[indexOf(scan)]);
  const b = ev.target.closest('[data-remove]'); if (!b) return;
  const i = indexOf(b), t = state.tags[i]; if ((t.name || t.price) && !confirm(`למחוק את ״${t.name || 'השורה'}״ מהרשימה?`)) return;
  state.tags.splice(i, 1); if (!state.tags.length) state.tags.push(newTag()); renderList();
});
$('pt-add').addEventListener('click', () => addRow());
$('pt-all').addEventListener('change', ev => { state.tags.forEach(t => t.skip = !ev.target.checked); renderList(); });
$('pt-clear').addEventListener('click', () => { if (!confirm('למחוק את כל רשימת שלטי המחיר? אי אפשר לבטל.')) return; state.tags = [newTag()]; renderList(); });
$('pt-sizes').addEventListener('click', ev => { const b = ev.target.closest('[data-size]'); if (b) { state.size = b.dataset.size; renderList(); } });

// ---- barcode scanning: shares the scan dialog markup; app.js stops the camera when it closes ----
let scanGeneration = 0, stopScan = null;
function closeScan() { scanGeneration++; stopScan?.(); stopScan = null; }
async function openScan(tag) {
  if (!tag) return;
  closeScan(); const generation = scanGeneration, dialog = $('scan-dialog');
  $('scan-status').textContent = 'מפעיל מצלמה…'; $('scan-torch').hidden = true; dialog.showModal();
  try {
    const stop = await startScanner($('camera'), code => {
      if (state.tags.includes(tag)) { tag.barcode = String(code).trim().slice(0, 32); renderList(); }
      if (dialog.open) dialog.close();
    }, () => generation !== scanGeneration || !dialog.open, { frame: $('scan-frame'), torchButton: $('scan-torch'), onStatus: text => { $('scan-status').textContent = text; } });
    if (generation !== scanGeneration) stop(); else stopScan = stop;
  } catch (err) { if (generation === scanGeneration) $('scan-status').textContent = err.message; }
}
$('scan-dialog').addEventListener('close', closeScan);

// ---- output ----
function ready() { if (timer) refresh(); if (!pages.length) { toast('אין שלטים תקינים להדפסה'); return false; } return true; }
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000); }
$('pt-share').addEventListener('click', async () => {
  if (!ready()) return;
  try { await filesReady; if (!files.length) throw new Error('התמונות עדיין אינן מוכנות'); if (navigator.canShare?.({ files })) { try { await navigator.share({ files, title: 'שלטי מחיר' }); } catch (err) { if (err.name !== 'AbortError') toast('השיתוף לא הצליח'); } } else files.forEach(f => download(f, f.name)); } catch (err) { toast(err.message); }
});
$('pt-print').addEventListener('click', () => {
  if (!ready()) return;
  try {
    pdfFile = new File([canvasesToPDF(pages)], 'price-tags.pdf', { type: 'application/pdf' }); $('pt-print-pages').replaceChildren();
    pages.forEach(cv => { const wrap = document.createElement('div'), copy = document.createElement('canvas'); wrap.className = 'print-sheet'; copy.width = cv.width; copy.height = cv.height; copy.getContext('2d').drawImage(cv, 0, 0); wrap.append(copy); $('pt-print-pages').append(wrap); });
    $('pt-page-count').textContent = `${pages.length} דפי A4 · לגזור לאורך הקווים`; $('pt-share-pdf').hidden = !navigator.canShare?.({ files: [pdfFile] });
    document.documentElement.classList.add('pt-printing'); $('pt-print-dialog').showModal();
  } catch (err) { toast(err.message); }
});
$('pt-close-print').addEventListener('click', () => $('pt-print-dialog').close());
$('pt-print-dialog').addEventListener('close', () => { document.documentElement.classList.remove('pt-printing'); pdfFile = null; $('pt-print-pages').querySelectorAll('canvas').forEach(cv => { cv.width = 0; cv.height = 0; }); $('pt-print-pages').replaceChildren(); });
$('pt-native-print').addEventListener('click', () => window.print());
$('pt-download-pdf').addEventListener('click', () => { if (pdfFile) download(pdfFile, pdfFile.name); });
$('pt-share-pdf').addEventListener('click', async () => { if (!pdfFile) return; try { await navigator.share({ files: [pdfFile], title: 'שלטי מחיר' }); } catch (err) { if (err.name !== 'AbortError') toast('השיתוף לא הצליח. אפשר לשמור PDF'); } });

// ---- navigation: the editor view stays owned by app.js ----
const nav = $('open-price-tags');
function setPressed(b, on) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
function open() {
  if (!$('price-view').hidden) return;
  document.querySelectorAll('.header-nav [data-type]').forEach(b => setPressed(b, false)); setPressed(nav, true);
  $('editor-view').hidden = true; $('action-bar').hidden = true; $('price-view').hidden = false;
  window.scrollTo(0, 0); renderList();
}
// Type buttons re-render their own pressed state and show the editor in app.js.
function leave() { $('price-view').hidden = true; setPressed(nav, false); }
nav.addEventListener('click', open);
document.querySelectorAll('.header-nav [data-type]').forEach(b => b.addEventListener('click', leave));
document.fonts?.ready.then(() => { if (!$('price-view').hidden) refresh(); });

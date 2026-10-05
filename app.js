import { VERSION, TEMPLATES, newDraft, cleanDraft, buildSign, recommend, actualProfit, money, offerText, pagePlan } from './model.js';
import { previewCanvas, renderPage } from './render.js';
import { canvasesToPDF } from './pdf.js';
import { startScanner } from './scanner.js';
const $ = id => document.getElementById(id), form = $('editor-form');
const PREFIX = 'signs-app:v1:', ITEM = PREFIX + 'item:', DRAFT = PREFIX + 'draft';
let draft = newDraft(), editing = null, selected = new Set(), saved = [], toastTimer, refreshFrame, printSigns = [], pdfFile = null, stopCamera = null, scanGeneration = 0;
const esc = str => String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
function storageError() { $('storage-warning').hidden = false; $('storage-warning').textContent = 'השמירה במכשיר אינה זמינה או שהאחסון מלא. אפשר להמשיך להכין ולהדפיס שלט, אבל אין להסתמך על שמירה אוטומטית.'; }
function read(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { storageError(); return null; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { storageError(); return false; } }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 3800); }
function error(message = '') { $('form-error').textContent = message; $('form-error').hidden = !message; }
const recovered = read(DRAFT); if (recovered) draft = cleanDraft(recovered);
function gather() {
  for (const key of Object.keys(draft)) { const input = form.elements.namedItem(key); if (input) draft[key] = input.type === 'checkbox' ? input.checked : input.value; }
}
function fill() {
  for (const key of Object.keys(draft)) { const input = form.elements.namedItem(key); if (input) { if (input.type === 'checkbox') input.checked = draft[key]; else input.value = draft[key]; } }
  $('save-sign').textContent = editing ? 'שמור שינויים בשלט' : 'שמור לרשימת השלטים'; updateControls(); renderCodes(); refresh();
}
function updateControls() {
  for (const [attribute, value] of [['type', draft.type], ['entry', draft.entry], ['kind', draft.kind]]) {
    document.querySelectorAll(`[data-${attribute}]`).forEach(b => { const active = b.dataset[attribute] === value; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  }
  $('calculator').hidden = draft.entry !== 'calc'; $('numeric-offer').hidden = draft.kind === 'free'; $('free-offer').hidden = draft.kind !== 'free'; $('quantity-field').hidden = draft.kind !== 'bundle';
  $('price-label').textContent = draft.kind === 'bundle' ? 'מחיר כולל לכל הכמות, כולל מע״מ (₪)' : 'מחיר ליחידה כולל מע״מ (₪)';
  $('template-section').hidden = draft.type !== 'outdoor'; $('indoor-note').hidden = draft.type !== 'indoor';
}
function sample() { return buildSign({ ...newDraft(), title: 'לחמניות עשרייה ברמן', subtitle: '10 לחמניות בשקית', price: '12.90', type: draft.type, template: draft.template, store: draft.store, banner: draft.banner }); }
function refresh() {
  gather(); write(DRAFT, draft); error();
  let sign;
  try { sign = buildSign(draft); $('preview-status').textContent = 'התצוגה מתעדכנת בזמן ההקלדה. עלויות ורווחים לא מופיעים בשלט.'; }
  catch (e) { sign = sample(); $('preview-status').textContent = 'דוגמה בלבד — ' + e.message; }
  previewCanvas($('live-preview'), sign);
  $('templates').querySelectorAll('button').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.template === draft.template)); previewCanvas(button.querySelector('canvas'), { ...sign, type: 'outdoor', template: button.dataset.template }); });
  calculation();
}
function calculation() {
  $('suggestions').replaceChildren(); $('actual-profit').hidden = true;
  if (draft.entry !== 'calc') return;
  try {
    const base = recommend(draft.cost, draft.vat, draft.margin, 1, draft.rounding);
    $('calculation-summary').textContent = `עלות ליחידה כולל מע״מ: ${money(base.grossCost)} ₪. בחר הצעה כדי למלא את המבצע:`;
    for (const q of [1, 2, 3, 4, 5, 6]) {
      const r = recommend(draft.cost, draft.vat, draft.margin, q, draft.rounding), b = document.createElement('button'); b.type = 'button'; b.dataset.suggestion = String(q);
      const title = document.createElement('strong'); title.textContent = q === 1 ? `${money(r.total)} ₪` : `${q} ב־${money(r.total)} ₪`;
      const detail = document.createElement('small'); detail.textContent = `${q === 1 ? 'ליחידה · ' : ''}רווח ${r.margin.toFixed(1)}%`;
      b.append(title, detail); b.addEventListener('click', () => { draft.kind = q === 1 ? 'unit' : 'bundle'; draft.quantity = String(q); draft.price = r.total.toFixed(2); fill(); }); $('suggestions').append(b);
    }
    if (draft.price && draft.kind !== 'free') {
      const actual = actualProfit(draft), below = actual.margin + 1e-7 < Number(draft.margin.replace(',', '.'));
      const box = $('actual-profit'); box.hidden = false; box.classList.toggle('error', below);
      box.textContent = `במחיר שבחרת: רווח גולמי ${actual.margin.toFixed(2)}% · ${money(actual.profit)} ₪ ללא מע״מ ${draft.kind === 'bundle' ? 'לכל המבצע' : 'ליחידה'}.` + (below ? ' המחיר נמוך מיעד הרווח שהגדרת.' : '');
    }
  } catch (e) { $('calculation-summary').textContent = e.message; }
}
TEMPLATES.forEach(([id, name, description]) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'template-option'; b.dataset.template = id; b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<canvas aria-hidden="true"></canvas><span>${esc(name)}</span><small>${esc(description)}</small>`;
  b.addEventListener('click', () => { draft.template = id; refresh(); }); $('templates').append(b);
});
for (const attribute of ['type', 'entry', 'kind']) document.querySelectorAll(`[data-${attribute}]`).forEach(button => button.addEventListener('click', () => { gather(); draft[attribute] = button.dataset[attribute]; updateControls(); refresh(); }));
form.addEventListener('input', () => { cancelAnimationFrame(refreshFrame); refreshFrame = requestAnimationFrame(refresh); });
form.addEventListener('change', refresh);
function reset() { const { store, vat, margin, rounding, type, template } = draft; draft = { ...newDraft(), store, vat, margin, rounding, type, template }; editing = null; $('barcode-details').open = false; fill(); $('title').focus(); }
$('new-sign').addEventListener('click', () => { gather(); if ((draft.title || draft.price || draft.free) && !confirm('לפתוח שלט חדש? השינויים שלא נשמרו ברשימת השלטים יוחלפו.')) return; reset(); });
function loadSaved() {
  const list = [];
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (!key?.startsWith(ITEM)) continue; const item = read(key); if (!item || item.id !== key.slice(ITEM.length) || typeof item.id !== 'string') continue; try { item.draft = cleanDraft(item.draft); item.sign = buildSign(item.draft); list.push(item); } catch {} } } catch { storageError(); }
  saved = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); selected = new Set([...selected].filter(id => saved.some(s => s.id === id))); renderSaved();
}
function updateSelected() { $('print-selected').disabled = !selected.size; $('print-selected').textContent = selected.size ? `הדפס נבחרים (${selected.size})` : 'הדפס נבחרים'; $('select-all').checked = saved.length > 0 && selected.size === saved.length; $('select-all').indeterminate = selected.size > 0 && selected.size < saved.length; }
function renderSaved() {
  const list = $('library-list'); list.replaceChildren(); $('library-count').textContent = String(saved.length);
  if (!saved.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'עדיין אין שלטים שמורים. השלט הראשון שלך מתחיל בכותרת למעלה.'; list.append(empty); }
  saved.forEach(item => {
    const row = document.createElement('article'); row.className = 'saved-sign';
    row.innerHTML = `<input type="checkbox" aria-label="בחירת ${esc(item.sign.title)}" ${selected.has(item.id) ? 'checked' : ''}><canvas aria-hidden="true"></canvas><div><h3>${esc(item.sign.title)}</h3><p>${esc(offerText(item.sign))}</p><small>${item.sign.type === 'outdoor' ? 'שלט חוץ · ' + esc(TEMPLATES.find(t => t[0] === item.sign.template)[1]) : 'שלט חנות'}</small></div><div class="saved-actions"><button data-action="edit">עריכה</button><button data-action="copy">שכפול</button><button data-action="delete">מחיקה</button></div>`;
    previewCanvas(row.querySelector('canvas'), item.sign);
    row.querySelector('input').addEventListener('change', e => { e.target.checked ? selected.add(item.id) : selected.delete(item.id); updateSelected(); });
    row.querySelector('[data-action=edit]').addEventListener('click', () => { draft = cleanDraft(item.draft); editing = item.id; fill(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('עריכת שלט שמור — בסיום יש לשמור שינויים'); });
    row.querySelector('[data-action=copy]').addEventListener('click', () => { draft = cleanDraft(item.draft); editing = null; fill(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('נוצר עותק לעריכה. שמירה תוסיף שלט חדש'); });
    row.querySelector('[data-action=delete]').addEventListener('click', () => { if (!confirm(`למחוק את השלט ״${item.sign.title}״?`)) return; try { localStorage.removeItem(ITEM + item.id); if (editing === item.id) { editing = null; fill(); } selected.delete(item.id); loadSaved(); } catch { storageError(); } }); list.append(row);
  }); updateSelected();
}
form.addEventListener('submit', e => {
  e.preventDefault(); gather();
  try {
    buildSign(draft); const id = editing || crypto.randomUUID();
    if (!editing && saved.length >= 150) throw new Error('הרשימה מלאה. יש לגבות ולמחוק שלטים ישנים');
    if (write(ITEM + id, { id, updatedAt: Date.now(), draft: cleanDraft(draft) })) { editing = id; selected.add(id); loadSaved(); fill(); toast('השלט נשמר במכשיר'); }
  } catch (e) { error(e.message); $('form-error').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
});
$('select-all').addEventListener('change', e => { selected = new Set(e.target.checked ? saved.map(s => s.id) : []); renderSaved(); });
window.addEventListener('storage', e => { if (e.key?.startsWith(ITEM) || e.key === null) { loadSaved(); toast('רשימת השלטים עודכנה מחלון אחר; הטיוטה שלך לא הוחלפה'); } });
function addCode(value) {
  const code = String(value ?? '').trim();
  if (!/^[\x20-\x7e]{1,32}$/.test(code)) { toast('יש להזין ברקוד של עד 32 תווים, ללא אותיות בעברית'); return; }
  if (draft.barcodes.includes(code)) { toast('הברקוד כבר נוסף'); return; }
  if (draft.barcodes.length >= 24) { toast('אפשר לצרף עד 24 ברקודים לשלט'); return; }
  draft.barcodes.push(code); $('barcode-input').value = ''; renderCodes(); refresh();
}
function renderCodes() {
  $('barcode-list').replaceChildren(); draft.barcodes.forEach(code => {
    const row = document.createElement('div'); row.className = 'barcode-item'; const label = document.createElement('code'); label.dir = 'ltr'; label.textContent = code;
    const del = document.createElement('button'); del.type = 'button'; del.className = 'text-button'; del.textContent = 'הסר'; del.setAttribute('aria-label', 'הסר ברקוד ' + code); del.addEventListener('click', () => { draft.barcodes = draft.barcodes.filter(c => c !== code); renderCodes(); refresh(); }); row.append(label, del); $('barcode-list').append(row);
  });
}
$('add-barcode').addEventListener('click', () => addCode($('barcode-input').value));
$('barcode-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCode(e.target.value); } });
function closeCamera() { scanGeneration++; stopCamera?.(); stopCamera = null; const video = $('camera'); video.srcObject?.getTracks().forEach(t => t.stop()); video.srcObject = null; }
$('scan').addEventListener('click', async () => {
  closeCamera(); const generation = scanGeneration; $('scan-status').textContent = 'מפעיל מצלמה…'; $('scan-dialog').showModal();
  try { const stop = await startScanner($('camera'), code => { addCode(code); if ($('scan-dialog').open) $('scan-dialog').close(); }, () => generation !== scanGeneration || !$('scan-dialog').open); if (generation !== scanGeneration) stop(); else { stopCamera = stop; $('scan-status').textContent = 'מחפש ברקוד…'; } }
  catch (e) { if (generation === scanGeneration) $('scan-status').textContent = e.message; }
});
$('close-scan').addEventListener('click', () => $('scan-dialog').close()); $('scan-dialog').addEventListener('close', closeCamera);
window.addEventListener('pagehide', closeCamera); document.addEventListener('visibilitychange', () => { if (document.hidden) { closeCamera(); if ($('scan-dialog').open) $('scan-dialog').close(); } });
function clearPrint() { $('print-pages').querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; }); $('print-pages').replaceChildren(); pdfFile = null; }
function preparePrint() {
  clearPrint(); $('print-error').hidden = true;
  try {
    const plans = pagePlan(printSigns, $('print-layout').value), canvases = [];
    for (const plan of plans) { const page = document.createElement('div'); page.className = 'print-sheet' + (plan.landscape ? ' landscape' : ''); const canvas = renderPage(plan); canvases.push(canvas); page.append(canvas); $('print-pages').append(page); }
    pdfFile = new File([canvasesToPDF(canvases)], `signs-${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' });
    $('page-count').textContent = `${printSigns.length} שלטים · ${plans.length} דפי A4`;
    $('share-pdf').hidden = !(navigator.canShare && navigator.canShare({ files: [pdfFile] }));
    for (const id of ['native-print', 'download-pdf', 'share-pdf']) $(id).disabled = false;
  } catch (e) { for (const id of ['native-print', 'download-pdf', 'share-pdf']) $(id).disabled = true; $('print-error').textContent = e.message; $('print-error').hidden = false; }
}
function openPrint(signs) { printSigns = signs; $('print-layout').disabled = signs.every(s => s.type === 'outdoor'); $('print-dialog').showModal(); preparePrint(); }
$('preview-print').addEventListener('click', () => { gather(); try { openPrint([buildSign(draft)]); } catch (e) { error(e.message); } });
$('print-selected').addEventListener('click', () => { try { const signs = saved.filter(s => selected.has(s.id)).map(s => s.sign); pagePlan(signs, $('print-layout').value); openPrint(signs); } catch (e) { toast(e.message); } });
$('print-layout').addEventListener('change', preparePrint); $('close-print').addEventListener('click', () => $('print-dialog').close()); $('print-dialog').addEventListener('close', clearPrint);
$('native-print').addEventListener('click', () => window.print());
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000); }
$('download-pdf').addEventListener('click', () => { if (pdfFile) download(pdfFile, pdfFile.name); });
$('share-pdf').addEventListener('click', async () => { if (!pdfFile) return; try { await navigator.share({ files: [pdfFile], title: 'שלטי מבצע להדפסה' }); } catch (e) { if (e.name !== 'AbortError') { $('print-error').textContent = 'השיתוף לא הצליח. אפשר להשתמש בכפתור שמור PDF'; $('print-error').hidden = false; } } });
$('backup').addEventListener('click', () => download(new Blob([JSON.stringify({ app: 'signs-app', version: 1, signs: saved.map(({ id, updatedAt, draft }) => ({ id, updatedAt, draft })) }, null, 2)], { type: 'application/json' }), 'signs-backup.json'));
$('restore').addEventListener('click', () => $('restore-file').click());
$('restore-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('קובץ הגיבוי גדול מדי');
    const data = JSON.parse(await file.text());
    if (data.app !== 'signs-app' || data.version !== 1 || !Array.isArray(data.signs) || data.signs.length > 150) throw new Error('זה אינו גיבוי נתמך של אפליקציית השלטים');
    const incoming = data.signs.map(item => { if (!item || typeof item.draft !== 'object') throw new Error('שלט לא תקין בגיבוי'); const d = cleanDraft(item.draft); buildSign(d); return d; });
    if (incoming.length + saved.length > 150) throw new Error('אין מספיק מקום ברשימה. יש למחוק שלטים ישנים לפני הייבוא');
    if (!confirm(`לייבא ${incoming.length} שלטים כעותקים חדשים? השלטים הקיימים לא יימחקו.`)) return;
    let count = 0; for (const d of incoming) { const id = crypto.randomUUID(); if (!write(ITEM + id, { id, updatedAt: Date.now(), draft: d })) break; count++; } loadSaved(); toast(`יובאו ${count} שלטים`);
  } catch (e) { toast(e.message); } finally { $('restore-file').value = ''; }
});
fill(); loadSaved();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(reg => { reg.update().catch(() => {}); }).catch(() => {});
// Expose only the version for diagnostics, never private prices or stored data.
document.documentElement.dataset.version = VERSION;

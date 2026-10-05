import { VERSION, TEMPLATES, newDraft, cleanDraft, buildSign, previewSign, recommend, actualProfit, money, offerText, pagePlan } from './model.js';
import { previewCanvas, renderPage } from './familiar-render.js';
import { canvasesToPDF } from './pdf.js';
import { startScanner } from './scanner.js';
const $ = id => document.getElementById(id), PREFIX = 'signs-app:v1:', ITEM = PREFIX + 'item:', WORK = PREFIX + 'workspace';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let entries = [], saved = [], selected = new Set(), layout = '4', type = 'indoor', pages = [], imageFiles = [], imageReady = Promise.resolve(), imageRevision = 0;
let timer, refreshTimer, pdfFile = null, stopCamera = null, scanGeneration = 0, scanTarget = null;
function storageError() { $('storage-warning').hidden = false; $('storage-warning').textContent = 'השמירה במכשיר אינה זמינה. אפשר להכין ולהדפיס, אך אין להסתמך על שמירה אוטומטית.'; }
function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { storageError(); return null; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { storageError(); return false; } }
function toast(message) { clearTimeout(timer); $('toast').textContent = message; $('toast').hidden = false; timer = setTimeout(() => $('toast').hidden = true, 4000); }
function error(message = '') { $('form-error').hidden = !message; $('form-error').textContent = message; }
const entry = (draft = newDraft(), savedId = null) => ({ uid: crypto.randomUUID(), savedId, draft: cleanDraft(draft) });
const work = read(WORK), old = read(PREFIX + 'draft');
if (work && Array.isArray(work.entries) && work.entries.length && work.entries.length <= 30) {
  entries = work.entries.map(e => entry(e?.draft, typeof e?.savedId === 'string' ? e.savedId : null));
  if (['4','2small','2','1'].includes(work.layout)) layout = work.layout;
  if (['indoor','outdoor'].includes(work.type)) type = work.type;
} else { entries = [entry(old || newDraft())]; type = entries[0].draft.type; }
function persist() { write(WORK, { version: 2, layout, type, entries: entries.map(({savedId,draft}) => ({savedId,draft})) }); }
function field(e, key, label, options = {}) {
  const id = `${e.uid}-${key}`, d = e.draft, { placeholder = '', inputmode = '', maxlength = 100, inputType = 'text' } = options;
  return `<label for="${id}">${label}</label><input id="${id}" data-field="${key}" value="${esc(d[key])}" type="${inputType}" maxlength="${maxlength}" ${inputmode ? `inputmode="${inputmode}" dir="ltr"` : ''} placeholder="${esc(placeholder)}" autocomplete="off">`;
}
function choices(e, attr, items, active) { return items.map(([v,label]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === active}" class="${v === active ? 'active' : ''}">${label}</button>`).join(''); }
function select(e, key, label, items) { return `<label for="${e.uid}-${key}">${label}</label><select id="${e.uid}-${key}" data-field="${key}">${items.map(([v,t]) => `<option value="${v}" ${e.draft[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`; }
function card(e, i) {
  const d = e.draft, numeric = ['unit','bundle'].includes(d.kind);
  const priceFields = d.kind === 'free' ? `<div>${field(e,'free','טקסט המבצע',{placeholder:'למשל: השני בחצי מחיר',maxlength:60})}</div>` : d.kind === 'pct' ? `<div>${field(e,'pct','אחוז הנחה (%)',{placeholder:'10',inputmode:'decimal'})}</div>` : `${d.kind === 'bundle' ? `<div class="quantity-field">${field(e,'quantity','כמות',{inputmode:'numeric',placeholder:'4'})}</div>` : ''}<div>${field(e,'price',d.kind === 'unit' ? 'מחיר ליח׳ (₪)' : 'מחיר כולל (₪)',{inputmode:'decimal',placeholder:'0.00'})}</div><div class="old-field">${field(e,'oldPrice','במקום ליח׳ ₪ (רשות)',{inputmode:'decimal',placeholder:'14'})}</div>`;
  return `<article class="card" data-uid="${e.uid}"><div class="card-top"><span>שלט ${i + 1}${d.barcodes.length ? ` · ${d.barcodes.length} ברקודים` : ''}</span><div><button data-action="copy">שכפול</button> <button data-action="remove" class="delete-card" aria-label="מחיקת שלט ${i+1}">×</button></div></div>
  <div class="title-field">${field(e,'title','כותרת השלט',{placeholder:'למשל: לחמניות עשרייה ברמן',maxlength:80})}</div>
  <div class="kind-row" role="group" aria-label="סוג מבצע">${choices(e,'kind',[['unit','מחיר ליח׳'],['bundle','כמות במחיר'],['pct','% הנחה']],d.kind)}</div>
  <div class="offer-row">${priceFields}</div>
  <div class="entry-row" role="group" aria-label="אופן קביעת המחיר">${choices(e,'entry',[['manual','המבצע כבר ידוע לי'],['calc','חישוב לפי מחיר קנייה']],d.entry)}</div>
  <div class="calculator" ${d.entry !== 'calc' ? 'hidden' : ''}>
    <div class="field-row"><div>${field(e,'cost','קנייה ליח׳ לפני מע״מ',{inputmode:'decimal',placeholder:'8.50'})}</div><div class="vat-field">${field(e,'vat','מע״מ (%)',{inputmode:'decimal'})}</div><div class="profit-field">${field(e,'margin','אחוז רווח (%)',{inputmode:'decimal'})}</div></div>
    <p class="hint">${d.profitMode === 'markup' ? 'כמו ב־יטבתה: תוספת על מחיר הקנייה + מע״מ, לא אחוז מתוך המכירה.' : 'מרווח מתוך המכירה — נשמרה שיטת החישוב של השלט הקודם.'} העלות ליחידת מכירה אחרי הנחות ספק, לא לארגז.</p>
    <div class="recommendation" data-recommendation></div><div class="profit-info" data-profit></div>
    <details data-detail="pricing"><summary>אפשרויות חישוב נוספות</summary><div class="details-body options-grid"><div>${select(e,'profitMode','איך לחשב רווח',[['markup','תוספת לעלות — כמו יטבתה'],['margin','אחוז מתוך המכירה']])}</div><div>${select(e,'rounding','עיגול המלצה',[['shop','כמו יטבתה — סיומת .90'],['exact','כלפי מעלה לאגורה'],['ninety','סיומת .90 כלפי מעלה']])}</div></div><p class="hint">העיגול של יטבתה יכול להוריד מעט מהיעד. המחיר לא משתנה בלי לחיצה על ״השתמש״.</p></details>
  </div>
  <div class="field-row"><div class="date-field">${field(e,'end','בתוקף עד',{inputType:'date'})}</div><div>${field(e,'note','הערה (לא חובה)',{placeholder:'לדוגמה: לא כולל מהדורה מיוחדת',maxlength:100})}</div></div>
  <details data-detail="extras"><summary>פרטים נוספים <span>· רשות</span></summary><div class="details-body"><div class="field-row"><div>${field(e,'subtitle','שורת משנה',{maxlength:60})}</div><div>${field(e,'start','בתוקף מתאריך',{inputType:'date'})}</div></div><div class="field-row"><div>${field(e,'store','שם החנות',{maxlength:40})}</div><div>${field(e,'banner','כותרת עליונה בשלט חוץ',{maxlength:28})}</div></div><button class="text-button" data-kind="free">טקסט מבצע חופשי</button></div></details>
  <details class="barcode-details" data-detail="barcodes"><summary>ברקודים וסריקה · רשות</summary><div class="details-body"><div class="code-entry"><input data-code-input inputmode="numeric" dir="ltr" maxlength="32" placeholder="ברקוד / סורק קופה" aria-label="ברקוד"><button data-action="add-code">הוסף</button><button data-action="scan">סריקה</button></div><div data-codes>${d.barcodes.map((code,j) => `<div class="barcode-item"><code dir="ltr">${esc(code)}</code><button class="text-button" data-remove-code="${j}">הסר</button></div>`).join('')}</div><label class="check-line"><input type="checkbox" data-field="withBarcodes" ${d.withBarcodes ? 'checked' : ''}> צרף גם דף ברקודים לקופה</label><p class="hint">המספרים מופיעים בתחתית השלט. הסריקה אינה מחפשת שם או מחיר.</p></div></details>
  ${d.type === 'outdoor' ? `<details class="template-details" data-detail="templates" ${i === 0 ? 'open' : ''}><summary>עיצוב שלט החוץ · ${esc(TEMPLATES.find(t => t[0] === d.template)?.[1])}</summary><div class="template-grid">${TEMPLATES.map(([id,label]) => `<button data-template="${id}" class="template-option" aria-pressed="${id === d.template}"><canvas aria-hidden="true"></canvas><span>${label}</span></button>`).join('')}</div></details>` : ''}
  </article>`;
}
function renderCards() {
  const open = new Set([...$('cards').querySelectorAll('details[open]')].map(el => el.closest('[data-uid]').dataset.uid + ':' + el.dataset.detail));
  $('cards').innerHTML = entries.map(card).join('');
  $('cards').querySelectorAll('details').forEach(el => { if (open.has(el.closest('[data-uid]').dataset.uid + ':' + el.dataset.detail)) el.open = true; });
  document.querySelectorAll('[data-type]').forEach(b => { const on = b.dataset.type === type; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  $('layouts').hidden = entries.every(e => e.draft.type === 'outdoor'); $('outdoor-note').hidden = !$('layouts').hidden;
  document.querySelectorAll('[data-layout]').forEach(b => { const on = b.dataset.layout === layout; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  refresh();
}
function calculate(e, element) {
  if (e.draft.entry !== 'calc') return;
  const d = e.draft, box = element.querySelector('[data-recommendation]'), info = element.querySelector('[data-profit]'); info.textContent = ''; info.classList.remove('warn');
  if (!['unit','bundle'].includes(d.kind)) { box.textContent = 'לחישוב מחיר בחר ״מחיר ליח׳״ או ״כמות במחיר״.'; return; }
  try {
    const q = d.kind === 'bundle' ? d.quantity : 1;
    const r = recommend(d.cost,d.vat,d.margin,q,d.rounding,d.profitMode);
    box.innerHTML = `<span>עלות כולל מע״מ: <b>${money(r.grossCost)} ₪</b><br>המלצת מחיר: <b>${money(r.total)} ₪${d.kind === 'bundle' ? ' לכל הכמות' : ''}</b></span><button data-action="apply">השתמש</button>`;
    if (d.price) {
      const actual = actualProfit(d), measure = d.profitMode === 'markup' ? actual.markup : actual.margin, goal = Number(d.margin.replace(',','.'));
      info.textContent = `במחיר שנבחר: ${d.profitMode === 'markup' ? 'תוספת לעלות' : 'מרווח'} ${measure.toFixed(2)}% · רווח גולמי ${money(actual.profit)} ₪ ללא מע״מ.`;
      if (measure + 1e-7 < goal) { info.classList.add('warn'); info.textContent += ' נמוך מהיעד שהוגדר.'; }
    }
  } catch (err) { box.textContent = err.message; }
}
function schedule() { clearTimeout(refreshTimer); persist(); refreshTimer = setTimeout(refresh,100); }
function refresh() {
  clearTimeout(refreshTimer); refreshTimer = null; persist(); error();
  $('cards').querySelectorAll('[data-uid]').forEach(el => { const e = entries.find(e => e.uid === el.dataset.uid); calculate(e,el); if (el.querySelector('.template-details')?.open) el.querySelectorAll('[data-template]').forEach(b => previewCanvas(b.querySelector('canvas'),{...previewSign(e.draft),template:b.dataset.template})); });
  const revision = ++imageRevision; imageFiles = [];
  pages.forEach(c => { c.width = 0; c.height = 0; }); pages = []; $('signPages').replaceChildren();
  try {
    const plans = pagePlan(entries.map(e => previewSign(e.draft)),layout);
    plans.forEach((plan,i) => { const cv = renderPage(plan); pages.push(cv); if (plans.length > 1) { const l = document.createElement('div'); l.className = 'page-label'; l.textContent = `עמוד ${i+1} מתוך ${plans.length}`; $('signPages').append(l); } $('signPages').append(cv); });
    imageReady = Promise.all(pages.map((cv,i) => new Promise((resolve,reject) => cv.toBlob(blob => blob ? resolve(new File([blob],`sign-${i+1}.png`,{type:'image/png'})) : reject(new Error('יצירת התמונה נכשלה')),'image/png')))).then(files => { if (revision === imageRevision) imageFiles = files; }).catch(err => { if (revision === imageRevision) error(err.message); });
  } catch (err) { error(err.message); }
}
function validated() {
  try { entries.forEach((e,i) => { try { buildSign(e.draft); } catch(err) { throw new Error(`שלט ${i+1}: ${err.message}`); } }); return true; }
  catch(err) { error(err.message); $('form-error').scrollIntoView({block:'center',behavior:'smooth'}); return false; }
}
function currentEntry(target) { return entries.find(e => e.uid === target.closest('[data-uid]')?.dataset.uid); }
$('cards').addEventListener('input',event => { const e = currentEntry(event.target), key = event.target.dataset.field; if (!e || !Object.hasOwn(e.draft,key) || key === 'barcodes') return; e.draft[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; schedule(); });
$('cards').addEventListener('change',event => { if (event.target.dataset.field === 'profitMode') renderCards(); });
$('cards').addEventListener('toggle',event => { if (event.target.classList?.contains('template-details') && event.target.open) schedule(); },true);
$('cards').addEventListener('keydown',event => { if (event.key === 'Enter' && event.target.matches('[data-code-input]')) { event.preventDefault(); addCode(currentEntry(event.target),event.target.value); } });
$('cards').addEventListener('click',event => {
  const button = event.target.closest('button'), e = currentEntry(event.target); if (!button || !e) return;
  if (button.dataset.kind) { e.draft.kind = button.dataset.kind; renderCards(); }
  else if (button.dataset.entry) { e.draft.entry = button.dataset.entry; renderCards(); }
  else if (button.dataset.template) { e.draft.template = button.dataset.template; renderCards(); }
  else if (button.hasAttribute('data-remove-code')) { e.draft.barcodes.splice(Number(button.dataset.removeCode),1); renderCards(); }
  else if (button.dataset.action === 'remove') { if ((e.draft.title || e.draft.price || e.draft.free) && !confirm('להסיר את השלט מהעריכה? עותק שמור לא יימחק.')) return; entries = entries.filter(x => x !== e); if (!entries.length) entries = [entry({...newDraft(),type,store:e.draft.store})]; renderCards(); }
  else if (button.dataset.action === 'copy') { if (entries.length >= 30) return toast('אפשר עד 30 שלטים בכל עריכה'); entries.splice(entries.indexOf(e)+1,0,entry(e.draft)); renderCards(); }
  else if (button.dataset.action === 'apply') { try { const d = e.draft, r = recommend(d.cost,d.vat,d.margin,d.kind === 'bundle' ? d.quantity : 1,d.rounding,d.profitMode); d.price = r.total.toFixed(2); renderCards(); } catch(err) { toast(err.message); } }
  else if (button.dataset.action === 'add-code') addCode(e,button.closest('[data-uid]').querySelector('[data-code-input]').value);
  else if (button.dataset.action === 'scan') openScanner(e.uid);
});
$('new-sign').addEventListener('click',() => { if (entries.length >= 30) return toast('אפשר עד 30 שלטים בכל עריכה'); const last = entries.at(-1).draft; const e = entry({...newDraft(),type,store:last.store,vat:last.vat}); entries.push(e); renderCards(); $('cards').querySelector(`[data-uid="${e.uid}"] [data-field="title"]`).focus(); });
document.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click',() => { type = b.dataset.type; entries.forEach(e => e.draft.type = type); showEditor(); renderCards(); }));
document.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click',() => { layout = b.dataset.layout; renderCards(); }));
function addCode(e, value) { const code = String(value || '').trim(); if (!e || !/^[\x20-\x7e]{1,32}$/.test(code)) return toast('ברקוד לא תקין — עד 32 תווים ללא עברית'); if (e.draft.barcodes.includes(code)) return toast('הברקוד כבר מופיע'); if (e.draft.barcodes.length >= 24) return toast('אפשר עד 24 ברקודים לשלט'); e.draft.barcodes.push(code); renderCards(); }
function loadSaved() {
  const items = [];
  try { for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i); if (!key?.startsWith(ITEM)) continue; const item=read(key); if (!item || item.id !== key.slice(ITEM.length)) continue; try { item.draft=cleanDraft(item.draft); item.sign=buildSign(item.draft); items.push(item); } catch {} } } catch { storageError(); }
  saved=items.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)); selected=new Set([...selected].filter(id=>saved.some(s=>s.id===id))); renderSaved();
}
function renderSaved() {
  $('library-count').textContent=String(saved.length); $('library-list').replaceChildren();
  if (!saved.length) $('library-list').innerHTML='<div class="empty-state">אין עדיין שלטים שמורים. אפשר להדפיס ישירות ממסך העריכה, בלי לשמור לרשימה.</div>';
  saved.forEach(s=>{ const row=document.createElement('article'); row.className='saved-sign'; row.innerHTML=`<input type="checkbox" aria-label="בחירת ${esc(s.sign.title)}" ${selected.has(s.id)?'checked':''}><canvas aria-hidden="true"></canvas><div class="saved-title"><h3>${esc(s.sign.title)}</h3><p>${esc(offerText(s.sign))}</p></div><div class="saved-actions"><button class="soft" data-edit>עריכה</button><button class="text-button" data-delete>מחיקה</button></div>`;
    previewCanvas(row.querySelector('canvas'),s.sign); row.querySelector('input').addEventListener('change',ev=>{ev.target.checked?selected.add(s.id):selected.delete(s.id); updateSelection();});
    row.querySelector('[data-edit]').addEventListener('click',()=>loadEntries([s])); row.querySelector('[data-delete]').addEventListener('click',()=>{if(!confirm(`למחוק את השלט ״${s.sign.title}״ מהרשימה?`))return;try{localStorage.removeItem(ITEM+s.id);entries.forEach(e=>{if(e.savedId===s.id)e.savedId=null;});loadSaved();persist();}catch{storageError();}}); $('library-list').append(row);
  }); updateSelection();
}
function updateSelection() { $('load-selected').disabled=!selected.size; $('load-selected').textContent=selected.size?`ערוך נבחרים (${selected.size})`:'ערוך נבחרים'; $('select-all').checked=!!saved.length&&selected.size===saved.length; $('select-all').indeterminate=selected.size>0&&selected.size<saved.length; }
function loadEntries(items) { if(items.length>30)return toast('אפשר לערוך עד 30 שלטים יחד'); if(entries.some(e=>e.draft.title||e.draft.price||e.draft.free)&&!confirm('להחליף את השלטים שבעריכה בבחירה הזאת? השינויים שלא שמרת ברשימה יוחלפו.'))return; entries=items.map(s=>entry(s.draft,s.id));type=entries[0].draft.type;renderCards();showEditor();window.scrollTo(0,0); }
function showEditor() { $('editor-view').hidden=false;$('library-view').hidden=true;$('action-bar').hidden=false; }
function showLibrary() { loadSaved();$('editor-view').hidden=true;$('library-view').hidden=false;$('action-bar').hidden=true;window.scrollTo(0,0); }
$('open-library').addEventListener('click',showLibrary);$('back').addEventListener('click',showLibrary);$('library-back').addEventListener('click',showEditor);
$('select-all').addEventListener('change',ev=>{selected=new Set(ev.target.checked?saved.map(s=>s.id):[]);renderSaved();});$('load-selected').addEventListener('click',()=>loadEntries(saved.filter(s=>selected.has(s.id))));
$('save-sign').addEventListener('click',()=>{if(!validated())return;const fresh=entries.filter(e=>!e.savedId||!saved.some(s=>s.id===e.savedId)).length;if(saved.length+fresh>150)return toast('הרשימה מלאה — יש לגבות ולמחוק שלטים ישנים');let count=0;for(const e of entries){const id=e.savedId||crypto.randomUUID();if(!write(ITEM+id,{id,updatedAt:Date.now(),draft:cleanDraft(e.draft)}))break;e.savedId=id;count++;}persist();loadSaved();toast(`נשמרו ${count} שלטים במכשיר`);});
window.addEventListener('storage',ev=>{if(ev.key?.startsWith(ITEM)||ev.key===null){loadSaved();toast('רשימת השלטים עודכנה. השלטים שבעריכה לא הוחלפו');}});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);}
async function readyImages(){if(refreshTimer)refresh();await imageReady;if(!imageFiles.length)throw new Error('התמונות עדיין אינן מוכנות');return imageFiles;}
async function saveImages(){if(!validated())return;try{for(const f of await readyImages())download(f,f.name);}catch(err){error(err.message);}}
$('download-images').addEventListener('click',saveImages);
$('share-images').addEventListener('click',async()=>{if(!validated())return;try{const files=await readyImages();if(navigator.canShare?.({files})){try{await navigator.share({files,title:'שלטי מבצע'});}catch(err){if(err.name==='AbortError')return;toast('השיתוף לא הצליח. אפשר ללחוץ ״שמור תמונות״ מתחת לתצוגה.');}}else for(const f of files)download(f,f.name);}catch(err){error(err.message);}});
$('preview-print').addEventListener('click',()=>{if(!validated())return;if(refreshTimer)refresh();try{pdfFile=new File([canvasesToPDF(pages)],'signs.pdf',{type:'application/pdf'});$('print-pages').replaceChildren();pages.forEach(cv=>{const wrap=document.createElement('div');wrap.className='print-sheet'+(cv.width>cv.height?' landscape':'');const copy=document.createElement('canvas');copy.width=cv.width;copy.height=cv.height;copy.getContext('2d').drawImage(cv,0,0);wrap.append(copy);$('print-pages').append(wrap);});$('page-count').textContent=`${pages.length} דפי A4`;$('share-pdf').hidden=!navigator.canShare?.({files:[pdfFile]});$('print-dialog').showModal();}catch(err){error(err.message);}});
$('close-print').addEventListener('click',()=>$('print-dialog').close());$('print-dialog').addEventListener('close',()=>{pdfFile=null;$('print-pages').querySelectorAll('canvas').forEach(cv=>{cv.width=0;cv.height=0;});$('print-pages').replaceChildren();});$('native-print').addEventListener('click',()=>window.print());$('download-pdf').addEventListener('click',()=>{if(pdfFile)download(pdfFile,pdfFile.name);});$('share-pdf').addEventListener('click',async()=>{if(!pdfFile)return;try{await navigator.share({files:[pdfFile],title:'שלטי מבצע'});}catch(err){if(err.name!=='AbortError')toast('השיתוף לא הצליח. אפשר לשמור PDF');}});
function closeCamera(){scanGeneration++;stopCamera?.();stopCamera=null;$('camera').srcObject?.getTracks().forEach(t=>t.stop());$('camera').srcObject=null;}
async function openScanner(uid){closeCamera();scanTarget=uid;const generation=scanGeneration;$('scan-status').textContent='מפעיל מצלמה…';$('scan-dialog').showModal();try{const stop=await startScanner($('camera'),code=>{addCode(entries.find(e=>e.uid===scanTarget),code);if($('scan-dialog').open)$('scan-dialog').close();},()=>generation!==scanGeneration||!$('scan-dialog').open);if(generation!==scanGeneration)stop();else{stopCamera=stop;$('scan-status').textContent='מחפש ברקוד…';}}catch(err){if(generation===scanGeneration)$('scan-status').textContent=err.message;}}
$('close-scan').addEventListener('click',()=>$('scan-dialog').close());$('scan-dialog').addEventListener('close',closeCamera);window.addEventListener('pagehide',closeCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden){closeCamera();if($('scan-dialog').open)$('scan-dialog').close();}});
$('settings').addEventListener('click',()=>{$('store-setting').value=entries[0].draft.store;$('settings-dialog').showModal();});$('close-settings').addEventListener('click',()=>$('settings-dialog').close());$('save-settings').addEventListener('click',()=>{entries.forEach(e=>e.draft.store=$('store-setting').value.trim());$('settings-dialog').close();renderCards();});
$('backup').addEventListener('click',()=>download(new Blob([JSON.stringify({app:'signs-app',version:1,signs:saved.map(({id,updatedAt,draft})=>({id,updatedAt,draft}))},null,2)],{type:'application/json'}),'signs-backup.json'));
$('restore').addEventListener('click',()=>$('restore-file').click());$('restore-file').addEventListener('change',async ev=>{const file=ev.target.files[0];if(!file)return;try{if(file.size>2000000)throw new Error('קובץ הגיבוי גדול מדי');const data=JSON.parse(await file.text());if(data.app!=='signs-app'||data.version!==1||!Array.isArray(data.signs)||data.signs.length>150)throw new Error('זה אינו גיבוי נתמך');const incoming=data.signs.map(s=>{if(!s?.draft)throw new Error('שלט לא תקין בגיבוי');const d=cleanDraft(s.draft);buildSign(d);return d;});if(incoming.length+saved.length>150)throw new Error('אין מספיק מקום ברשימה');if(!confirm(`לייבא ${incoming.length} שלטים כעותקים חדשים? הקיימים לא יימחקו.`))return;let n=0;for(const d of incoming){const id=crypto.randomUUID();if(!write(ITEM+id,{id,updatedAt:Date.now(),draft:d}))break;n++;}loadSaved();toast(`יובאו ${n} שלטים`);}catch(err){toast(err.message);}finally{$('restore-file').value='';}});
renderCards();loadSaved();document.fonts?.ready.then(()=>{refresh();renderSaved();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(r=>r.update().catch(()=>{})).catch(()=>{});
document.documentElement.dataset.version=VERSION;

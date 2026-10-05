// All pricing is per selling unit. A bundle price is a total INCLUDING VAT.
export const VERSION = '1.0.0';
export const TEMPLATES = [
  ['frame', 'מסגרת קלאסית', 'ברור וחסכוני בדיו'],
  ['banner', 'כותרת שחורה', 'כותרת בולטת ומחיר נקי'],
  ['burst', 'כוכב מבצע', 'מחיר בתוך מסגרת כוכב'],
  ['ticket', 'כרטיס מבצע', 'מסגרת כרטיס וקו מקווקו'],
  ['elegant', 'נקי ואלגנטי', 'קווים דקים והרבה לבן'],
  ['split', 'חצי־חצי', 'כותרת מימין, מחיר משמאל'],
  ['bold', 'מחיר בבמה', 'מחיר לבן על רקע שחור']
];
export function newDraft() {
  return { title: '', subtitle: '', entry: 'manual', kind: 'unit', quantity: '2', price: '', free: '', cost: '', vat: '18', margin: '25', rounding: 'exact', type: 'indoor', template: 'frame', store: 'מינימרקט שלום', banner: 'מבצע!', note: '', oldPrice: '', start: '', end: '', barcodes: [], withBarcodes: false };
}
export function number(value, label = 'מספר', min = 0, max = 1000000) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) throw new Error(label + ': יש להזין מספר תקין');
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(label + ': הערך מחוץ לטווח המותר');
  return n;
}
export const centsUp = n => Math.ceil((n - 1e-9) * 100) / 100;
export const money = n => Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const priceText = n => Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2);
export function recommend(cost, vat, margin, quantity = 1, rounding = 'exact') {
  cost = number(cost, 'מחיר קנייה', 0.000001);
  vat = number(vat, 'מע״מ', 0, 100);
  margin = number(margin, 'רווח רצוי', 0, 99);
  quantity = number(quantity, 'כמות', 1, 99);
  if (!Number.isInteger(quantity)) throw new Error('כמות חייבת להיות מספר שלם');
  if (!['exact', 'ninety'].includes(rounding)) throw new Error('שיטת עיגול לא מוכרת');
  const grossCost = cost * (1 + vat / 100);
  const exact = grossCost * quantity / (1 - margin / 100);
  let total = centsUp(exact);
  if (rounding === 'ninety') {
    total = Math.floor(total) + 0.9;
    if (total + 1e-9 < exact) total += 1;
    total = Math.round(total * 100) / 100;
  }
  if (total > 1000000) throw new Error('המחיר המחושב גבוה מדי');
  const netRevenue = total / (1 + vat / 100);
  return { quantity, total, exact, grossCost, margin: (netRevenue - cost * quantity) / netRevenue * 100, profit: netRevenue - cost * quantity };
}
export function actualProfit(draft) {
  const cost = number(draft.cost, 'מחיר קנייה', 0.000001);
  const vat = number(draft.vat, 'מע״מ', 0, 100);
  const total = number(draft.price, 'מחיר המבצע', 0.01);
  const quantity = draft.kind === 'bundle' ? number(draft.quantity, 'כמות', 2, 99) : 1;
  const net = total / (1 + vat / 100);
  return { profit: net - cost * quantity, margin: (net - cost * quantity) / net * 100 };
}
export function cleanDraft(input) {
  const d = newDraft();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return d;
  for (const key of Object.keys(d)) {
    if (key === 'barcodes') d.barcodes = Array.isArray(input.barcodes) ? [...new Set(input.barcodes.filter(x => typeof x === 'string' && /^[\x20-\x7e]{1,32}$/.test(x)).map(x => x.trim()).filter(Boolean))].slice(0, 24) : [];
    else if (key === 'withBarcodes') d[key] = input[key] === true;
    else if (typeof input[key] === 'string') d[key] = input[key].slice(0, 300);
  }
  if (!['indoor', 'outdoor'].includes(d.type)) d.type = 'indoor';
  if (!['manual', 'calc'].includes(d.entry)) d.entry = 'manual';
  if (!['unit', 'bundle', 'free'].includes(d.kind)) d.kind = 'unit';
  if (!TEMPLATES.some(([id]) => id === d.template)) d.template = 'frame';
  if (!['exact', 'ninety'].includes(d.rounding)) d.rounding = 'exact';
  return d;
}
function dateOK(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function buildSign(input) {
  const d = cleanDraft(input);
  for (const [key, max, name] of [['title', 80, 'כותרת'], ['subtitle', 60, 'שורת משנה'], ['note', 100, 'הערה'], ['store', 40, 'שם החנות'], ['banner', 28, 'כותרת המבצע'], ['free', 60, 'טקסט המבצע']]) {
    d[key] = d[key].trim();
    if (d[key].length > max) throw new Error(name + ': הטקסט ארוך מדי');
  }
  if (!d.title) throw new Error('יש להזין כותרת לשלט');
  if (d.start && !dateOK(d.start) || d.end && !dateOK(d.end)) throw new Error('יש להזין תאריך תקין');
  if (d.start && d.end && d.start > d.end) throw new Error('תאריך הסיום קודם לתאריך ההתחלה');
  let price = null, quantity = 1;
  if (d.kind === 'free') {
    if (!d.free) throw new Error('יש להזין את טקסט המבצע');
  } else {
    price = number(d.price, 'מחיר המבצע', 0.01);
    if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-7) throw new Error('מחיר המבצע: לכל היותר שתי ספרות אחרי הנקודה');
    if (d.kind === 'bundle') {
      quantity = number(d.quantity, 'כמות במבצע', 2, 99);
      if (!Number.isInteger(quantity)) throw new Error('כמות במבצע חייבת להיות מספר שלם');
    }
  }
  const oldPrice = d.oldPrice ? number(d.oldPrice, 'מחיר רגיל ליחידה', 0.01) : null;
  if (oldPrice !== null && price !== null && oldPrice <= price / quantity) throw new Error('המחיר הרגיל ליחידה צריך להיות גבוה ממחיר המבצע ליחידה');
  // Only this object is sent to the renderer. Costs and margins NEVER appear on signs.
  return { title: d.title, subtitle: d.subtitle, kind: d.kind, price, quantity, free: d.free, type: d.type, template: d.template, store: d.store, banner: d.banner, note: d.note, oldPrice, start: d.start, end: d.end, barcodes: d.barcodes, withBarcodes: d.withBarcodes };
}
export function offerText(s) {
  if (s.kind === 'free') return s.free;
  return s.kind === 'bundle' ? `${s.quantity} ב־${priceText(s.price)} ₪` : `${priceText(s.price)} ₪ ליחידה`;
}
export function pagePlan(signs, layout = '2') {
  if (!['1', '2', '2small', '4'].includes(layout)) throw new Error('פריסת דף לא מוכרת');
  if (!signs.length) throw new Error('לא נבחרו שלטים');
  if (signs.length > 30) throw new Error('אפשר להדפיס עד 30 שלטים בכל פעם');
  const pages = [];
  let pending = [];
  const flush = () => { if (pending.length) { pages.push({ kind: 'signs', signs: pending, layout, landscape: layout === '1' }); pending = []; } };
  const count = layout === '1' ? 1 : layout === '4' ? 4 : 2;
  for (const sign of signs) {
    if (sign.type === 'outdoor') { flush(); pages.push({ kind: 'signs', signs: [sign], layout: '1', landscape: true }); }
    else { pending.push(sign); if (pending.length === count) flush(); }
  }
  flush();
  const codes = signs.flatMap(sign => sign.withBarcodes ? sign.barcodes.map(code => ({ title: sign.title, offer: offerText(sign), code })) : []);
  for (let i = 0; i < codes.length; i += 7) pages.push({ kind: 'barcodes', codes: codes.slice(i, i + 7), landscape: false });
  if (pages.length > 40) throw new Error('יותר מדי דפים. יש לפצל את ההדפסה לשתי קבוצות');
  return pages;
}

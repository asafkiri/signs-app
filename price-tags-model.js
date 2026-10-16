// Plain shelf price tags: no promotion logic, separate storage from the sign editor.
export const TAG_SIZES = [
  { id: '4', cols: 2, rows: 2 },
  { id: '6', cols: 2, rows: 3 },
  { id: '8', cols: 2, rows: 4 },
  { id: '9', cols: 3, rows: 3 },
  { id: '12', cols: 3, rows: 4 },
  { id: '16', cols: 4, rows: 4 },
  { id: '24', cols: 3, rows: 8 }
];
export const PER = [['', 'בלי יחידה'], ['unit', 'ליח׳'], ['kg', 'לק״ג'], ['100g', 'ל־100 גרם'], ['pack', 'למארז']];
export const MEASURES = [['g', 'גרם'], ['kg', 'ק״ג'], ['ml', 'מ״ל'], ['l', 'ליטר'], ['units', 'יח׳']];
export const MAX_TAGS = 200, MAX_COPIES = 50, MAX_PAGES = 40;
const enumOf = (list, value, fallback) => list.some(([v]) => v === value) ? value : fallback;
const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function newTag() { return { name: '', price: '', per: '', amount: '', measure: 'g', copies: '1', skip: false }; }
export function cleanTag(input = {}) {
  const t = input && typeof input === 'object' ? input : {};
  return { name: text(t.name, 60), price: text(t.price, 10), per: enumOf(PER, t.per, ''), amount: text(t.amount, 10), measure: enumOf(MEASURES, t.measure, 'g'), copies: text(t.copies, 3) || '1', skip: t.skip === true };
}
export function cleanState(input) {
  const s = input && typeof input === 'object' ? input : {};
  const tags = Array.isArray(s.tags) ? s.tags.slice(0, MAX_TAGS).map(cleanTag) : [];
  return { size: TAG_SIZES.some(z => z.id === s.size) ? s.size : '12', tags: tags.length ? tags : [newTag()] };
}

// Returns NaN for anything that is not a plain positive decimal (comma allowed).
export function parseNumber(value, decimals = 2, max = 99999) {
  const raw = String(value ?? '').trim();
  if (!new RegExp(`^\\d{1,6}(?:[.,]\\d{1,${decimals}})?$`).test(raw)) return NaN;
  const n = Number(raw.replace(',', '.'));
  return n > 0 && n <= max ? n : NaN;
}
const fixed = n => n.toFixed(2);
const amountText = n => String(Number(n.toFixed(3)));
export function perLabel(per) { return per ? PER.find(([v]) => v === per)[1] : ''; }
export function sizeText(amount, measure) { return `${amountText(amount)} ${MEASURES.find(([v]) => v === measure)[1]}`; }

// Price per 100 g / 100 ml (or per unit) for packaged goods sold by the item.
export function unitPriceText(price, amount, measure) {
  if (!(price > 0) || !(amount > 0)) return '';
  if (measure === 'units') return amount === 1 ? '' : `${fixed(price / amount)} ₪ ליח׳`;
  const base = measure === 'kg' || measure === 'l' ? amount * 1000 : amount;
  return `${fixed(price / base * 100)} ₪ ל־100 ${measure === 'g' || measure === 'kg' ? 'גרם' : 'מ״ל'}`;
}

// {empty} rows are ignored, {error} rows block only themselves.
export function checkTag(input) {
  const t = cleanTag(input);
  if (!t.name && !t.price) return { empty: true };
  if (!t.name) return { error: 'חסר שם המוצר' };
  const price = parseNumber(t.price);
  if (!t.price) return { error: 'חסר מחיר' };
  if (Number.isNaN(price)) return { error: 'מחיר לא תקין' };
  let amount = null;
  if (t.amount) { amount = parseNumber(t.amount, 3); if (Number.isNaN(amount)) return { error: 'גודל האריזה לא תקין' }; }
  const copies = /^\d{1,2}$/.test(t.copies) ? Number(t.copies) : NaN;
  if (!(copies >= 1 && copies <= MAX_COPIES)) return { error: `מספר עותקים בין 1 ל־${MAX_COPIES}` };
  // Weighed goods (per kg / 100 g) already state their measure; a pack size would mislead.
  const packaged = !['kg', '100g'].includes(t.per) && amount;
  return { tag: { name: t.name, price, per: perLabel(t.per), size: packaged ? sizeText(amount, t.measure) : '', unitPrice: packaged ? unitPriceText(price, amount, t.measure) : '' }, copies };
}

export function priceParts(price) {
  const [shekels, agorot] = price.toFixed(2).split('.');
  return { shekels, agorot: agorot === '00' ? '' : agorot };
}

// Expands copies and splits into pages of the chosen grid.
export function tagPages(tags, sizeId) {
  const size = TAG_SIZES.find(z => z.id === sizeId) || TAG_SIZES.find(z => z.id === '12');
  const per = size.cols * size.rows, flat = [];
  for (const { tag, copies } of tags) for (let i = 0; i < copies; i++) flat.push(tag);
  const pages = [];
  for (let i = 0; i < flat.length; i += per) pages.push(flat.slice(i, i + per));
  if (pages.length > MAX_PAGES) throw new Error(`יותר מ־${MAX_PAGES} דפים — הקטינו את מספר העותקים`);
  return { size, pages };
}

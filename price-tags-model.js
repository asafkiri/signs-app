// Plain shelf price tags: no promotion logic, separate storage from the sign editor.
// Every grid gives tags wider than tall, so they slide into a shelf strip.
export const TAG_SIZES = [
  { id: '4', cols: 1, rows: 4 },
  { id: '6', cols: 1, rows: 6 },
  { id: '8', cols: 2, rows: 4 },
  { id: '10', cols: 2, rows: 5 },
  { id: '12', cols: 2, rows: 6 },
  { id: '16', cols: 2, rows: 8 },
  { id: '24', cols: 3, rows: 8 }
];
export const PER = [['', 'בלי יחידה'], ['unit', 'ליח׳'], ['kg', 'לק״ג'], ['100g', 'ל־100 גרם'], ['pack', 'למארז']];
export const MAX_TAGS = 200, MAX_COPIES = 50, MAX_PAGES = 40;
const enumOf = (list, value, fallback) => list.some(([v]) => v === value) ? value : fallback;
const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function newTag() { return { name: '', price: '', per: '', copies: '1', barcode: '', skip: false }; }
// Pack size fields from older lists (amount, measure) are dropped here.
export function cleanTag(input = {}) {
  const t = input && typeof input === 'object' ? input : {};
  return { name: text(t.name, 60), price: text(t.price, 10), per: enumOf(PER, t.per, ''), copies: text(t.copies, 3) || '1', barcode: text(t.barcode, 32), skip: t.skip === true };
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
export function perLabel(per) { return per ? PER.find(([v]) => v === per)[1] : ''; }

// {empty} rows are ignored, {error} rows block only themselves.
export function checkTag(input) {
  const t = cleanTag(input);
  if (!t.name && !t.price) return { empty: true };
  if (!t.name) return { error: 'חסר שם המוצר' };
  const price = parseNumber(t.price);
  if (!t.price) return { error: 'חסר מחיר' };
  if (Number.isNaN(price)) return { error: 'מחיר לא תקין' };
  const copies = /^\d{1,2}$/.test(t.copies) ? Number(t.copies) : NaN;
  if (!(copies >= 1 && copies <= MAX_COPIES)) return { error: `מספר עותקים בין 1 ל־${MAX_COPIES}` };
  if (t.barcode && !/^[\x20-\x7e]{1,32}$/.test(t.barcode)) return { error: 'ברקוד לא תקין — עד 32 תווים ללא עברית' };
  return { tag: { name: t.name, price, per: perLabel(t.per), barcode: t.barcode }, copies };
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { TAG_SIZES, cleanState, checkTag, parseNumber, priceParts, tagPages, newTag, MAX_PAGES } from '../price-tags-model.js';
const tag = o => checkTag({ ...newTag(), name: 'במבה', price: '4.5', ...o });
test('empty rows are ignored, partial rows report what is missing', () => {
  assert.deepEqual(checkTag(newTag()), { empty: true });
  assert.equal(checkTag({ ...newTag(), price: '5' }).error, 'חסר שם המוצר');
  assert.equal(checkTag({ ...newTag(), name: 'חלב' }).error, 'חסר מחיר');
  for (const price of ['0', '-1', '1.234', 'abc', '1e2']) assert.equal(tag({ price }).error, 'מחיר לא תקין');
  for (const copies of ['0', '51', '1.5']) assert.ok(tag({ copies }).error);
});
test('comma decimals and agorot split', () => {
  assert.equal(parseNumber('12,90'), 12.9);
  assert.deepEqual(priceParts(12.9), { shekels: '12', agorot: '90' });
  assert.deepEqual(priceParts(8), { shekels: '8', agorot: '' });
});
test('tags carry the unit label and no pack size, even from older lists', () => {
  assert.deepEqual(tag({ per: 'unit', amount: 'abc', measure: 'g' }), { tag: { name: 'במבה', price: 4.5, per: 'ליח׳', barcode: '' }, copies: 1 });
  assert.equal(tag({ per: 'kg' }).tag.per, 'לק״ג');
  const old = cleanState({ tags: [{ name: 'במבה', price: '4.5', amount: '80', measure: 'g' }] }).tags[0];
  assert.equal('amount' in old, false); assert.equal('measure' in old, false);
});
test('copies expand and fill pages of the chosen grid', () => {
  const { size, pages } = tagPages([tag({ copies: '3' }), tag({})], '10');
  assert.deepEqual([size.cols, size.rows], [2, 5]); assert.ok(TAG_SIZES.every(z => (198 / z.cols) > (285 / z.rows)), 'every tag is wider than tall'); assert.equal(pages.length, 1); assert.equal(pages[0].length, 4);
  assert.equal(tagPages(Array(25).fill(tag({})), '24').pages.length, 2);
  assert.throws(() => tagPages(Array(MAX_PAGES * 4 + 1).fill(tag({})), '4'));
});
test('stored state never trusts unknown values', () => {
  const s = cleanState({ size: '999', style: 'neon', tags: [{ name: 'x'.repeat(200), per: 'evil', skip: 'yes' }] });
  assert.equal(s.size, '12'); assert.equal('style' in s, false); assert.equal(s.tags[0].name.length, 60); assert.equal(s.tags[0].per, ''); assert.equal(s.tags[0].skip, false);
  assert.equal(cleanState(null).tags.length, 1);
});
test('barcode is optional, kept as typed, Hebrew rejected', () => {
  assert.equal(tag({}).tag.barcode, '');
  assert.equal(tag({ barcode: '0072900000123' }).tag.barcode, '0072900000123');
  assert.ok(tag({ barcode: 'ברקוד' }).error);
  assert.equal(cleanState({ tags: [{ name: 'x' }] }).tags[0].barcode, '');
});

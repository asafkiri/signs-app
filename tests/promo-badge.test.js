import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, cleanDraft, buildSign, previewSign } from '../model.js';
import { findPromoBadge } from '../promo-badge.js';
test('sale badge is optional and only accepts a real boolean across save/preview/export', () => {
  assert.equal(newDraft().promoBadge, false);
  for (const value of [undefined, null, 'true', 'false', 1]) assert.equal(cleanDraft({promoBadge:value}).promoBadge, false);
  const draft = { ...newDraft(), title: 'מוצר', price: '9.9', promoBadge: true };
  for (const convert of [cleanDraft, buildSign, previewSign]) assert.equal(convert(JSON.parse(JSON.stringify(draft))).promoBadge, true);
});
test('sale badge never uses a fully occupied slot or unsafe store tag', () => {
  const slot = {x:40,y:40,w:1160,h:400};
  assert.equal(findPromoBadge(slot,[slot],{x:900,y:54,w:240,h:60}).mode,'omitted');
  assert.equal(findPromoBadge(slot,[slot],{x:900,y:20,w:240,h:60}).mode,'omitted');
  assert.equal(findPromoBadge(slot,[{...slot,store:true}],{x:900,y:54,w:240,h:60}).mode,'header');
  assert.equal(findPromoBadge(slot,[],null).mode,'circle');
});

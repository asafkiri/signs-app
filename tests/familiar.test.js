import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, cleanDraft, recommend, actualProfit, buildSign } from '../model.js';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7);
const sign = overrides => buildSign({...newDraft(), title:'לחמניות עשרייה ברמן', price:'12.9', ...overrides});

import { shopRound, previewSign, offerText } from '../model.js';
import { indoorSign } from '../indoor.js';
test('new drafts select source-verified Yotvata markup and shop rounding',()=>{ const d=newDraft();assert.equal(d.profitMode,'markup');assert.equal(d.rounding,'shop');close(recommend(10,18,25,1,'shop','markup').total,14.9);close(recommend(10,18,25,4,'shop','markup').total,58.9);});
test('Yotvata shop rounding boundary and minimum',()=>{close(shopRound(13.2),12.9);close(shopRound(13.21),13.9);close(shopRound(13.3),13.9);close(shopRound(.01),.9);assert.throws(()=>shopRound(Infinity));});
test('v1 drafts keep margin mode, entered price and exact rounding',()=>{const old={...newDraft(),price:'31.47',rounding:'exact'};delete old.profitMode;const d=cleanDraft(old);assert.equal(d.profitMode,'margin');assert.equal(d.price,'31.47');assert.equal(d.rounding,'exact');close(recommend(10,18,25,2,d.rounding,d.profitMode).total,31.47);});
test('actual markup and actual margin are clearly distinct',()=>{const r=actualProfit({cost:'10',vat:'18',price:'14.75',kind:'unit'});close(r.markup,25);close(r.margin,20);close(r.profit,2.5);});
test('percentage mode validates and exports a percent without a fake price',()=>{const s=sign({kind:'pct',pct:'20',price:''});assert.equal(s.pct,20);assert.equal(s.price,null);assert.equal(offerText(s),'20% הנחה');for(const pct of ['','0','-1','101','20bad'])assert.throws(()=>sign({kind:'pct',pct}));});
test('incomplete preview keeps the actual title and blank price',()=>{const s=previewSign({...newDraft(),title:'פיוז טי'});assert.equal(s.title,'פיוז טי');assert.equal(s.price,0);assert.equal(s.subtitle,'');assert.equal('cost'in s,false);assert.throws(()=>buildSign({...newDraft(),title:'פיוז טי'}));});
test('indoor adapter retains original expiry and barcode semantics',()=>{const s=indoorSign(sign({end:'2026-10-31',oldPrice:'17.9',barcodes:['0012345678']}));assert.equal(s.validUntil,'31.10.2026');assert.equal(s.oldPrice,17.9);assert.deepEqual(s.barcodes,['0012345678']);});
test('bundle old-price comparison uses the same number of units',()=>{const s=indoorSign(sign({kind:'bundle',quantity:'4',price:'35',oldPrice:'9.9'}));close(s.oldPrice,39.6);});

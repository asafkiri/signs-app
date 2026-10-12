import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,cleanDraft,buildSign,previewSign} from '../model.js';
import {indoorSign} from '../indoor.js';

test('legacy start dates are ignored without reinterpreting them as end dates',()=>{
  for(const type of ['indoor','outdoor']) for(const start of ['2026-12-31','invalid']) for(const end of ['', '2026-10-12']){
    const legacy={...newDraft(),title:'קוקה קולה',price:'10',note:'לא כולל משהו',type,start,end};
    for(const value of [cleanDraft(legacy),buildSign(legacy),previewSign(legacy)]){
      assert.equal('start' in value,false);assert.equal(value.end,end);assert.equal(value.note,legacy.note);
    }
    assert.equal(indoorSign(legacy).note,legacy.note);
    assert.equal(indoorSign(legacy).validUntil,end?'12.10.2026':'');
  }
});

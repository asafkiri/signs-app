import path from 'node:path';

export async function checkClearAll({page,name,out,ok,eq,load}) {
  await page.setViewportSize({width:390,height:844});
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('signs-app:v1:workspace')));
  const library=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('signs-app:v1:item:')).sort().map(k=>[k,localStorage.getItem(k)]));
  const field=k=>page.locator('#cards>.card').first().locator(`[data-field=${k}]`);
  let dialogs=0;const countDialog=()=>dialogs++;page.on('dialog',countDialog);
  for(const [type,count] of [['indoor',1],['indoor',3],['indoor',30],['outdoor',3]]){
    await page.evaluate(async({type,count})=>{
      const {newDraft}=await import('./model.js');
      const entries=Array.from({length:count},(_,i)=>({savedId:i===0?'clear-test-kept':null,draft:{...newDraft(),type,store:'החנות שלי',vat:'17',title:`שלט ${i+1}`,kind:'bundle',quantity:'3',price:'10',oldPrice:'5',end:'2026-12-31',note:'הערה לבדיקה',barcodes:['7290110115203'],promoBadge:true}}));
      localStorage.removeItem('signs-app:v1:clear-undo');
      localStorage.setItem('signs-app:v1:item:clear-test-kept',JSON.stringify({id:'clear-test-kept',updatedAt:1,draft:entries[0].draft}));
      localStorage.setItem('signs-app:v1:workspace',JSON.stringify({version:2,layout:'3',type,entries}));
    },{type,count});await load();
    const before=await state(),savedBefore=await library(),dialogBefore=dialogs;
    if(name==='chromium'&&type==='indoor'&&count===3)await page.screenshot({path:path.join(out,'clear-all-before.png')});
    await page.locator('#clear-all-signs').click();
    eq(dialogs,dialogBefore);eq(await page.locator('#cards>.card').count(),1);eq(await field('title').inputValue(),'');eq(await field('price').inputValue(),'');eq(await field('end').inputValue(),'');eq(await field('note').inputValue(),'');
    const cleared=await state();eq(cleared.layout,'3');eq(cleared.type,type);eq(cleared.entries[0].savedId,null);eq(cleared.entries[0].draft.store,'החנות שלי');eq(cleared.entries[0].draft.vat,'17');eq(cleared.entries[0].draft.barcodes,[]);eq(cleared.entries[0].draft.promoBadge,false);
    eq(await library(),savedBefore);eq(await page.locator('#signPages canvas').count(),1);ok(await page.locator('#undo-clear').isVisible());ok(await page.locator('#clear-all-signs').isDisabled());
    if(name==='chromium'&&type==='indoor'&&count===3)await page.screenshot({path:path.join(out,'clear-all-after.png')});
    await page.locator('#share-images').click();ok(await page.locator('#form-error').isVisible(),'cleared workspace cannot export stale signs');
    await load();eq(await field('title').inputValue(),'');ok(await page.locator('#undo-clear').isVisible());
    await page.locator('#undo-clear').click();eq(await state(),before);eq(await library(),savedBefore);eq(await page.locator('#cards>.card').count(),count);
    await page.locator('#clear-all-signs').click();await field('title').fill('שלט חדש אחרי ניקוי');ok(await page.locator('#clear-undo').isHidden());
    await load();eq(await field('title').inputValue(),'שלט חדש אחרי ניקוי');ok(await page.locator('#clear-undo').isHidden());eq(await library(),savedBefore);
  }
  await page.locator('#clear-all-signs').click();await page.locator('#new-sign').click();ok(await page.locator('#clear-undo').isHidden());eq(await page.locator('#cards>.card').count(),2);
  for(const width of [320,390,430,1440]){await page.setViewportSize({width,height:844});eq(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);ok(await page.locator('#clear-all-signs').isVisible());}
  page.off('dialog',countDialog);
}

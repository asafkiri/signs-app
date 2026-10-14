import path from 'node:path';

export async function checkPrintSelection({page,name,out,ok,eq,load}) {
  await page.setViewportSize({width:390,height:844});
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('signs-app:v1:workspace')));
  const cards=page.locator('#cards>.card'),toggle=i=>cards.nth(i).locator('[data-print]');
  const pngs=()=>page.locator('#signPages canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL('image/png')));
  // The open page re-saves its workspace ~100ms after a re-render (template previews); let that settle before seeding.
  const seed=async(type,layout,titles,extra={})=>{await page.waitForTimeout(400);await page.evaluate(async({type,layout,titles,extra})=>{
    const {newDraft}=await import('./model.js');
    const entries=titles.map((title,i)=>({savedId:null,draft:{...newDraft(),type,store:'מיני מרקט שלום',title,kind:'unit',price:String(5+i),...(extra[i]||{})}}));
    localStorage.removeItem('signs-app:v1:clear-undo');Object.keys(localStorage).filter(k=>k.startsWith('signs-app:v1:item:')).forEach(k=>localStorage.removeItem(k));
    localStorage.setItem('signs-app:v1:workspace',JSON.stringify({version:2,layout,type,entries}));
  },{type,layout,titles,extra});await load();};

  // Outdoor, one sign per page: unchecked signs leave the preview, images, share and PDF.
  await seed('outdoor','4',['לחמניות','לחמניות','אהיו']);
  eq(await page.locator('#signPages canvas').count(),3);ok(await page.locator('#print-summary').isHidden());
  const all=await pngs();
  await toggle(0).uncheck();await page.waitForTimeout(250);
  ok(await cards.nth(0).evaluate(c=>c.classList.contains('skipped')));eq((await state()).entries.map(e=>e.skip),[true,false,false]);
  eq(await page.locator('#signPages canvas').count(),2);eq(await pngs(),all.slice(1));
  ok(await page.locator('#print-summary').isVisible());eq(await page.locator('#print-count').textContent(),'בהדפסה 2 מתוך 3 שלטים');
  await toggle(1).uncheck();await page.waitForTimeout(250);eq(await pngs(),[all[2]]);
  if(name==='chromium')await page.screenshot({path:path.join(out,'print-selection.png'),fullPage:true});
  await page.evaluate(()=>{window.__shared=[];});await page.locator('#share-images').click();await page.waitForFunction(()=>window.__shared.length===1);
  eq((await page.evaluate(()=>window.__shared))[0].url,all[2]);
  await page.locator('#preview-print').click();eq(await page.locator('#page-count').textContent(),'1 דפי A4');eq(await page.locator('#print-pages canvas').count(),1);await page.locator('#close-print').click();

  // The selection survives a reload; none selected blocks export with a clear message.
  await load();eq(await toggle(0).isChecked(),false);eq(await toggle(1).isChecked(),false);eq(await toggle(2).isChecked(),true);eq(await page.locator('#signPages canvas').count(),1);
  const reloaded=await pngs(); // WebKit canvas bytes can differ by a few bytes across page loads; compare within this load there.
  await toggle(2).uncheck();await page.waitForTimeout(250);eq(await page.locator('#signPages canvas').count(),0);eq(await page.locator('#print-count').textContent(),'לא סומן אף שלט להדפסה');
  await page.evaluate(()=>{window.__shared=[];});await page.locator('#share-images').click();ok((await page.locator('#form-error').textContent()).includes('לא סומן אף שלט'));eq(await page.evaluate(()=>window.__shared.length),0);
  await page.locator('#print-all').click();eq(await page.locator('#signPages canvas').count(),3);eq((await pngs())[2],reloaded[0]);if(name==='chromium')eq(await pngs(),all);ok(await page.locator('#print-summary').isHidden());eq(await page.evaluate(()=>document.activeElement.id),'preview-print');eq((await state()).entries.map(e=>e.skip),[false,false,false]);

  // Indoor, 4 per page: pages are re-packed from the checked signs only, and an unchecked incomplete sign never blocks export.
  // Saving to the list is unchanged: it validates and saves every edited sign, checked or not.
  await seed('indoor','4',['א','ב','ג','ד','ה'],{0:{barcodes:['7290110115203']},1:{price:''}});
  eq(await page.locator('#signPages canvas').count(),2);
  await page.locator('#share-images').click();ok(await page.locator('#form-error').isVisible(),'incomplete checked sign blocks export');
  await toggle(1).uncheck();await page.waitForTimeout(250);eq(await page.locator('#signPages canvas').count(),1);
  await page.evaluate(()=>{window.__shared=[];});await page.locator('#share-images').click();await page.waitForFunction(()=>window.__shared.length===1);ok(await page.locator('#form-error').isHidden());
  await page.locator('#save-sign').click();ok((await page.locator('#form-error').textContent()).startsWith('שלט 2:'));eq(await page.locator('#library-count').textContent(),'0');
  await cards.nth(1).locator('[data-field=price]').fill('9');await page.locator('#save-sign').click();eq(await page.locator('#library-count').textContent(),'5');
  eq((await state()).entries.map(e=>e.savedId===null),[false,false,false,false,false]);eq(await toggle(1).isChecked(),false);

  // Clearing and undoing keeps the selection.
  await page.locator('#clear-all-signs').click();eq(await toggle(0).isChecked(),true);ok(await page.locator('#print-summary').isHidden());
  await page.locator('#undo-clear').click();eq(await toggle(1).isChecked(),false);eq(await cards.count(),5);

  // Narrow phones: a store sign with barcodes keeps its label and copy/delete on one row; the toggles get their own row.
  for(const width of [320,360,375,390,430]){await page.setViewportSize({width,height:844});eq(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const top=cards.nth(0).locator('.card-top'),box=await top.boundingBox(),copy=await top.locator('[data-action=copy]').boundingBox(),del=await top.locator('[data-action=remove]').boundingBox();
    ok(Math.abs(copy.y-del.y)<2,'delete stays beside copy');ok(box.height<(width>400?30:50),'card header stays compact');}
  await page.setViewportSize({width:390,height:844});
}

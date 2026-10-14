import path from 'node:path';

// window.print() output: every printed sheet is portrait A4 starting at the top of its own page.
// Landscape pages (outdoor signs, "1 בדף") are printed turned, so browsers that ignore landscape
// pages (Android Chrome / Samsung Internet) cannot cut them; the on-screen dialog is unchanged.
export async function checkPrintLayout({page,name,out,ok,eq,load}) {
  await page.setViewportSize({width:390,height:844});
  const cases=[['outdoor','4',3,false],['indoor','1',1,false],['indoor','4',5,false],['outdoor','4',1,true]];
  for(const [type,layout,count,codes] of cases){
    await page.waitForTimeout(400);
    await page.evaluate(async({type,layout,count,codes})=>{
      const {newDraft}=await import('./model.js');
      localStorage.removeItem('signs-app:v1:clear-undo');
      localStorage.setItem('signs-app:v1:workspace',JSON.stringify({version:2,layout,type,entries:Array.from({length:count},(_,i)=>({savedId:null,draft:{...newDraft(),type,title:`שלט ${i+1}`,kind:'unit',price:String(10+i),barcodes:codes?['7290110115203']:[],withBarcodes:codes}}))}));
    },{type,layout,count,codes});await load();
    const sources=await page.locator('#signPages canvas').evaluateAll(cs=>cs.map(c=>({w:c.width,h:c.height,url:c.toDataURL('image/png')})));
    await page.locator('#preview-print').click();
    // On screen: one upright copy per page, exactly as before.
    eq(await page.locator('#print-pages .print-sheet').count(),sources.length);
    eq(await page.locator('#print-pages canvas:visible').evaluateAll(cs=>cs.map(c=>c.toDataURL('image/png'))),sources.map(s=>s.url));
    // Turned copies are the source rotated 90° clockwise, pixel for pixel.
    const turned=await page.locator('#print-pages .print-turned').evaluateAll(cs=>cs.map(c=>{const back=document.createElement('canvas');back.width=c.height;back.height=c.width;const x=back.getContext('2d');x.translate(0,back.height);x.rotate(-Math.PI/2);x.drawImage(c,0,0);return back.toDataURL('image/png');}));
    eq(turned,sources.filter(s=>s.w>s.h).map(s=>s.url));
    await page.emulateMedia({media:'print'});
    const sheets=await page.locator('#print-pages .print-sheet').evaluateAll(els=>{const mm=96/25.4,top=els[0].getBoundingClientRect().top;return els.map((el,i)=>{const r=el.getBoundingClientRect(),shown=[...el.querySelectorAll('canvas')].filter(c=>getComputedStyle(c).display!=='none');const c=shown[0]?.getBoundingClientRect();return {n:shown.length,portrait:shown[0]?.height>shown[0]?.width,w:Math.round(r.width/mm),h:Math.round(r.height/mm),top:Math.round((r.top-top)/mm),cw:Math.round(c.width/mm),ch:Math.round(c.height/mm),i};});});
    for(const s of sheets){eq(s.n,1);ok(s.portrait,'printed sheet is portrait');eq([s.w,s.h,s.cw,s.ch],[210,297,210,297]);eq(s.top,s.i*297);}
    eq(await page.locator('#print-dialog').evaluate(d=>Math.round(d.getBoundingClientRect().top+scrollY)),0);
    if(name==='chromium'){
      const pdf=(await page.pdf({preferCSSPageSize:true})).toString('latin1');
      eq((pdf.match(/\/Type\s*\/Page[^s]/g)||[]).length,sources.length);
      const boxes=[...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/g)].map(m=>Number(m[1])<Number(m[2]));ok(boxes.length&&boxes.every(Boolean),'every printed page is portrait A4');
      if(type==='outdoor'&&count===3)await page.screenshot({path:path.join(out,'print-outdoor-turned.png'),fullPage:true});
    }
    await page.emulateMedia({media:'screen'});await page.locator('#close-print').click();
  }
}

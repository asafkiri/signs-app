import fs from 'node:fs';
import path from 'node:path';

// Exercise the actual editor/export paths, and keep full print-resolution review images.
export async function checkOutdoor({page,name,out,ok,eq,load}) {
  const card=()=>page.locator('#cards>.card').first(),field=k=>card().locator(`[data-field="${k}"]`),preview=()=>page.locator('#signPages canvas').first();
  const templates=['frame','banner','burst','split','ticket','bold','elegant'];
  const settle=()=>page.waitForFunction(()=>{const c=document.querySelector('#signPages canvas');return c&&c.__lastOutdoorPaint>=(window.__outdoorInputAt||0)&&performance.now()-c.__lastOutdoorPaint>180;});
  await page.evaluate(()=>{
    window.__outdoorDraws=[];window.__outdoorInputAt=0;document.addEventListener('input',()=>{window.__outdoorInputAt=performance.now();},true);window.__originalFillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
      this.canvas.__lastOutdoorPaint=performance.now();const m=this.measureText(text),t=this.getTransform();
      const points=[[x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent],[x+m.actualBoundingBoxRight,y-m.actualBoundingBoxAscent],[x-m.actualBoundingBoxLeft,y+m.actualBoundingBoxDescent],[x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent]].map(([xx,yy])=>new DOMPoint(xx,yy).matrixTransform(t));
      window.__outdoorDraws.push({canvas:this.canvas,text:String(text),font:this.font,points:points.map(p=>({x:p.x,y:p.y}))});
      return window.__originalFillText.call(this,text,x,y,...rest);
    };
  });
  const drawn=()=>page.evaluate(()=>{const c=document.querySelector('#signPages canvas');return window.__outdoorDraws.filter(d=>d.canvas===c).map(({text,font,points})=>({text,font,points}));});
  const resetLog=()=>page.evaluate(()=>{window.__outdoorDraws=[];});
  const capture=async label=>{
    const data=await page.evaluate(()=>document.querySelector('#signPages canvas').toDataURL('image/png'));
    fs.writeFileSync(path.join(out,`${name}-${label}.png`),Buffer.from(data.split(',')[1],'base64'));
    if(name==='chromium')await preview().screenshot({path:path.join(out,`${label}-preview.png`)});
    return data;
  };
  await page.locator('[data-type=outdoor]').click();
  await card().locator('[data-detail=extras]').evaluate(e=>{e.open=true;});
  await card().locator('[data-kind=unit]').click();
  for(const k of ['title','subtitle','price','note','oldPrice','start','end'])await field(k).fill('');
  await resetLog();await field('store').fill('מיני מרקט שלום');await settle();
  const blankThumbs=await page.locator('.template-option canvas').evaluateAll(cs=>cs.map(c=>({size:[c.width,c.height],text:window.__outdoorDraws.filter(d=>d.canvas===c).map(d=>d.text).join(' ')})));
  eq(blankThumbs.length,7);
  for(const thumb of blankThumbs){ok(thumb.text.includes('לחמניות')&&thumb.text.includes('ברמן'),'empty-form thumbnail must display real sample product');ok(thumb.text.includes('12')&&thumb.text.includes('90'),'empty-form thumbnail must display sample price');}
  ok(!(await drawn()).some(d=>d.text.includes('לחמניות')),'sample thumbnail content must not leak into real sign');
  if(name==='chromium')await page.locator('.template-grid').screenshot({path:path.join(out,'outdoor-empty-thumbnails.png')});
  await field('title').fill('לחמניות עשירייה');await field('subtitle').fill('ברמן');await field('price').fill('12.90');await field('banner').fill('מבצע!');
  const samePNG=async(actual,expected,label,reload=false)=>{
    if(actual===expected){eq(actual,expected);return;}
    fs.writeFileSync(path.join(out,`${name}-${label}-actual.png`),Buffer.from(actual.split(',')[1],'base64'));
    fs.writeFileSync(path.join(out,`${name}-${label}-expected.png`),Buffer.from(expected.split(',')[1],'base64'));
    const same=await page.evaluate(async([a,b,reload])=>{const pixels=async url=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};const [x,y]=await Promise.all([pixels(a),pixels(b)]);if(x.length!==y.length)return false;let changed=0;for(let i=0;i<x.length;i+=4){let delta=0;for(let k=0;k<4;k++)delta=Math.max(delta,Math.abs(x[i+k]-y[i+k]));if(delta>(reload?1:0))return false;if(delta&&++changed>(reload?100:0))return false;}return true;},[actual,expected,reload]);
    ok(same,`${name} ${label}: decoded canvas pixels must match (PNG encoding may differ)`);
  };
  const samples=new Set();
  for(const template of templates){
    await resetLog();await page.locator(`[data-template=${template}]`).click();await settle();
    eq(await page.evaluate(()=>{const c=document.querySelector('#signPages canvas');return[c.width,c.height];}),[1754,1240]);
    eq(await page.locator(`[data-template=${template}]`).getAttribute('aria-pressed'),'true');
    const calls=await drawn(),text=calls.map(d=>d.text).join(' ');
    ok(text.includes('לחמניות עשירייה')&&text.includes('ברמן'),`${template}: complete product and subtitle`);
    ok(text.includes('12')&&text.includes('.90')&&text.includes('₪'),`${template}: full unit amount and currency`);
    for(const claim of ['טריות','איכות במחיר','מחירים טובים','רק השבוע','קופון מבצע','שווה לכם','טרי כל יום'])ok(!text.includes(claim),`${template}: no invented claim ${claim}`);
    for(const call of calls)for(const point of call.points)ok(point.x>=38&&point.x<=1716&&point.y>=38&&point.y<=1202,`${template}: ${call.text} inside A4 safe area`);
    const png=await capture(`template-${template}`);samples.add(png);
    // Share is byte-identical to the preview; print copies the very same raster.
    await page.evaluate(()=>{window.__shared=[];});await page.locator('#share-images').click();await page.waitForFunction(()=>window.__shared.length===1);
    await samePNG(await page.evaluate(()=>window.__shared[0].url),png,`share-${template}`);
    await page.locator('#preview-print').click();eq(await page.locator('.print-sheet').count(),1);ok(await page.locator('.print-sheet').evaluate(e=>e.classList.contains('landscape')));
    await samePNG(await page.evaluate(()=>document.querySelector('.print-sheet canvas').toDataURL('image/png')),png,`print-${template}`);
    const jpeg=await page.evaluate(()=>document.querySelector('#signPages canvas').toDataURL('image/jpeg',.96));
    const downloadPromise=page.waitForEvent('download');await page.locator('#download-pdf').click();const pdfPath=path.join(out,`${name}-outdoor-${template}.pdf`);await(await downloadPromise).saveAs(pdfPath);
    const pdf=fs.readFileSync(pdfPath);ok(pdf.includes(Buffer.from('/MediaBox [0 0 841.89 595.28]')),`${template}: PDF must be A4 landscape`);
    ok(pdf.includes(Buffer.from('/Width 1754 /Height 1240')),`${template}: PDF retains print resolution`);
    ok(pdf.includes(Buffer.from(jpeg.split(',')[1],'base64')),`${template}: PDF embeds exact preview JPEG without rerendering`);
    await page.emulateMedia({media:'print'});const sheet=await page.locator('.print-sheet').boundingBox();ok(sheet.width>sheet.height,'native print page remains landscape');await page.emulateMedia({media:'screen'});
    await page.evaluate(()=>{window.__printed=false;window.print=()=>{window.__printed=true;};});await page.locator('#native-print').click();ok(await page.evaluate(()=>window.__printed),'native print action works');await page.locator('#close-print').click();
  }
  eq(samples.size,7);
  for(const template of templates){
    await page.locator(`[data-template=${template}]`).click();
    for(const title of ['מים','לחמניות עשירייה ברמן','מארז משפחתי גדול במיוחד של לחמניות עשירייה מקמח מלא ברמן במבחר סוגים וטעמים']){
      await resetLog();await field('title').fill(title);await settle();const calls=await drawn(),joined=calls.map(d=>d.text).join(' ');
      ok(title.split(' ').every(w=>joined.includes(w)),`${name} ${template}: product ${title} keeps every word; drawn: ${joined}`);
      ok(!joined.includes('…'),`${template}: product is never truncated with ellipsis`);
      for(const call of calls)for(const point of call.points)ok(point.x>=38&&point.x<=1716&&point.y>=38&&point.y<=1202,`${template}: long/short label inside printable safe area`);
      if(title==='מים'){const size=Number(calls.find(d=>d.text==='מים')?.font.match(/([\d.]+)px/)?.[1]);ok(size>=100||template==='bold',`${template}: short product uses available space before shrinking`);}
      if(title.length>60)await capture(`long-title-${template}`);
    }
  }
  await field('title').fill('קוקה קולה / זירו');await field('subtitle').fill('1.5 ליטר');await field('note').fill('ניתן לערבב בין המוצרים');await field('banner').fill('מבצע החודש!');await card().locator('[data-kind=bundle]').click();
  for(const [quantity,amount] of [['4','35'],['2','18']]){
    await field('quantity').fill(quantity);await field('price').fill(amount);
    for(const template of templates){await resetLog();await page.locator(`[data-template=${template}]`).click();await settle();const text=(await drawn()).map(d=>d.text).join(' ');for(const piece of [quantity,amount,'ב־','₪','ניתן לערבב בין המוצרים'])ok(text.includes(piece),`${template}: quantity offer ${quantity}/${amount} includes ${piece}`);if(quantity==='4')await capture(`coke-4-for-35-${template}`);}
  }
  const longSubtitle='מארז משפחתי גדול במיוחד במבחר סוגים וטעמים לכל המשפחה וחברים';
  await field('subtitle').fill(longSubtitle);
  for(const template of templates){await resetLog();await page.locator(`[data-template=${template}]`).click();await settle();const calls=await drawn(),text=calls.map(d=>d.text).join(' ');ok(longSubtitle.split(' ').every(w=>text.includes(w)),`${name} ${template}: every long subtitle word is drawn`);for(const call of calls)for(const point of call.points)ok(point.x>=38&&point.x<=1716&&point.y>=38&&point.y<=1202,`${template}: long subtitle safe area`);await capture(`long-subtitle-${template}`);}
  // Optional long fields and user-supplied dates are drawn, without clipping or invented deadlines.
  await field('note').fill('ניתן לערבב בין המוצרים בהתאם למוצרים המפורטים בשלט');await field('start').fill('2026-10-01');await field('end').fill('2026-10-31');await field('oldPrice').fill('12');
  for(const template of templates){await resetLog();await page.locator(`[data-template=${template}]`).click();await settle();const text=(await drawn()).map(d=>d.text).join(' ');ok(text.includes('01.10.2026')&&text.includes('31.10.2026'),`${template}: user validity appears`);ok(text.includes('12.00'),`${template}: user old price appears`);}
  await page.locator('#save-sign').click();const draftBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('signs-app:v1:workspace')).entries.map(e=>e.draft));const before=await page.evaluate(()=>document.querySelector('#signPages canvas').toDataURL());fs.writeFileSync(path.join(out,`${name}-before-reload.png`),Buffer.from(before.split(',')[1],'base64'));await load();eq(await page.locator('[data-type=outdoor]').getAttribute('aria-pressed'),'true');eq(await page.locator('[data-template=elegant]').getAttribute('aria-pressed'),'true');eq(await field('quantity').inputValue(),'2');eq(await field('price').inputValue(),'18');eq(await page.evaluate(()=>JSON.parse(localStorage.getItem('signs-app:v1:workspace')).entries.map(e=>e.draft)),draftBefore);const after=await page.evaluate(()=>document.querySelector('#signPages canvas').toDataURL());fs.writeFileSync(path.join(out,`${name}-after-reload.png`),Buffer.from(after.split(',')[1],'base64'));// WebKit can round fewer than100 antialiased pixels by one level across reloads.
  // Exports within a session above still require exact pixels.
  await samePNG(after,before,'reload',true);
}

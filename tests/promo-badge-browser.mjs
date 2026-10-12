import fs from 'node:fs';
import path from 'node:path';

export async function checkPromoBadge({page,name,out,ok,eq,load}) {
  const audit = await page.evaluate(async () => {
    const { renderPage } = await import('./familiar-render.js');
    const { drawSignSlot, indoorSign } = await import('./indoor.js');
    const { newDraft, buildSign } = await import('./model.js');
    const base = {...newDraft(),title:'סניקרס / מרס / באונטי / טוויקס',kind:'bundle',quantity:'3',price:'10',oldPrice:'4',end:'2026-12-31'};
    const titles = ['מים',base.title,'מארז משפחתי גדול במיוחד במבחר טעמים ללא תוספת סוכר כשר לפסח', 'מוצרללאמרווחים'.repeat(5)];
    const variants = [
      {title:titles[0],kind:'unit',price:'9.90',oldPrice:'12.9',quantity:'2'},
      {},
      {title:titles[2],note:'ניתן לערבב בין המוצרים; לא כולל מארזים מיוחדים',start:'2026-10-01',barcodes:Array.from({length:12},(_,i)=>String(7290110115200+i))},
      {title:titles[3],note:'הערה ארוכה במיוחד לצורך בדיקה '.repeat(3).trim(),barcodes:Array.from({length:24},(_,i)=>`LONG-CODE-${i}-012345678901234567`),store:'שם חנות ארוך במיוחד לבדיקת הצפיפות'},
      {title:titles[2],kind:'free',free:'השני בחצי מחיר במבחר מוצרים מסומנים',price:'',oldPrice:''},
      {title:titles[2],kind:'pct',pct:'25',price:'',oldPrice:''},
      {title:'',price:'',oldPrice:'',end:'',store:''},
      {title:'מארז',kind:'bundle',quantity:'99',price:'999999.99',oldPrice:'999999.99',note:'הערה'.repeat(24),store:''},
      {title:'כוסות לשתייה חמה שקד',quantity:'2',price:'10',oldPrice:'5.9',end:''},
      {title:'כוסות לשתייה קרה שקד',end:'',store:'א'}
    ];
    // Add deterministic combinations of long labels, dates, prices and barcode loads.
    for(let i=0;i<30;i++) variants.push({title:titles[i%4],kind:i%3?'bundle':'unit',quantity:String(2+i%8),price:i%2?'19.90':'10',oldPrice:'29.9',note:i%2?'ניתן לערבב בין המוצרים במבחר טעמים':'',start:i%3?'2026-10-01':'',end:i%4?'2026-12-31':'',store:i%5?'מיני מרקט שלום':'',barcodes:Array.from({length:[0,1,6,12,24][i%5]},(_,j)=>String(7290110115200+j))});
    const proto=CanvasRenderingContext2D.prototype, original=proto.fillText;
    let calls=null;
    proto.fillText=function(text,x,y,...rest){
      if(calls){const m=this.measureText(text);calls.push({text:String(text),font:this.font,x,y,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});}
      return original.call(this,text,x,y,...rest);
    };
    const results=[],images=[];
    const size={ '4':400,'3':542,'2small':825,'2':825,'1':1160 };
    try {
      for(const layout of ['4','3','2small','2','1']) for(let v=0;v<variants.length;v++) {
        const s=indoorSign({...base,...variants[v]});
        const w=layout==='1'?1754:1240,h=layout==='1'?1240:1754,slotH=size[layout];
        const before=document.createElement('canvas'),after=document.createElement('canvas');
        before.width=after.width=w;before.height=after.height=h;
        const paint=(canvas,badge)=>{const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,w,h);calls=[];const placement=drawSignSlot(c,{...s,promoBadge:badge},40,slotH,w);const labels=calls;calls=null;return {placement,labels};};
        const a=paint(before,false),b=paint(after,true),badge=b.placement;
        const sameText=JSON.stringify(a.labels)===JSON.stringify(b.labels.filter(item=>item.text!=='מבצע'));
        const overlap=(r,t)=>r.x<t.right&&r.x+r.w>t.left&&r.y<t.bottom&&r.y+r.h>t.top;
        const hidden=badge.mode==='omitted';
        const clear=hidden||a.labels.filter(t=>!(badge.mode==='header'&&t.text.startsWith('🛒 '))).every(t=>!overlap(badge,t));
        const aa=before.getContext('2d').getImageData(0,0,w,h).data,bb=after.getContext('2d').getImageData(0,0,w,h).data;
        let changed=0,outside=0;
        for(let p=0;p<aa.length;p+=4) if(aa[p]!==bb[p]||aa[p+1]!==bb[p+1]||aa[p+2]!==bb[p+2]||aa[p+3]!==bb[p+3]) {
          changed++;const x=(p/4)%w,y=Math.floor(p/4/w);
          if(hidden||x<Math.floor(badge.x)-1||x>Math.ceil(badge.x+badge.w)+1||y<Math.floor(badge.y)-1||y>Math.ceil(badge.y+badge.h)+1)outside++;
        }
        results.push({layout,variant:v,mode:badge.mode,sameText,clear,changed,outside,badge});
        if(v<6) images.push({name:`badge-${layout}-${v}`,url:after.toDataURL()});
      }
      // Real page rendering: scaled 2small, multiple slots, and outdoor isolation.
      for(const layout of ['4','3','2small','2','1']) {
        const count=layout==='4'?4:layout==='3'?3:layout==='1'?1:2;
        const sign=buildSign({...newDraft(),title:base.title,kind:'bundle',quantity:'3',price:'10',oldPrice:'4',end:'2026-12-31',promoBadge:true});
        const cv=renderPage({kind:'signs',layout,landscape:layout==='1',signs:Array(count).fill(sign)});
        results.push({layout,page:true,count,badges:cv.promoBadges});
        images.push({name:`badge-full-${layout}`,url:cv.toDataURL()});
      }
      const outdoor=buildSign({...newDraft(),title:'שלט חוץ',price:'9.9',type:'outdoor'});
      results.push({outdoor:true,unchanged:renderPage({kind:'signs',layout:'1',landscape:true,signs:[outdoor]}).toDataURL()===renderPage({kind:'signs',layout:'1',landscape:true,signs:[{...outdoor,promoBadge:true}]}).toDataURL()});
      return {results,images};
    } finally {proto.fillText=original;}
  });
  for(const row of audit.results){
    if(row.outdoor){ok(row.unchanged,'indoor sale badge never changes outdoor signs');continue;}
    if(row.page){eq(row.badges.length,row.count);ok(row.badges.every(b=>b.mode!=='omitted'),`${row.layout}: badge on each sign`);continue;}
    const label=`${name} badge ${row.layout} variant${row.variant}`;
    ok(row.sameText,`${label}: every existing label keeps its exact font, position and bounds`);
    ok(row.clear,`${label}: badge never covers any content (only store tag may be replaced)`);
    eq(row.outside,0);
    ok(row.mode==='omitted'||row.changed>0,`${label}: visible badge painted`);
    ok(row.mode!=='omitted',`${label}: badge available even for stress case`);
  }
  const modes=Object.fromEntries(['circle','header','omitted'].map(mode=>[mode,audit.results.filter(r=>r.mode===mode).length]));
  ok(modes.circle>0&&modes.header>0,'exercise free-space circles and dense-header fallback');
  fs.writeFileSync(path.join(out,`${name}-badge-audit.json`),JSON.stringify({cases:audit.results.length,modes,results:audit.results},null,2));
  if(name==='chromium')for(const item of audit.images)fs.writeFileSync(path.join(out,item.name+'.png'),Buffer.from(item.url.split(',')[1],'base64'));

  // Round-trip user-facing switch, duplication, saved list and exported canvas.
  await page.evaluate(()=>localStorage.removeItem('signs-app:v1:workspace'));await load();
  const card=()=>page.locator('#cards>.card').first();
  const toggle=()=>card().locator('[data-field=promoBadge]');
  eq(await toggle().isChecked(),false);
  await card().locator('[data-field=title]').fill('סניקרס / מרס / באונטי / טוויקס');
  await card().locator('[data-field=price]').fill('10');
  await toggle().check();
  await page.locator('[data-layout="3"]').click();
  await load();eq(await toggle().isChecked(),true);
  await page.locator('#save-sign').click();
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('signs-app:v1:workspace')).entries[0].draft);
  eq(draft.promoBadge,true);
  await page.locator('#open-library').click();
  for(const checkbox of await page.locator('.saved-sign input').all()) await checkbox.uncheck();
  await page.locator('.saved-sign input').first().check();await page.locator('#load-selected').click();
  eq(await toggle().isChecked(),true);
  await card().locator('[data-action=copy]').click();
  eq(await page.locator('[data-field=promoBadge]').evaluateAll(items=>items.map(e=>e.checked)),[true,true]);
  await page.evaluate(()=>{window.__shared=[];});await page.locator('#share-images').click();await page.waitForFunction(()=>window.__shared.length===1);
  eq(await page.evaluate(()=>window.__shared[0].url),await page.locator('#signPages canvas').evaluate(c=>c.toDataURL('image/png')));
  await page.locator('#preview-print').click();
  eq(await page.locator('.print-sheet canvas').evaluate(c=>c.toDataURL()),await page.locator('#signPages canvas').evaluate(c=>c.toDataURL()));
  const downloaded=page.waitForEvent('download');await page.locator('#download-pdf').click();const pdfPath=path.join(out,`${name}-sale-badge.pdf`);await(await downloaded).saveAs(pdfPath);
  const jpg=await page.locator('#signPages canvas').evaluate(c=>c.toDataURL('image/jpeg',.96));ok(fs.readFileSync(pdfPath).includes(Buffer.from(jpg.split(',')[1],'base64')),'PDF uses identical sale-badge raster');
  await page.locator('#close-print').click();
  await toggle().uncheck();await load();eq(await toggle().isChecked(),false);
}

import { chromium, webkit } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { VERSION } from '../model.js';
import { checkOutdoor } from './outdoor-browser.mjs';
const browserNames=['chromium','webkit'].filter(name=>!process.env.SIGNS_TEST_BROWSER||process.env.SIGNS_TEST_BROWSER===name);
const root=process.cwd(),out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const rel=pathname.replace(/^\/signs-app\//,'/');const f=path.join(root,rel==='/'?'index.html':rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(f)]||'text/plain');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4173,'127.0.0.1',r));
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;};const eq=(actual,expected)=>{if(typeof actual==='string'&&actual.startsWith('data:'))assert.ok(actual===expected,'canvas/export bytes must match');else assert.deepEqual(actual,expected);checks++;};
try{
 for(const [name,engine]of [['chromium',chromium],['webkit',webkit]].filter(([name])=>browserNames.includes(name))){
  console.log(`Browser: ${name}`);
  const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},locale:'he-IL',acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{window.__shared=[];window.__cameraCalls=0;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.__shared=await Promise.all(files.map(async f=>({name:f.name,type:f.type,url:await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(f);})})));}});});
  const load=async()=>{await page.goto('http://127.0.0.1:4173/signs-app/');await page.waitForFunction(version=>document.documentElement.dataset.version===version,VERSION);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);};await load();
  const card=()=>page.locator('#cards>.card').first(),field=k=>card().locator(`[data-field="${k}"]`);
  eq(await card().locator('.barcode-details').evaluate(e=>e.open),false);
  eq(await card().locator('.kind-row button').allTextContents(),['מחיר ליח׳','כמות במחיר','% הנחה']);
  eq(await page.locator('#layouts button').allTextContents(),['4 בדף','2 בדף (קטן)','2 בדף (גדול)','1 בדף (רוחב)']);
  eq(await page.locator('#layouts [aria-pressed=true]').textContent(),'4 בדף');
  ok((await page.locator('#signPages').boundingBox()).y<720,'A4 preview must be immediately below compact editor');
  eq(await field('title').inputValue(),'');await page.locator('#share-images').click();ok(await page.locator('#form-error').isVisible());eq(await page.evaluate(()=>window.__shared.length),0);
  await field('title').fill('לחמניות עשרייה ברמן');await field('price').fill('12.90');await page.waitForTimeout(250);
  if(name==='chromium'){await page.screenshot({path:path.join(out,'familiar-mobile.png'),fullPage:true});await page.locator('#signPages canvas').first().screenshot({path:path.join(out,'indoor-four.png')});}
  for(const layout of ['4','2small','2','1']){await page.locator(`[data-layout="${layout}"]`).click();eq(await page.locator('#signPages canvas').first().evaluate(c=>[c.width,c.height]),layout==='1'?[1754,1240]:[1240,1754]);}
  await page.locator('[data-layout="4"]').click();
  await card().locator('[data-entry=calc]').click();await field('cost').fill('10');await page.waitForTimeout(200);await card().locator('[data-action=apply]').click();eq(await field('price').inputValue(),'14.90');
  await card().locator('[data-kind=bundle]').click();await field('quantity').fill('4');await page.waitForTimeout(200);await card().locator('[data-action=apply]').click();eq(await field('price').inputValue(),'58.90');
  await field('price').fill('20');await page.waitForTimeout(200);ok((await card().locator('[data-profit]').textContent()).includes('נמוך'));
  await card().locator('[data-entry=manual]').click();await field('title').fill('קוקה קולה / זירו 1.5 ליטר');await field('price').fill('35');
  await card().locator('.barcode-details summary').click();for(const code of ['7290110115203','0012345678']){await card().locator('[data-code-input]').fill(code);await card().locator('[data-action=add-code]').click();}
  eq(await card().locator('.barcode-item code').allTextContents(),['7290110115203','0012345678']);
  await card().locator('[data-field=withBarcodes]').check();await page.waitForTimeout(300);eq(await page.locator('#signPages canvas').count(),2);
  await page.locator('#share-images').click();await page.waitForFunction(()=>window.__shared.length===2);
  const shared=await page.evaluate(()=>window.__shared);eq(shared.map(s=>s.type),['image/png','image/png']);eq(shared[0].url,await page.locator('#signPages canvas').first().evaluate(c=>c.toDataURL('image/png')));
  await page.locator('#preview-print').click();eq(await page.locator('.print-sheet').count(),2);const downloadPromise=page.waitForEvent('download');await page.locator('#download-pdf').click();await(await downloadPromise).saveAs(path.join(out,`${name}-signs.pdf`));ok(fs.statSync(path.join(out,`${name}-signs.pdf`)).size>10000);await page.locator('#close-print').click();
  await card().locator('[data-field=withBarcodes]').uncheck();await card().locator('.barcode-details summary').click();
  for(let i=1;i<5;i++){await page.locator('#new-sign').click();const c=page.locator('#cards>.card').nth(i);await c.locator('[data-field=title]').fill(`שלט ${i+1}`);await c.locator('[data-field=price]').fill('10');}
  await page.waitForTimeout(250);eq(await page.locator('#cards>.card').count(),5);eq(await page.locator('#signPages canvas').count(),2);
  await page.locator('#save-sign').click();eq(await page.locator('#library-count').textContent(),'5');await load();eq(await page.locator('#cards>.card').count(),5);eq(await field('price').inputValue(),'35');
  await page.locator('#open-library').click();await page.locator('.saved-sign input').last().check();await page.locator('#load-selected').click();eq(await page.locator('#cards>.card').count(),1);
  await card().locator('[data-kind=pct]').click();await field('pct').fill('25');await page.waitForTimeout(150);await page.locator('#preview-print').click();ok(await page.locator('#print-dialog').isVisible());await page.locator('#close-print').click();
  await card().locator('[data-kind=unit]').click();await field('title').fill('לחמניות עשרייה ברמן');await field('price').fill('12.90');
  await page.locator('[data-type=outdoor]').click();eq(await page.locator('.template-option').count(),7);ok(await page.locator('#layouts').isHidden());
  for(const template of ['frame','banner','burst','ticket','elegant','split','bold']){await page.locator(`[data-template=${template}]`).click();await page.waitForTimeout(120);eq(await page.locator(`[data-template=${template}]`).getAttribute('aria-pressed'),'true');if(name==='chromium')await page.locator('#signPages canvas').first().screenshot({path:path.join(out,`template-${template}.png`)});}
  await checkOutdoor({page,name,out,ok,eq,load});
  await page.locator('[data-type=indoor]').click();await field('title').fill('<img src=x onerror=alert(1)>');await page.locator('#save-sign').click();eq(await page.locator('#library-list img').count(),0);
  for(const width of [320,390,430,1440]){await page.setViewportSize({width,height:900});eq(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  if(name==='chromium')await page.screenshot({path:path.join(out,'familiar-desktop.png'),fullPage:true});
  eq(errors,[]);await context.close();
  // Existing v1 storage is read, not overwritten or silently repriced.
  const legacy=await browser.newContext({viewport:{width:390,height:844}});await legacy.addInitScript(()=>{
   const d={title:'שלט שמור ישן',subtitle:'',entry:'calc',kind:'bundle',quantity:'2',price:'31.47',free:'',cost:'10',vat:'18',margin:'25',rounding:'exact',type:'indoor',template:'frame',store:'מינימרקט שלום',banner:'מבצע!',note:'',oldPrice:'',start:'',end:'',barcodes:[],withBarcodes:false};
   localStorage.setItem('signs-app:v1:draft',JSON.stringify(d));localStorage.setItem('signs-app:v1:item:legacy',{toString:()=>JSON.stringify({id:'legacy',draft:d,updatedAt:1})});
  });const lp=await legacy.newPage();await lp.goto('http://127.0.0.1:4173/signs-app/');await lp.waitForFunction(version=>document.documentElement.dataset.version===version,VERSION);eq(await lp.locator('[data-field=price]').inputValue(),'31.47');eq(await lp.locator('#library-count').textContent(),'1');await lp.locator('[data-detail=pricing] summary').click();eq(await lp.locator('[data-field=profitMode]').inputValue(),'margin');eq(await lp.locator('[data-field=rounding]').inputValue(),'exact');await legacy.close();await browser.close();
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checks,status:'passed',browsers:browserNames,version:VERSION},null,2));console.log(`PASS: ${checks} browser assertions (${browserNames.join(' + ')})`);
}finally{server.close();}

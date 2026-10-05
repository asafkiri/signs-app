// Reproducible full-resolution artwork for side-by-side reference review.
import { chromium } from 'playwright';
import { VERSION } from '../model.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4175,'127.0.0.1',r));
try{const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1100}});await page.goto('http://127.0.0.1:4175/index.html');await page.waitForFunction(version=>document.documentElement.dataset.version===version,VERSION);await page.evaluate(()=>document.fonts.ready);
const rendered=await page.evaluate(async()=>{const {renderPage}=await import('./familiar-render.js');const {newDraft,buildSign,pagePlan}=await import('./model.js');const out=[];for(const template of ['frame','banner','burst','split','ticket','bold','elegant']){const s=buildSign({...newDraft(),type:'outdoor',template,title:'לחמניות עשירייה',subtitle:'ברמן',price:'12.90'});const cv=renderPage(pagePlan([s])[0]);out.push({name:'template-'+template,url:cv.toDataURL()});}const s=buildSign({...newDraft(),type:'outdoor',template:'banner',title:'קוקה קולה / זירו',subtitle:'1.5 ליטר',kind:'bundle',quantity:'4',price:'35',note:'ניתן לערבב בין המוצרים',banner:'מבצע החודש!'});out.push({name:'outdoor-coke-4-for-35',url:renderPage(pagePlan([s])[0]).toDataURL()});return out;});for(const r of rendered)fs.writeFileSync(path.join(out,r.name+'.png'),Buffer.from(r.url.split(',')[1],'base64'));await browser.close();console.log('Saved full-resolution artwork to artifacts');}finally{server.close();}

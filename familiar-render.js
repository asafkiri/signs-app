// Indoor pages use the actual Yotvata layout; the existing outdoor designs stay intact.
import { drawOutdoor, renderPage as legacyPage } from './render.js';
import { drawSignSlot, indoorSign } from './indoor.js';
const outdoorSign = s => s.kind === 'pct' ? {...s,kind:'free',free:`${s.pct || ''}% הנחה`,oldPrice:null} : s;
export function renderPage(plan) {
  if (plan.kind === 'barcodes') return legacyPage(plan);
  const canvas=document.createElement('canvas');canvas.width=plan.landscape?1754:1240;canvas.height=plan.landscape?1240:1754;
  const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
  c.save();if(plan.layout==='2small'){c.translate(Math.round(canvas.width*.06),Math.round(canvas.height*.06));c.scale(.88,.88);}
  const count=plan.layout==='4'?4:plan.layout==='1'?1:2,pad=40,gap=24,w=canvas.width-pad*2,h=Math.floor((canvas.height-pad*2-(count-1)*gap)/count);
  plan.signs.forEach((s,i)=>{const y=pad+i*(h+gap);if(s.type==='outdoor')drawOutdoor(c,outdoorSign(s),pad,y,w,h);else drawSignSlot(c,indoorSign(s),y,h,canvas.width);});
  if(plan.signs.every(s=>s.type==='indoor')){c.strokeStyle='#e2e8f0';c.lineWidth=2;c.setLineDash([12,10]);for(let i=plan.signs.length;i<count;i++)c.strokeRect(pad,pad+i*(h+gap),w,h);c.setLineDash([]);}
  c.restore();return canvas;
}
export function previewCanvas(canvas,s){
  // Small thumbnails never allocate full print-resolution pages.
  canvas.width=320;canvas.height=226;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,320,226);
  if(s.type==='outdoor')drawOutdoor(c,outdoorSign(s),8,8,304,210);
  else {const k=304/1160;c.save();c.translate(8-40*k,8);c.scale(k,k);drawSignSlot(c,indoorSign(s),0,210/k,1240);c.restore();}
}

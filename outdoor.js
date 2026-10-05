// Outdoor-only artwork. All labels originate in the sign; decoration is vector geometry.
import { money, priceText } from './model.js';
const FONT = '"Outdoor Black", Arial, sans-serif';
const BLACK = '#000', WHITE = '#fff';
function font(c, size) { c.font = `900 ${size}px ${FONT}`; }
function polygon(c, points, color = BLACK) {
  c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y));
  c.closePath(); c.fillStyle=color; c.fill();
}
function box(c,x,y,w,h,color=BLACK) { c.fillStyle=color; c.fillRect(x,y,w,h); }
function outline(c,x,y,w,h,width=4,dash=[]) {
  c.save(); c.strokeStyle=BLACK; c.lineWidth=width; c.setLineDash(dash); c.strokeRect(x,y,w,h); c.restore();
}
function metrics(c, str, size) {
  font(c,size); c.direction='rtl'; c.textAlign='center'; c.textBaseline='alphabetic';
  const m=c.measureText(str);
  return { width:Math.max(m.width,m.actualBoundingBoxLeft+m.actualBoundingBoxRight), ascent:m.actualBoundingBoxAscent, descent:m.actualBoundingBoxDescent };
}
function ink(c,str,x,y,size,color=BLACK,dir='rtl') {
  font(c,size); c.direction=dir; c.textAlign='center'; c.textBaseline='alphabetic'; c.fillStyle=color;
  c.fillText(str,x,y);
}
function linesAt(c,str,size,width) {
  font(c,size); const lines=[]; let line='';
  for(const word of str.split(/\s+/).filter(Boolean)) {
    if(metrics(c,word,size).width>width) {
      if(line) { lines.push(line); line=''; }
      for(const letter of word) {
        if(line && metrics(c,line+letter,size).width>width) { lines.push(line); line=''; }
        line+=letter;
      }
    } else if(line && metrics(c,line+' '+word,size).width>width) { lines.push(line); line=word; }
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line); return lines;
}
// Fit actual ink bounds, trying the full region and all permitted lines BEFORE shrinking.
// No clipping or ellipsis: even a long unbroken product name remains complete.
function fit(c,value,b,maxSize=130,color=BLACK,maxLines=2) {
  const str=String(value||'').trim(); if(!str)return;
  let chosen;
  for(let size=maxSize;size>=1;size--) {
    const lines=linesAt(c,str,size,b.w), ms=lines.map(l=>metrics(c,l,size));
    const gap=size*.08, height=ms.reduce((n,m)=>n+m.ascent+m.descent,0)+gap*(lines.length-1);
    if(lines.length<=maxLines && height<=b.h && ms.every(m=>m.width<=b.w)) {chosen={lines,ms,size,gap,height};break;}
  }
  if(!chosen)return;
  let y=b.y+(b.h-chosen.height)/2;
  chosen.lines.forEach((line,i)=>{const m=chosen.ms[i]; ink(c,line,b.x+b.w/2,y+m.ascent,chosen.size,color);y+=m.ascent+m.descent+chosen.gap;});
  return chosen.size;
}
function angled(c,str,b,rotation=-.08,color=BLACK,max=29,lines=3) {
  if(!str)return; c.save(); c.translate(b.x+b.w/2,b.y+b.h/2); c.rotate(rotation);
  fit(c,str,{x:-b.w/2,y:-b.h/2,w:b.w,h:b.h},max,color,lines); c.restore();
}
function brush(c,x,y,w,h) {
  polygon(c,[[x+23,y+8],[x+w*.43,y],[x+w-20,y+6],[x+w-4,y+23],[x+w-24,y+h*.32],
    [x+w,y+h*.40],[x+w-29,y+h*.56],[x+w-4,y+h*.68],[x+w-25,y+h-8],
    [x+w*.55,y+h],[x+8,y+h-5],[x+23,y+h*.76],[x,y+h*.63],[x+18,y+h*.44],[x+3,y+h*.25]]);
  // Deterministic dry-brush filaments; stay outside the central lettering zone.
  for(let i=0;i<10;i++) {
    const yy=y+12+i*(h-24)/10, extra=9+(i*13%23);
    polygon(c,[[x+25,yy],[x-extra,yy+3],[x+30,yy+7]]);
    polygon(c,[[x+w-27,yy+2],[x+w+extra,yy-2],[x+w-23,yy+7]]);
  }
}
function burst(c,x,y,w,h,teeth=15) {
  // A broad rectangular core keeps the entire price white-on-black; sharp outer teeth
  // make the graphic a supermarket explosion rather than an outlined oval badge.
  const p=[];
  for(let i=0;i<=teeth*2;i++)p.push([x+32+i*(w-64)/(teeth*2),y+(i%2?24+(i*7%13):(i*11%16))]);
  p.push([x+w+5,y+27],[x+w-16,y+h*.26],[x+w+20,y+h*.39],
    [x+w-11,y+h*.55],[x+w+13,y+h*.71],[x+w-27,y+h-19]);
  for(let i=teeth*2;i>=0;i--)p.push([x+29+i*(w-58)/(teeth*2),y+h-(i%2?22+(i*11%15):(i*13%17))]);
  p.push([x-3,y+h-27],[x+15,y+h*.77],[x-21,y+h*.60],
    [x+9,y+h*.43],[x-16,y+h*.27],[x+23,y+25]);polygon(c,p);
}
function rays(c,cx,cy,side=1,scale=1) {
  c.save();c.translate(cx,cy);c.scale(side*scale,scale);
  polygon(c,[[0,-17],[37,-83],[67,-65]]);
  polygon(c,[[9,0],[83,-24],[85,7]]);
  polygon(c,[[2,20],[66,38],[48,65]]);c.restore();
}
function chevrons(c,x,y) { polygon(c,[[x,y],[x+47,y+14],[x+12,y+22]]);polygon(c,[[x+10,y+33],[x+56,y+34],[x+23,y+52]]); }
function price(c,s,b,color=WHITE) {
  if(s.kind==='free' || s.kind==='pct') {fit(c,s.kind==='pct'?`${priceText(s.pct)}% הנחה`:s.free,b,190,color,3);return;}
  if(!(Number(s.price)>0))return;
  const amount=priceText(s.price), parts=amount.split('.');
  // Left-to-right placement of individually directed runs avoids Hebrew bidi reversal.
  // Reading from right: quantity, ב־, amount, currency. Quantity has full price weight.
  const runs=[{str:'₪',ratio:.40,dir:'ltr'},
    {str:parts[0],ratio:1,dir:'ltr'},
    ...(parts[1]?[{str:'.'+parts[1],ratio:.79,dir:'ltr'}]:[]),
    ...(s.kind==='bundle'?[{str:'ב־',ratio:.54,dir:'rtl'},{str:String(s.quantity||''),ratio:1,dir:'ltr'}]:[])];
  let selected;
  for(let size=420;size>=1;size--) {
    const ms=runs.map(r=>metrics(c,r.str,size*r.ratio));
    const gap=size*.032, width=ms.reduce((n,m)=>n+m.width,0)+gap*(runs.length-1);
    const ascent=Math.max(...ms.map(m=>m.ascent)),descent=Math.max(...ms.map(m=>m.descent));
    if(width<=b.w && ascent+descent<=b.h) {selected={size,ms,gap,width,ascent,descent};break;}
  }
  if(!selected)return;
  let x=b.x+(b.w-selected.width)/2;const y=b.y+(b.h-selected.ascent-selected.descent)/2+selected.ascent;
  runs.forEach((r,i)=>{const m=selected.ms[i];ink(c,r.str,x+m.width/2,y,selected.size*r.ratio,color,r.dir);x+=m.width+selected.gap;});
}
function dateLabel(s) {
  const f=d=>d.split('-').reverse().join('.');
  return s.start&&s.end?`${f(s.start)} – ${f(s.end)}`:s.end?`בתוקף עד ${f(s.end)}`:s.start?`בתוקף מ־${f(s.start)}`:'';
}
function footer(c,s,{capsule=true,x=170,w=660,y=620,h=58}={}) {
  const rows=[s.note,s.oldPrice?`במקום ${money(s.oldPrice)} ₪ ליחידה`:'',dateLabel(s)].filter(Boolean);
  if(!rows.length)return;
  const rowH=h/rows.length;
  rows.forEach((str,i)=>{
    if(i===0 && s.note && capsule) {c.save();c.strokeStyle=BLACK;c.lineWidth=3;c.beginPath();c.roundRect(x,y,w,rowH,Math.min(18,rowH/2));c.stroke();c.restore();}
    fit(c,str,{x:x+12,y:y+i*rowH+3,w:w-24,h:rowH-6},rows.length===1?33:25,BLACK,2);
  });
}
function scissors(c,x,y,angle=0) {
  c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=BLACK;c.lineWidth=3;
  for(const yy of [-8,8]) {c.beginPath();c.ellipse(0,yy,9,6,0,0,Math.PI*2);c.stroke();}
  c.beginPath();c.moveTo(6,-5);c.lineTo(37,15);c.moveTo(6,5);c.lineTo(37,-15);c.stroke();c.restore();
}
export function drawOutdoor(c,s,x,y,w,h) {
  c.save();c.translate(x,y);c.scale(w/1000,h/700);box(c,0,0,1000,700,WHITE);
  const t=s.template||'frame',banner=s.banner||'', hasSub=!!s.subtitle;
  const product=(top=185,height=146,width=868,left=(1000-width)/2)=>{
    const titleSize=fit(c,s.title,{x:left,y:top,w:width,h:height},140,BLACK,height>=120?3:2);
    if(hasSub)fit(c,s.subtitle,{x:120,y:top+height+1,w:760,h:45},Math.min(57,(titleSize||80)*.72),BLACK,2);
  };
  const store=(b={x:835,y:43,w:119,h:105},color=BLACK)=>angled(c,s.store,b,.06,color,29,4);
  const standardHeader=(mode='brush')=>{
    if(mode==='ribbon')polygon(c,[[235,48],[765,48],[743,100],[770,169],[230,169],[252,104]]);
    else brush(c,260,40,480,130);
    fit(c,banner,{x:276,y:55,w:448,h:99},132,WHITE,2);
    rays(c,228,107,-1,.63);rays(c,772,107,1,.63);store();
  };
  const priceBurst=(mode='burst')=>{
    const yy=hasSub?367:350,hh=hasSub?240:257;
    if(mode==='brush')brush(c,145,yy,710,hh);
    else if(mode==='block')box(c,142,yy,716,hh);
    else burst(c,141,yy-12,718,hh+24,t==='banner'?17:15);
    rays(c,116,yy+hh/2,-1,.87);rays(c,884,yy+hh/2,1,.87);
    price(c,s,{x:174,y:yy+25,w:652,h:hh-50});
  };
  // A4 margin is supplied by renderPage; artwork also has its own inset.
  if(t!=='burst')outline(c,10,10,980,680,t==='elegant'?5:4);
  if(t==='ticket') {
    outline(c,29,29,942,642,3,[17,10]);outline(c,44,44,912,612,1);
    box(c,19,18,65,33,WHITE);scissors(c,38,32,-.1);box(c,917,643,62,33,WHITE);scissors(c,948,661,Math.PI);
    polygon(c,[[215,61],[785,49],[762,109],[790,167],[210,174],[240,118]]);
    fit(c,banner,{x:251,y:65,w:498,h:96},124,WHITE,2);
    product(184,hasSub?129:158,826);
    // The circular stamp contains ONLY a supplied store name, never an invented deadline.
    if(s.store) {c.beginPath();c.arc(863,431,63,0,Math.PI*2);c.fillStyle=BLACK;c.fill();angled(c,s.store,{x:822,y:390,w:82,h:82},-.13,WHITE,25,4);}
    price(c,s,{x:109,y:hasSub?370:353,w:s.store?672:782,h:237},BLACK);
    footer(c,s,{capsule:false,x:118,w:764,y:612,h:39});
  } else if(t==='bold') {
    polygon(c,[[12,12],[970,12],[914,61],[943,68],[844,197],[13,260]]);
    c.save();c.translate(472,130);c.rotate(-.08);fit(c,banner,{x:-414,y:-85,w:828,h:170},206,WHITE,2);c.restore();
    product(258,hasSub?76:97,820);
    price(c,s,{x:117,y:hasSub?388:368,w:766,h:236},BLACK);
    rays(c,90,456,-1,.75);rays(c,910,456,1,.75);
    polygon(c,[[12,607],[181,642],[149,688],[12,688]]);polygon(c,[[849,642],[988,607],[988,688],[819,688]]);
    angled(c,s.store,{x:24,y:644,w:117,h:37},0,WHITE,24,3);
    footer(c,s,{capsule:false,x:193,w:598,y:634,h:43});
  } else if(t==='split') {
    polygon(c,[[12,12],[241,12],[12,232]]);chevrons(c,55,81);
    if(s.store)angled(c,s.store,{x:26,y:32,w:117,h:83},-.15,WHITE,26,3);
    brush(c,290,44,440,129);fit(c,banner,{x:316,y:55,w:388,h:104},131,WHITE,2);
    rays(c,773,109,1,.72);product(188,hasSub?135:154);
    polygon(c,[[173,398],[898,373],[829,612],[102,625]]);
    // Level typography over a slanted black slab keeps the amount maximally readable.
    price(c,s,{x:182,y:414,w:625,h:180});
    rays(c,90,467,-1,.66);rays(c,920,475,1,.63);
    footer(c,s,{x:205,w:590,y:636,h:40});
  } else {
    standardHeader(t==='banner'?'ribbon':'brush');
    product(186,hasSub?126:150);
    priceBurst(t==='burst'?'brush':t==='elegant'?'block':'burst');
    footer(c,s);
    if(!s.note && !s.oldPrice && !s.start && !s.end) {chevrons(c,53,623);c.save();c.translate(947,675);c.rotate(Math.PI);chevrons(c,0,0);c.restore();}
  }
  c.restore();
}

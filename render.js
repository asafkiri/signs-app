import { money, priceText } from './model.js';
const FONT = 'Arial, sans-serif';
function text(c, str, x, y, size, color = '#000', weight = 900, dir = 'rtl') {
  c.save(); c.fillStyle = color; c.font = `${weight} ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = dir; c.fillText(String(str), x, y); c.restore();
}
function rect(c, x, y, w, h, fill = null, stroke = null, line = 3, radius = 0) {
  c.save(); c.beginPath(); if (radius) c.roundRect(x, y, w, h, radius); else c.rect(x, y, w, h);
  if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); } c.restore();
}
function rule(c, x1, y1, x2, y2, width = 3, dash = []) {
  c.save(); c.strokeStyle = '#000'; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
}
function wrap(c, str, width) {
  const words = String(str).split(/\s+/).filter(Boolean), lines = []; let line = '';
  for (const word of words) {
    if (c.measureText(word).width > width) {
      if (line) { lines.push(line); line = ''; }
      for (const ch of word) { if (line && c.measureText(line + ch).width > width) { lines.push(line); line = ''; } line += ch; }
    } else if (line && c.measureText(line + ' ' + word).width > width) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line); return lines;
}
export function fitText(c, str, box, maxSize = 90, color = '#000', maxLines = 2, weight = 900) {
  if (!str) return;
  let size = maxSize, lines = [];
  // Prefer one line at a modestly smaller size rather than stealing space from price.
  for (const limit of [1, maxLines]) {
    const floor = limit === 1 ? maxSize * 0.60 : 9;
    for (size = maxSize; size >= floor; size--) {
      c.font = `${weight} ${size}px ${FONT}`; lines = wrap(c, str, box.w);
      if (lines.length <= limit && lines.length * size * 1.12 <= box.h) break;
    }
    if (size >= floor) break;
  }
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
  lines.forEach((line, i) => text(c, line, box.x + box.w / 2, box.y + box.h / 2 + (i - (lines.length - 1) / 2) * size * 1.12, size, color, weight));
  c.restore();
}
function price(c, s, box, color = '#000') {
  if (s.kind === 'free') { fitText(c, s.free, box, box.h * .72, color, 3); return; }
  const amount = priceText(s.price), prefix = s.kind === 'bundle' ? `${s.quantity} ב־` : '';
  let f = Math.min(box.h * .80, 300), total = 0, aw = 0, pw = 0, cw = 0;
  do {
    c.font = `900 ${f}px ${FONT}`; aw = c.measureText(amount).width;
    c.font = `900 ${f * .42}px ${FONT}`; cw = c.measureText('₪').width;
    c.font = `900 ${f * .47}px ${FONT}`; pw = prefix ? c.measureText(prefix).width : 0;
    total = aw + cw + pw + f * (prefix ? .16 : .08);
    if (total <= box.w) break; f -= 1;
  } while (f > 12);
  const left = box.x + (box.w - total) / 2, mid = box.y + box.h / 2;
  text(c, '₪', left + cw / 2, mid + f * .07, f * .42, color);
  text(c, amount, left + cw + f * .08 + aw / 2, mid, f, color, 900, 'ltr');
  if (prefix) text(c, prefix, left + cw + aw + f * .16 + pw / 2, mid + f * .05, f * .47, color);
}
function dateLabel(s) {
  const f = d => d.split('-').reverse().join('.');
  return s.start && s.end ? `${f(s.start)} – ${f(s.end)}` : s.end ? `בתוקף עד ${f(s.end)}` : s.start ? `בתוקף מ־${f(s.start)}` : '';
}
function footer(c, s, x, y, w, h) {
  const lines = [s.oldPrice ? `במקום ${money(s.oldPrice)} ₪ ליחידה` : '', s.note, dateLabel(s)].filter(Boolean);
  if (!lines.length) return;
  const lh = h / lines.length;
  lines.forEach((l, i) => fitText(c, l, { x, y: y + i * lh, w, h: lh }, Math.min(27, lh * .80), '#000', 2, i === 1 ? 700 : 500));
}
function star(c, cx, cy, rx, ry) {
  c.save(); c.beginPath();
  for (let i = 0; i < 48; i++) { const a = Math.PI * i / 24; const k = i % 2 ? .91 : 1; const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#000'; c.stroke(); c.restore();
}
function rays(c, cx, cy, side = 1) {
  c.save(); c.fillStyle = '#000';
  [[0,-58,34,-12],[0,-25,58,-5],[0,14,55,9]].forEach(([x1,y1,x2,y2]) => {
    c.beginPath(); c.moveTo(cx + side*x1, cy+y1); c.lineTo(cx + side*x2, cy+y2); c.lineTo(cx + side*(x2-13), cy+y2+13); c.closePath(); c.fill();
  }); c.restore();
}
function brush(c, x, y, w, h) {
  c.save(); c.fillStyle='#000'; c.beginPath();
  const pts=[[x+15,y],[x+w-25,y+5],[x+w,y+18],[x+w-12,y+h-5],[x+w-45,y+h],[x+20,y+h-3],[x,y+h-18],[x+12,y+10]];
  pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p)); c.closePath(); c.fill(); c.restore();
}
function burst(c, cx, cy, rx, ry, teeth=18) {
  c.save(); c.beginPath();
  for(let i=0;i<teeth*2;i++){const a=Math.PI*i/teeth,k=i%2?.78:1,px=cx+Math.cos(a)*rx*k,py=cy+Math.sin(a)*ry*k;i?c.lineTo(px,py):c.moveTo(px,py);}
  c.closePath(); c.fillStyle='#000'; c.fill(); c.restore();
}
function cornerNote(c, str, x, y, w, h, rotate=0) {
  if(!str) return; c.save(); c.translate(x+w/2,y+h/2); c.rotate(rotate); fitText(c,str,{x:-w/2,y:-h/2,w,h},25,'#000',2,800); c.restore();
}
export function drawOutdoor(c, s, x, y, w, h) {
  c.save(); c.translate(x,y); c.scale(w/1000,h/700); rect(c,0,0,1000,700,'#fff');
  const t=s.template||'frame', banner=s.banner||'מבצע!', title=s.title||'', sub=s.subtitle||'';
  const store=()=>fitText(c,s.store,{x:760,y:28,w:190,h:58},27,'#000',2,900);
  const titleBlock=(yy=175,hh=150)=>{fitText(c,title,{x:75,y:yy,w:850,h:hh},116,'#000',2); if(sub) fitText(c,sub,{x:180,y:yy+hh-2,w:640,h:48},43,'#000',1,900);};
  const promoPrice=(yy=390,hh=205,shape='burst')=>{
    if(shape==='brush') brush(c,145,yy-12,710,hh+20); else if(shape==='box') rect(c,140,yy,720,hh,'#000',null,0,18); else burst(c,500,yy+hh/2,420,hh*.62,20);
    rays(c,115,yy+hh/2,-1); rays(c,885,yy+hh/2,1); price(c,s,{x:175,y:yy+8,w:650,h:hh-16},'#fff');
  };
  rect(c,8,8,984,684,null,'#000',8,10);
  // All seven are intentionally one supermarket-sale family, with different composition.
  if(t==='frame'){
    brush(c,300,38,400,105); fitText(c,banner,{x:330,y:48,w:340,h:80},78,'#fff',1); store();
    cornerNote(c,'מוצרים טריים\nכל יום!',45,42,190,75,-.12); titleBlock(168,150); promoPrice(385,205,'burst');
    rect(c,300,618,400,48,'#fff','#000',4,24); fitText(c,s.note||'טריות • איכות • טעם מעולה',{x:320,y:624,w:360,h:35},27,'#000',1,800);
  } else if(t==='banner'){
    rect(c,250,34,500,100,'#000'); fitText(c,banner,{x:280,y:45,w:440,h:75},73,'#fff',1); store();
    titleBlock(165,155); promoPrice(380,215,'box'); cornerNote(c,'מחירים טובים\nלשכונה!',45,525,185,85,-.08);
    fitText(c,s.note||'ניתן לערבב בין המוצרים',{x:250,y:620,w:500,h:42},31,'#000',1,800);
  } else if(t==='burst'){
    brush(c,260,35,480,110); fitText(c,banner,{x:295,y:45,w:410,h:83},82,'#fff',1); store(); rays(c,220,90,-1); rays(c,780,90,1);
    titleBlock(175,145); promoPrice(382,210,'brush'); cornerNote(c,'שווה לכם!',760,570,180,65,-.1); cornerNote(c,'טרי כל יום!',45,570,180,65,.1);
  } else if(t==='ticket'){
    c.save(); c.setLineDash([15,10]); rect(c,28,28,944,644,null,'#000',3,18); c.restore();
    fitText(c,'✂',{x:30,y:20,w:60,h:55},35,'#000',1); rect(c,290,45,420,90,'#000'); fitText(c,'קופון מבצע!',{x:320,y:54,w:360,h:68},62,'#fff',1);
    titleBlock(170,150); price(c,s,{x:120,y:370,w:760,h:205}); rect(c,760,335,145,95,'#000',null,0,48); fitText(c,'רק\nהשבוע!',{x:780,y:347,w:105,h:70},31,'#fff',2);
    fitText(c,s.note||'טריות • איכות • טעם מעולה',{x:190,y:590,w:620,h:45},31,'#000',1,800);
  } else if(t==='elegant'){
    brush(c,285,35,430,105); fitText(c,banner,{x:320,y:45,w:360,h:80},78,'#fff',1); store(); rays(c,245,90,-1); rays(c,755,90,1);
    titleBlock(175,145); promoPrice(375,220,'box'); cornerNote(c,'טרי\nכל יום!',35,515,150,90,-.1); cornerNote(c,'איכות\nבמחיר מעולה!',815,515,150,90,.08);
  } else if(t==='split'){
    c.save(); c.fillStyle='#000'; c.beginPath(); c.moveTo(8,8); c.lineTo(1000,8); c.lineTo(870,190); c.lineTo(100,190); c.closePath(); c.fill(); c.restore();
    fitText(c,banner,{x:190,y:28,w:620,h:130},116,'#fff',1); store(); titleBlock(205,150); promoPrice(420,185,'burst');
    fitText(c,s.note||'ניתן לערבב בין המוצרים',{x:210,y:622,w:580,h:38},29,'#000',1,800);
  } else {
    brush(c,310,40,380,95); fitText(c,banner,{x:340,y:48,w:320,h:70},68,'#fff',1); store(); rays(c,270,87,-1); rays(c,730,87,1);
    fitText(c,title,{x:130,y:165,w:740,h:100},82,'#000',2); if(sub) fitText(c,sub,{x:240,y:258,w:520,h:42},36,'#000',1,900);
    promoPrice(330,245,'box'); cornerNote(c,'טרי\nכל יום!',35,500,155,95,-.08); cornerNote(c,'איכות\nבמחיר מעולה!',810,500,155,95,.08);
  }
  footer(c,s,65,648,870,35); c.restore();
}
export function drawIndoor(c, s, x, y, w, h) {
  c.save(); c.translate(x, y); c.scale(w / 1000, w / 1000); const H = h * 1000 / w;
  rect(c, 5, 5, 990, H - 10, '#fff', '#000', 5, 12);
  rect(c, 722, 8, 270, 51, '#000', null, 0, 6); fitText(c, s.banner, { x: 733, y: 12, w: 248, h: 42 }, 35, '#fff', 1);
  fitText(c, s.store, { x: 33, y: 17, w: 655, h: 28 }, 24, '#000', 1, 500);
  const dense = H < 500;
  const footerLines = [s.oldPrice, s.note, dateLabel(s)].filter(Boolean).length;
  const top = dense ? 62 : 69, footerH = footerLines ? (dense ? footerLines * 20 + 4 : Math.min(90, H * .20)) : 20;
  const titleH = dense ? 58 : Math.min(135, H * .25), subH = s.subtitle ? (dense ? 26 : Math.min(44, H * .10)) : 0;
  fitText(c, s.title, { x: 35, y: top, w: 930, h: titleH }, Math.min(93, titleH * .75), '#000', 2);
  if (s.subtitle) fitText(c, s.subtitle, { x: 35, y: top + titleH, w: 930, h: subH }, 33, '#000', 1, 700);
  const py = top + titleH + subH + 3, ph = H - footerH - py - 22;
  price(c, s, { x: 40, y: py, w: 920, h: Math.max(55, ph) });
  footer(c, s, 35, H - footerH - 9, 930, footerH - 2); c.restore();
}
export function previewCanvas(canvas, sign) {
  // Thumbnail canvases need far fewer pixels than the live/printed sign.
  const factor = canvas.closest?.('.template-option, .saved-sign') ? .32 : 1;
  canvas.width = Math.round(1000 * factor); canvas.height = Math.round(707 * factor); const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.scale(factor, factor);
  const draw = sign.type === 'outdoor' ? drawOutdoor : drawIndoor;
  draw(c, sign, 25, 25, 950, 657);
}
// Code 128-B: ASCII payload, weighted modulo-103 checksum, start B and stop.
// Module-width patterns are the standard Code 128 symbol table (ISO/IEC 15417).
const P = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
export function barcodePattern(code) {
  if (typeof code !== 'string' || !/^[\x20-\x7e]{1,32}$/.test(code)) throw new Error('ברקוד לא תקין');
  const data = [...code].map(ch => ch.charCodeAt(0) - 32);
  const checksum = (104 + data.reduce((sum, n, i) => sum + n * (i + 1), 0)) % 103;
  const values = [104, ...data, checksum, 106];
  return values.flatMap(n => [...P[n]].map(Number));
}
function drawBarcode(c, code, x, y, w, h) {
  const pattern = barcodePattern(code), modules = pattern.reduce((a, b) => a + b, 20), unit = Math.min(3, w / modules);
  let pos = x + (w - modules * unit) / 2 + 10 * unit;
  pattern.forEach((width, i) => { if (i % 2 === 0) rect(c, pos, y, width * unit, h, '#000'); pos += width * unit; });
}
export function renderPage(plan) {
  const canvas = document.createElement('canvas'); canvas.width = plan.landscape ? 1754 : 1240; canvas.height = plan.landscape ? 1240 : 1754;
  const c = canvas.getContext('2d'); rect(c, 0, 0, canvas.width, canvas.height, '#fff');
  if (plan.kind === 'barcodes') {
    text(c, 'ברקודים לקופה — לא לתלייה', 620, 67, 42); text(c, 'יש לבדוק את המחיר והשיוך בקופה לפני הפעלת המבצע', 620, 119, 23, '#000', 500);
    plan.codes.forEach((row, i) => {
      const y = 174 + i * 216; fitText(c, row.title + ' · ' + row.offer, { x: 80, y, w: 1080, h: 47 }, 31, '#000', 2);
      drawBarcode(c, row.code, 100, y + 57, 1040, 87); text(c, row.code, 620, y + 170, 26, '#000', 500, 'ltr'); rule(c, 80, y + 198, 1160, y + 198, 1, [7, 7]);
    }); return canvas;
  }
  c.save(); if (plan.layout === '2small') { c.translate(canvas.width * .06, canvas.height * .06); c.scale(.88, .88); }
  const count = plan.layout === '4' ? 4 : plan.layout === '1' ? 1 : 2;
  const pad = 38, gap = count === 4 ? 15 : 24, width = canvas.width - pad * 2, height = (canvas.height - pad * 2 - (count - 1) * gap) / count;
  plan.signs.forEach((sign, i) => { const draw = sign.type === 'outdoor' ? drawOutdoor : drawIndoor; draw(c, sign, pad, pad + i * (height + gap), width, height); });
  c.restore(); return canvas;
}

// A dependency-free PDF 1.4 writer. The exact preview canvases become JPEG pages.
// ASCII PDF structure + binary JPEG bytes; xref offsets count BYTES, not characters.
export function canvasesToPDF(canvases) {
  if (!canvases.length) throw new Error('אין דפים לייצוא');
  const enc = new TextEncoder(), bytes = s => enc.encode(s), objects = [];
  objects[1] = bytes('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = bytes(`<< /Type /Pages /Count ${canvases.length} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  canvases.forEach((canvas, i) => {
    const n = 3 + i * 3, landscape = canvas.width > canvas.height, w = landscape ? 841.89 : 595.28, h = landscape ? 595.28 : 841.89;
    const raw = atob(canvas.toDataURL('image/jpeg', .96).split(',')[1]);
    const jpeg = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Photo Do\nQ\n`;
    objects[n] = bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Photo ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    objects[n + 1] = [bytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, bytes('\nendstream')];
    objects[n + 2] = bytes(`<< /Length ${bytes(stream).length} >>\nstream\n${stream}endstream`);
  });
  const chunks = [bytes('%PDF-1.4\n')], offsets = [0]; let length = chunks[0].length;
  const append = data => { chunks.push(data); length += data.length; };
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = length; append(bytes(`${i} 0 obj\n`));
    for (const chunk of Array.isArray(objects[i]) ? objects[i] : [objects[i]]) append(chunk);
    append(bytes('\nendobj\n'));
  }
  const xref = length;
  append(bytes(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(chunks, { type: 'application/pdf' });
}

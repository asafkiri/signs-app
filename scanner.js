// Camera is requested only after the optional scan button is pressed.
let loader;
function loadZXing() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js'; s.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { s.remove(); reject(new Error('טעינת הסורק נכשלה. אפשר להזין ברקוד ידנית')); }, 15000);
    s.onload = () => { clearTimeout(timer); window.ZXingBrowser ? resolve(window.ZXingBrowser) : reject(new Error('ספריית הסריקה לא נטענה')); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('נדרש אינטרנט לטעינה הראשונה של סורק הברקודים')); }; document.head.append(s);
  }).catch(e => { loader = null; throw e; }); return loader;
}
export async function startScanner(video, onCode, isCancelled = () => false) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('המצלמה אינה זמינה בדפדפן הזה. אפשר להזין ברקוד ידנית');
  let stopped = false, stream, controls, timer;
  const stop = () => { stopped = true; clearTimeout(timer); controls?.stop(); stream?.getTracks().forEach(t => t.stop()); if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; };
  const cancelled = () => stopped || isCancelled();
  try {
    let detector;
    if ('BarcodeDetector' in window) {
      try { const supported = await window.BarcodeDetector.getSupportedFormats(); const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'].filter(f => supported.includes(f)); if (formats.length) detector = new window.BarcodeDetector({ formats }); } catch {}
    }
    if (cancelled()) return stop;
    if (detector) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (cancelled()) { stop(); return stop; } video.srcObject = stream; await video.play();
      const tick = async () => {
        if (cancelled()) { stop(); return; }
        try { const hits = await detector.detect(video); if (hits.length && !cancelled()) { const code = hits[0].rawValue; stop(); onCode(code); return; } } catch {}
        if (!cancelled()) timer = setTimeout(tick, 180); else stop();
      }; tick();
    } else {
      const ZXing = await loadZXing(); if (cancelled()) return stop;
      const reader = new ZXing.BrowserMultiFormatOneDReader();
      controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, video, (result, _error, ctl) => {
        if (cancelled()) { ctl?.stop(); stop(); return; }
        if (result) { ctl?.stop(); stop(); onCode(result.getText()); }
      });
      if (cancelled()) { controls.stop(); stop(); }
    }
    return stop;
  } catch (error) {
    stop();
    if (error.name === 'NotAllowedError') throw new Error('לא ניתנה הרשאה למצלמה. אפשר לאשר בהגדרות הדפדפן או להקליד ברקוד');
    if (error.name === 'NotFoundError') throw new Error('לא נמצאה מצלמה');
    throw error;
  }
}

// Camera/ROI pipeline adapted from yotvata-app (11 October 2026).
// One scan per session; each session owns and releases only its own camera stream.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
let wasmLoader, zxingLoader;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const within = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('טעינת הסורק נמשכת זמן רב מדי')), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
function loadWasm() {
  if (!wasmLoader) wasmLoader = (async () => {
    for (const src of ['https://esm.run/barcode-detector@3/pure', 'https://esm.sh/barcode-detector@3/pure']) {
      try {
        const mod = await within(import(src), 8000);
        if (mod.BarcodeDetector) return mod.BarcodeDetector;
      } catch {}
    }
    throw new Error('לא ניתן לטעון את מנוע הסריקה');
  })().catch(error => { wasmLoader = null; throw error; });
  return wasmLoader;
}
function loadZXing() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (!zxingLoader) zxingLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
    script.crossOrigin = 'anonymous';
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('לא ניתן לטעון את הסורק. בדוק חיבור לאינטרנט או הזן ברקוד ידנית')); };
    const timer = setTimeout(fail, 15000);
    script.onload = () => { clearTimeout(timer); window.ZXingBrowser ? resolve(window.ZXingBrowser) : fail(); };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => { zxingLoader = null; throw error; });
  return zxingLoader;
}
// Warm only the decoder when the optional barcode section is opened, never the camera.
export function prepareScanner() {
  if (isIOS()) loadWasm().then(async Detector => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
    await new Detector({ formats: ['ean_13'] }).detect(canvas);
  }).catch(() => {});
}
async function samsungDevice() {
  try {
    const info = await navigator.userAgentData?.getHighEntropyValues?.(['model']);
    if (/^SM-/i.test(info?.model || '')) return true;
  } catch {}
  return /\bSM-|Samsung/i.test(navigator.userAgent);
}
function getRoi(video, frame, canvas) {
  if (!frame || !video.videoWidth || !video.videoHeight) return null;
  const box = video.getBoundingClientRect(), fr = frame.getBoundingClientRect();
  if (!box.width || !box.height || !fr.width) return null;
  // Matches the object-fit:cover video. Padding preserves barcode quiet zones.
  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  const offsetX = (video.videoWidth - box.width / scale) / 2;
  const offsetY = (video.videoHeight - box.height / scale) / 2;
  const sx = Math.max(0, offsetX + (fr.left - box.left - 50) / scale);
  const sy = Math.max(0, offsetY + (fr.top - box.top - 50) / scale);
  const width = Math.min((fr.width + 100) / scale, video.videoWidth - sx);
  const height = Math.min((fr.height + 100) / scale, video.videoHeight - sy);
  if (width < 50 || height < 50) return null;
  canvas.width = Math.round(width); canvas.height = Math.round(height);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function sharpness(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let sum = 0, count = 0;
  const step = Math.max(2, h >> 5);
  for (let y = step >> 1; y < h; y += step) {
    const row = y * w * 4;
    let prev = data[row] * 3 + data[row + 1] * 6 + data[row + 2];
    for (let x = 2; x < w; x += 2) {
      const p = row + x * 4, current = data[p] * 3 + data[p + 1] * 6 + data[p + 2];
      sum += (current - prev) ** 2; prev = current; count++;
    }
  }
  return count ? sum / count : 0;
}
function improvePrint(canvas, mode) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), data = img.data;
  const gray = new Uint8ClampedArray(w * h), hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 3 + data[p + 1] * 6 + data[p + 2]) / 10 | 0; hist[gray[i]]++;
  }
  let threshold = 128, count = 0;
  if (mode !== 7) {
    const target = gray.length * (mode === 3 ? .2 : .3);
    for (let v = 0; v < 256; v++) { count += hist[v]; if (count >= target) { threshold = v; break; } }
    threshold = Math.max(40, Math.min(140, threshold));
  }
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const x = i % w;
    const value = mode === 7 ? Math.max(gray[i - (x > 0 ? 1 : 0)], gray[i], gray[i + (x < w - 1 ? 1 : 0)]) : gray[i] > threshold ? 255 : 0;
    data[p] = data[p + 1] = data[p + 2] = value;
  }
  ctx.putImageData(img, 0, 0); return canvas;
}
export async function startScanner(video, onCode, isCancelled = () => false, { frame, torchButton, onStatus = () => {} } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('המצלמה אינה זמינה בדפדפן הזה. אפשר להזין ברקוד ידנית');
  let stopped = false, stream, controls, timer, torchHandler, torchOn = false;
  const cancelled = () => stopped || isCancelled();
  const status = text => { if (!cancelled()) onStatus(text); };
  const releaseStream = () => {
    if (!stream) return;
    stream.getTracks().forEach(track => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
    stream = null;
  };
  const stop = () => {
    stopped = true; clearTimeout(timer); controls?.stop(); releaseStream();
    if (torchHandler) { torchButton?.removeEventListener('click', torchHandler); torchHandler = null; }
  };
  const accept = value => {
    const code = String(value || '').trim();
    if (!code || cancelled()) return false;
    stop(); onCode(code); return true;
  };
  const openCamera = async highResolution => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: 'environment' }, width: { ideal: highResolution ? 3840 : 1920 }, height: { ideal: highResolution ? 2160 : 1080 }
    } });
    if (cancelled()) { stop(); return false; }
    video.srcObject = stream; await video.play();
    if (cancelled()) { stop(); return false; }
    const track = stream.getVideoTracks()[0], caps = track?.getCapabilities?.() || {};
    // Separate optional constraints: lack of zoom support must not disable autofocus.
    const apply = async value => { try { await track?.applyConstraints?.({ advanced: [value] }); } catch {} };
    if (caps.focusMode?.includes('continuous')) await apply({ focusMode: 'continuous' });
    if (isIOS() || await samsungDevice()) {
      const zoom = caps.zoom && Math.min(2, caps.zoom.max);
      if (zoom > (caps.zoom?.min || 1)) await apply({ zoom });
    }
    if (cancelled()) { stop(); return false; }
    if (torchButton && caps.torch) {
      torchButton.hidden = false;
      torchButton.setAttribute('aria-pressed', 'false');
      torchHandler = async () => {
        if (cancelled()) return;
        const next = !torchOn;
        try {
          await track.applyConstraints({ advanced: [{ torch: next }] });
          if (!cancelled()) { torchOn = next; torchButton.setAttribute('aria-pressed', String(next)); }
        } catch {}
      };
      torchButton.addEventListener('click', torchHandler);
    }
    return true;
  };
  try {
    let detector, useWasm = false;
    if (!isIOS() && window.BarcodeDetector) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter(f => supported.includes(f));
        if (formats.includes('ean_13') && formats.includes('ean_8')) detector = new window.BarcodeDetector({ formats });
      } catch {}
    }
    if (cancelled()) return stop;
    if (!detector) {
      status('טוען מנוע סריקה…');
      try {
        const Detector = await loadWasm();
        if (cancelled()) return stop;
        detector = new Detector({ formats: FORMATS });
        const probe = document.createElement('canvas'); probe.width = probe.height = 4;
        await within(detector.detect(probe), 12000); // Verify WASM bytes, not just the JS module.
        useWasm = true;
      } catch { detector = null; }
    }
    if (cancelled()) return stop;
    let fallback;
    if (!detector) {
      status('טוען סורק חלופי…');
      fallback = await loadZXing();
      if (cancelled()) return stop;
    }
    status('מבקש גישה למצלמה…');
    if (!await openCamera(useWasm)) return stop;
    status('כוון את הברקוד לתוך המסגרת. אם התמונה מטושטשת, התרחק מעט.');
    if (!detector) {
      const reader = new fallback.BrowserMultiFormatOneDReader();
      // ZXing clears its preview on stop. Give it a private video so a late
      // fallback cleanup cannot detach the visible video of a newer session.
      controls = await reader.decodeFromStream(stream, undefined, (result, _error, ctl) => {
        if (cancelled()) { ctl?.stop(); stop(); return; }
        if (result && accept(result.getText())) ctl?.stop();
      });
      if (cancelled()) controls.stop();
      return stop;
    }
    const roi = document.createElement('canvas'), full = document.createElement('canvas');
    let ticks = 0, sharpMax = 0;
    const tick = async () => {
      if (cancelled()) { stop(); return; }
      if (video.readyState < 2) { timer = setTimeout(tick, 200); return; }
      let source = video;
      try {
        ticks++;
        if (useWasm) {
          const mode = ticks % 8;
          if (mode === 0 && video.videoWidth > 1440) {
            full.width = 1280; full.height = Math.round(video.videoHeight * 1280 / video.videoWidth);
            full.getContext('2d').drawImage(video, 0, 0, full.width, full.height); source = full;
          } else if (mode !== 0) {
            const crop = getRoi(video, frame, roi);
            if (crop) {
              const sharp = sharpness(crop); sharpMax = Math.max(sharp, sharpMax * .995);
              if (sharp < sharpMax * .5 && (ticks & 3) !== 0) { timer = setTimeout(tick, 40); return; }
              source = [3, 5, 7].includes(mode) ? improvePrint(crop, mode) : crop;
            }
          }
        }
        const codes = await detector.detect(source);
        if (cancelled()) { stop(); return; }
        for (const code of codes || []) if (accept(code.rawValue)) return;
      } catch {}
      if (cancelled()) stop(); else timer = setTimeout(tick, useWasm ? 80 : 200);
    };
    timer = setTimeout(tick, 400);
    return stop;
  } catch (error) {
    stop();
    if (isCancelled()) return stop;
    if (error.name === 'NotAllowedError') throw new Error('לא ניתנה הרשאה למצלמה. אפשר לאשר בהגדרות הדפדפן או להקליד ברקוד');
    if (error.name === 'NotFoundError') throw new Error('לא נמצאה מצלמה');
    throw error;
  }
}

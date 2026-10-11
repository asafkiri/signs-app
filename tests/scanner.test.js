import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../scanner.js', import.meta.url), 'utf8').replaceAll('export ', '').replace('import(src)', 'loadModule(src)');
function harness({ ios = false, formats = ['ean_13', 'ean_8'], wasmFails = false, camera, detect } = {}) {
  const calls = { camera: [], constraints: [], native: 0, wasm: 0, fallback: 0, codes: [], sources: [] };
  let stopCount = 0, cancelled = false, id = 0;
  const timers = new Map(), buttons = new EventTarget(); buttons.attrs = {}; buttons.hidden = true; buttons.setAttribute = (key, value) => { buttons.attrs[key] = value; };
  const track = { stop: () => { stopCount++; }, getCapabilities: () => ({ focusMode: ['continuous'], zoom: { min: 1, max: 3 }, torch: true }), applyConstraints: async c => { calls.constraints.push(c); } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = { srcObject: null, readyState: 2, videoWidth: 1920, videoHeight: 1080, play: async () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 440 }) };
  const frame = { getBoundingClientRect: () => ({ left: 32, top: 140, width: 256, height: 158 }) };
  const canvas = () => { const c = { width: 4, height: 4 }; c.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4) }), putImageData() {} }); return c; };
  class Native {
    static async getSupportedFormats() { return formats; }
    constructor() { calls.native++; }
    async detect(src) { calls.sources.push(src); return detect ? detect(src) : []; }
  }
  class Wasm extends Native {
    constructor() { super(); calls.native--; calls.wasm++; }
    async detect(src) { if (src.width === 4) return []; return super.detect(src); }
  }
  const fallback = { stop() { calls.fallbackStops = (calls.fallbackStops || 0) + 1; } };
  const window = { BarcodeDetector: Native, ZXingBrowser: { BrowserMultiFormatOneDReader: class { async decodeFromStream(s, v, callback) { calls.fallback++; calls.fallbackStream = s; calls.deliver = value => callback({ getText: () => value }, null, fallback); return fallback; } } } };
  const context = vm.createContext({ window, navigator: { userAgent: ios ? 'iPhone' : 'Android', platform: '', mediaDevices: { getUserMedia: async c => { calls.camera.push(c); return camera ? camera(stream) : stream; } } }, document: { createElement: canvas }, setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimeout: n => timers.delete(n), loadModule: async () => { if (wasmFails) throw new Error('network'); return { BarcodeDetector: Wasm }; }, console });
  vm.runInContext(source, context);
  return { calls, video, stream, buttons, frame, timers, get stopCount() { return stopCount; }, cancel() { cancelled = true; }, start: () => context.startScanner(video, code => calls.codes.push(code), () => cancelled, { frame, torchButton: buttons }), prepare: () => context.prepareScanner(), async tick() { const entry = [...timers].find(([, t]) => t.ms <= 400); assert.ok(entry, 'scan loop scheduled'); timers.delete(entry[0]); await entry[1].fn(); } };
}
test('Android uses supported native retail formats, autofocus, one result and releases camera', async () => {
  const h = harness({ detect: () => [{ rawValue: '0012345678' }, { rawValue: 'ignored' }] });
  await h.start(); await h.tick();
  assert.equal(h.calls.native, 1); assert.equal(h.calls.wasm, 0);
  assert.equal(h.calls.camera[0].video.width.ideal, 1920);
  assert.ok(h.calls.constraints.some(c => c.advanced[0].focusMode === 'continuous'));
  assert.deepEqual(h.calls.codes, ['0012345678']); assert.equal(h.video.srcObject, null); assert.ok(h.stopCount > 0); assert.equal(h.timers.size, 0);
});
test('iPhone bypasses native detection, uses 4K/zoom/ROI and reads exactly once', async () => {
  const h = harness({ ios: true, detect: () => [{ rawValue: '7290119370177' }] });
  await h.start(); await h.tick();
  assert.equal(h.calls.native, 0); assert.equal(h.calls.wasm, 1); assert.equal(h.calls.camera[0].video.width.ideal, 3840);
  assert.ok(h.calls.constraints.some(c => c.advanced[0].zoom === 2));
  assert.notEqual(h.calls.sources[0], h.video); assert.ok(h.calls.sources[0].width < h.video.videoWidth);
  assert.deepEqual(h.calls.codes, ['7290119370177']);
});
test('partial native support falls back to WASM instead of scanning forever with QR only', async () => {
  const h = harness({ formats: ['qr_code'] }); const stop = await h.start();
  assert.equal(h.calls.native, 0); assert.equal(h.calls.wasm, 1); stop();
});
test('WASM load failure keeps a working ZXing fallback with a session-owned stream', async () => {
  const h = harness({ ios: true, wasmFails: true }); await h.start();
  assert.equal(h.calls.fallback, 1); assert.equal(h.calls.fallbackStream, h.stream);
  h.calls.deliver('72940761'); h.calls.deliver('duplicate');
  assert.deepEqual(h.calls.codes, ['72940761']); assert.equal(h.video.srcObject, null);
});
test('dismissal while camera permission is pending releases late stream', async () => {
  let release;
  const h = harness({ camera: stream => new Promise(resolve => { release = () => resolve(stream); }) });
  const pending = h.start(); while (!release) await new Promise(setImmediate);
  h.cancel(); release(); await pending;
  assert.equal(h.video.srcObject, null); assert.ok(h.stopCount > 0); assert.deepEqual(h.calls.codes, []);
});
test('late result from an old session cannot add a barcode or stop a replacement camera', async () => {
  let release;
  const h = harness({ detect: () => new Promise(resolve => { release = resolve; }) });
  const stop = await h.start(), pending = h.tick();
  stop(); const replacement = { getTracks: () => [{ stop() { throw new Error('new camera was stopped'); } }] }; h.video.srcObject = replacement;
  release([{ rawValue: 'stale' }]); await pending;
  assert.equal(h.video.srcObject, replacement); assert.deepEqual(h.calls.codes, []); assert.equal(h.timers.size, 0);
});
test('torch changes follow supported track and stop removes its handler', async () => {
  const h = harness(); const stop = await h.start(); assert.equal(h.buttons.hidden, false);
  h.buttons.dispatchEvent(new Event('click')); await new Promise(setImmediate);
  assert.equal(h.buttons.attrs['aria-pressed'], 'true'); stop(); const count = h.calls.constraints.length;
  h.buttons.dispatchEvent(new Event('click')); await new Promise(setImmediate); assert.equal(h.calls.constraints.length, count);
});
test('permission denial returns an actionable Hebrew error', async () => {
  const h = harness({ camera: () => { const e = new Error(); e.name = 'NotAllowedError'; throw e; } });
  await assert.rejects(h.start(), /לא ניתנה הרשאה/); assert.equal(h.video.srcObject, null);
});
test('all eight ROI passes run, including full frame, with no overlapping decodes', async () => {
  const h = harness({ ios: true }); const stop = await h.start();
  for (let i = 0; i < 8; i++) await h.tick();
  assert.equal(h.calls.sources.length, 8); assert.equal(h.calls.sources[7].width, 1280); stop();
});

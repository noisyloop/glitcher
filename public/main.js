'use strict';

import * as FX from './glitch.js';

/* ============================================================
 * Control configuration — drives both the UI and the pipeline.
 * Each control: key, label, type, min/max/step, default (neutral).
 * ============================================================ */

const GROUPS = [
  {
    title: 'PIXEL / COLOR',
    controls: [
      { key: 'pixelate', label: 'pixelate', min: 1, max: 64, step: 1, def: 1 },
      { key: 'bitcrush', label: 'bitcrush (bits)', min: 1, max: 8, step: 1, def: 8 },
      { key: 'channel_shift_r', label: 'channel_shift_r', min: -100, max: 100, step: 1, def: 0 },
      { key: 'channel_shift_g', label: 'channel_shift_g', min: -100, max: 100, step: 1, def: 0 },
      { key: 'channel_shift_b', label: 'channel_shift_b', min: -100, max: 100, step: 1, def: 0 },
      { key: 'hue_rotate', label: 'hue_rotate (°)', min: 0, max: 360, step: 1, def: 0 },
      { key: 'saturation', label: 'saturation', min: 0, max: 3, step: 0.01, def: 1 },
      { key: 'invert', label: 'invert', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'threshold', label: 'threshold', min: 0, max: 255, step: 1, def: 0 }
    ]
  },
  {
    title: 'SCAN / RASTER',
    controls: [
      { key: 'scanlines', label: 'scanlines', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'scanline_gap', label: 'scanline_gap (px)', min: 1, max: 20, step: 1, def: 2 },
      { key: 'interlace', label: 'interlace (px)', min: 0, max: 80, step: 1, def: 0 },
      { key: 'crt_curve', label: 'crt_curve', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'phosphor_blur', label: 'phosphor_blur (px)', min: 0, max: 10, step: 1, def: 0 }
    ]
  },
  {
    title: 'GLITCH / CORRUPTION',
    controls: [
      { key: 'slice_shift', label: 'slice_shift', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'slice_count', label: 'slice_count', min: 1, max: 60, step: 1, def: 12 },
      { key: 'block_displacement', label: 'block_displacement', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'noise_amount', label: 'noise_amount', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'jpeg_artifact', label: 'jpeg_artifact', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'row_shift_chaos', label: 'row_shift_chaos (px)', min: 0, max: 80, step: 1, def: 0 },
      { key: 'data_bend', label: 'data_bend', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'ghost', label: 'ghost (opacity)', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'ghost_x', label: 'ghost_x (px)', min: -100, max: 100, step: 1, def: 8 },
      { key: 'ghost_y', label: 'ghost_y (px)', min: -100, max: 100, step: 1, def: 8 }
    ]
  },
  {
    title: 'TEMPORAL / MOTION',
    hint: 'frame_blend stores the previous render and blends it back — drives persistence trails for datamosh.',
    controls: [
      { key: 'frame_blend', label: 'frame_blend', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'time_pixel', label: 'time_pixel (intensity)', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'time_pixel_bands', label: 'time_pixel band_count', min: 1, max: 32, step: 1, def: 8 },
      { key: 'pixel_sort_threshold', label: 'pixel_sort_threshold', min: 0, max: 255, step: 1, def: 0 },
      { key: 'pixel_sort_direction', label: 'pixel_sort_direction (vertical)', type: 'checkbox', def: 0 }
    ]
  },
  {
    title: 'DATAMOSH',
    hint: 'Needs frame_blend > 0 to reveal the temporal P-frame smear (datamosh_decay bleeds the previous frame through).',
    controls: [
      { key: 'datamosh_blocks', label: 'datamosh_blocks', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'datamosh_block_size', label: 'datamosh_block_size (px)', min: 4, max: 64, step: 1, def: 16 },
      { key: 'datamosh_direction_x', label: 'datamosh_direction_x', min: -50, max: 50, step: 1, def: 0 },
      { key: 'datamosh_direction_y', label: 'datamosh_direction_y', min: -50, max: 50, step: 1, def: 0 },
      { key: 'datamosh_decay', label: 'datamosh_decay', min: 0, max: 1, step: 0.01, def: 0 }
    ]
  },
  {
    title: 'GEOMETRY',
    controls: [
      { key: 'zoom', label: 'zoom (x)', min: 0.5, max: 3, step: 0.01, def: 1 },
      { key: 'rotate', label: 'rotate (°)', min: 0, max: 360, step: 1, def: 0 },
      { key: 'mirror_x', label: 'mirror_x', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'mirror_y', label: 'mirror_y', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'wave_warp', label: 'wave_warp (amp px)', min: 0, max: 80, step: 1, def: 0 },
      { key: 'wave_warp_freq', label: 'wave_warp_freq', min: 1, max: 20, step: 1, def: 4 }
    ]
  }
];

// Flat lookup of every control by key.
const CONTROLS = {};
for (const g of GROUPS) for (const c of g.controls) CONTROLS[c.key] = c;

/* ============================================================
 * State
 * ============================================================ */

const state = {};                 // key -> current value
for (const k in CONTROLS) state[k] = CONTROLS[k].def;

let sourceImageData = null;       // native-resolution source
let prevFrame = null;             // previous render output (temporal effects)
let frameSeed = 1;                // bumped each render -> time-variable effects move
let rendering = false;
let renderQueued = false;

// Security limits for imported images.
const MAX_FILE_BYTES = 30 * 1024 * 1024;   // 30 MB hard cap
const MAX_DIMENSION = 2400;                // clamp very large images to bound memory/CPU
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

/* ============================================================
 * DOM
 * ============================================================ */

const els = {
  fileInput: document.getElementById('fileInput'),
  exportBtn: document.getElementById('exportBtn'),
  randomizeBtn: document.getElementById('randomizeBtn'),
  resetBtn: document.getElementById('resetBtn'),
  controls: document.getElementById('controls'),
  original: document.getElementById('originalCanvas'),
  output: document.getElementById('outputCanvas'),
  meta: document.getElementById('meta'),
  status: document.getElementById('status')
};
const origCtx = els.original.getContext('2d');
const outCtx = els.output.getContext('2d');

const valueEls = {};   // key -> value display span
const inputEls = {};   // key -> input element

function setStatus(text) { els.status.textContent = text; }

/* ============================================================
 * Build the control UI (no innerHTML with dynamic data -> no XSS surface)
 * ============================================================ */

function fmt(c, v) {
  if (c.type === 'checkbox') return v ? 'on' : 'off';
  return c.step < 1 ? Number(v).toFixed(2) : String(Math.round(v));
}

function buildControls() {
  for (const group of GROUPS) {
    const gEl = document.createElement('div');
    gEl.className = 'group';

    const title = document.createElement('h3');
    title.className = 'group-title';
    title.textContent = group.title;
    gEl.appendChild(title);

    if (group.hint) {
      const hint = document.createElement('div');
      hint.className = 'group-hint';
      hint.textContent = '↳ ' + group.hint;
      gEl.appendChild(hint);
    }

    for (const c of group.controls) {
      const ctrl = document.createElement('div');
      ctrl.className = 'ctrl' + (c.type === 'checkbox' ? ' ctrl-check' : '');

      const row = document.createElement('div');
      row.className = 'ctrl-row';
      const label = document.createElement('span');
      label.className = 'ctrl-label';
      label.textContent = c.label;
      const val = document.createElement('span');
      val.className = 'ctrl-value';
      val.textContent = fmt(c, state[c.key]);
      row.appendChild(label);
      row.appendChild(val);
      ctrl.appendChild(row);

      let input;
      if (c.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!state[c.key];
        input.addEventListener('change', () => {
          state[c.key] = input.checked ? 1 : 0;
          val.textContent = fmt(c, state[c.key]);
          scheduleRender();
        });
        row.insertBefore(input, val);
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = c.min; input.max = c.max; input.step = c.step;
        input.value = state[c.key];
        input.addEventListener('input', () => {
          state[c.key] = parseFloat(input.value);
          val.textContent = fmt(c, state[c.key]);
          scheduleRender();
        });
        ctrl.appendChild(input);
      }

      valueEls[c.key] = val;
      inputEls[c.key] = input;
      gEl.appendChild(ctrl);
    }
    els.controls.appendChild(gEl);
  }
}

function syncInputs() {
  for (const k in CONTROLS) {
    const c = CONTROLS[k];
    const input = inputEls[k];
    if (c.type === 'checkbox') input.checked = !!state[k];
    else input.value = state[k];
    valueEls[k].textContent = fmt(c, state[k]);
  }
}

/* ============================================================
 * Pipeline
 * ============================================================ */

const v = (k) => state[k];

async function runPipeline(srcImageData) {
  let d = srcImageData;          // glitch.js never mutates input, so this is safe
  const seed = frameSeed;

  // --- Pixel / Color ---
  d = FX.pixelate(d, v('pixelate'));
  d = FX.bitcrush(d, v('bitcrush'));
  d = FX.channel_shift_r(d, v('channel_shift_r'));
  d = FX.channel_shift_g(d, v('channel_shift_g'));
  d = FX.channel_shift_b(d, v('channel_shift_b'));
  d = FX.hue_rotate(d, v('hue_rotate'));
  d = FX.saturation(d, v('saturation'));
  d = FX.invert(d, v('invert'));
  d = FX.threshold(d, v('threshold'));

  // --- Scan / Raster ---
  d = FX.scanlines(d, v('scanlines'), v('scanline_gap'));
  d = FX.interlace(d, v('interlace'));
  d = FX.crt_curve(d, v('crt_curve'));
  d = FX.phosphor_blur(d, v('phosphor_blur'));

  // --- Glitch / Corruption ---
  d = FX.slice_shift(d, v('slice_shift'), v('slice_count'), seed + 11);
  d = FX.block_displacement(d, v('block_displacement'), seed + 23);
  d = FX.noise_amount(d, v('noise_amount'));
  d = await FX.jpeg_artifact(d, v('jpeg_artifact'));
  d = FX.row_shift_chaos(d, v('row_shift_chaos'), seed + 37);
  d = FX.data_bend(d, v('data_bend'), seed + 51);
  d = FX.ghost(d, v('ghost'), v('ghost_x'), v('ghost_y'));

  // --- Temporal / Motion ---
  d = FX.time_pixel(d, v('time_pixel'), v('time_pixel_bands'), seed + 67, Math.max(1, v('pixelate')));
  d = FX.pixel_sort(d, v('pixel_sort_threshold'), !!v('pixel_sort_direction'));
  d = FX.frame_blend(d, v('frame_blend'), prevFrame);

  // --- Datamosh ---
  d = FX.datamosh_blocks(
    d, v('datamosh_blocks'), v('datamosh_block_size'),
    v('datamosh_direction_x'), v('datamosh_direction_y'),
    v('datamosh_decay'), prevFrame
  );

  // --- Geometry ---
  d = FX.zoom(d, v('zoom'));
  d = FX.rotate(d, v('rotate'));
  d = FX.mirror_x(d, v('mirror_x'));
  d = FX.mirror_y(d, v('mirror_y'));
  d = FX.wave_warp(d, v('wave_warp'), v('wave_warp_freq'));

  return d;
}

async function render() {
  if (!sourceImageData) return;
  if (rendering) { renderQueued = true; return; }
  rendering = true;
  try {
    frameSeed = (frameSeed + 1) >>> 0;
    const result = await runPipeline(sourceImageData);
    drawTo(els.output, outCtx, result);
    // store a copy for temporal effects on the next render
    prevFrame = new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
  } catch (err) {
    console.error('render failed', err);
    setStatus('render error');
  } finally {
    rendering = false;
    if (renderQueued) { renderQueued = false; render(); }
  }
}

// ~30ms debounce
let debounceTimer = null;
function scheduleRender() {
  if (!sourceImageData) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 30);
}

function drawTo(canvas, ctx, imgData) {
  if (canvas.width !== imgData.width) canvas.width = imgData.width;
  if (canvas.height !== imgData.height) canvas.height = imgData.height;
  ctx.putImageData(imgData, 0, 0);
}

/* ============================================================
 * Import (hardened)
 * ============================================================ */

// Validate by sniffing the real magic bytes — never trust the reported MIME
// type or the file extension alone.
function sniffType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  return null;
}

async function handleFile(file) {
  if (!file) return;

  // 1) reported type gate
  if (!ALLOWED_TYPES.has(file.type)) {
    setStatus('rejected: not jpg/png');
    els.meta.textContent = 'import rejected — only JPG/PNG allowed';
    return;
  }
  // 2) size gate
  if (file.size > MAX_FILE_BYTES) {
    setStatus('rejected: too large');
    els.meta.textContent = `import rejected — file exceeds ${(MAX_FILE_BYTES / 1048576) | 0}MB`;
    return;
  }

  setStatus('decoding…');
  let buf;
  try {
    buf = await file.arrayBuffer();
  } catch {
    setStatus('read error');
    return;
  }

  // 3) magic-byte gate — defends against a renamed/spoofed file
  const head = new Uint8Array(buf.slice(0, 8));
  const sniffed = sniffType(head);
  if (!sniffed || sniffed !== file.type) {
    setStatus('rejected: bad signature');
    els.meta.textContent = 'import rejected — file content is not a valid JPG/PNG';
    return;
  }

  // 4) decode in isolation via createImageBitmap (no DOM attachment, no SVG/script vectors)
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([buf], { type: sniffed }));
  } catch {
    setStatus('decode error');
    els.meta.textContent = 'import rejected — image could not be decoded';
    return;
  }

  // 5) clamp dimensions to bound memory/CPU
  let w = bitmap.width, h = bitmap.height;
  if (w < 1 || h < 1) { bitmap.close(); setStatus('decode error'); return; }
  let scale = 1;
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    scale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }

  // draw the source into the original canvas
  els.original.width = w; els.original.height = h;
  origCtx.clearRect(0, 0, w, h);
  origCtx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  sourceImageData = origCtx.getImageData(0, 0, w, h);
  prevFrame = null;

  // Filename is shown via textContent (not innerHTML) so it can't inject markup.
  const noteScale = scale < 1 ? ` (scaled from larger source)` : '';
  els.meta.textContent = `${file.name} — ${w}×${h}${noteScale}`;
  els.exportBtn.disabled = false;
  setStatus('ready');
  render();
}

els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleFile(file);
  // reset so re-selecting the same file fires change again
  els.fileInput.value = '';
});

/* ============================================================
 * Export
 * ============================================================ */

async function exportPng() {
  if (!sourceImageData) return;
  setStatus('rendering export…');
  // render the full pipeline at native resolution
  const result = await runPipeline(sourceImageData);
  const c = document.createElement('canvas');
  c.width = result.width; c.height = result.height;
  c.getContext('2d').putImageData(result, 0, 0);

  c.toBlob((blob) => {
    if (!blob) { setStatus('export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glitch_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('exported');
  }, 'image/png');
}

els.exportBtn.addEventListener('click', exportPng);

/* ============================================================
 * Randomize / Reset
 * ============================================================ */

function randomizeAll() {
  for (const k in CONTROLS) {
    const c = CONTROLS[k];
    if (c.type === 'checkbox') {
      state[k] = Math.random() < 0.5 ? 1 : 0;
    } else {
      const raw = c.min + Math.random() * (c.max - c.min);
      state[k] = c.step < 1 ? Math.round(raw / c.step) * c.step : Math.round(raw);
    }
  }
  syncInputs();
  setStatus('randomized');
  render();
}

function resetAll() {
  for (const k in CONTROLS) state[k] = CONTROLS[k].def;
  prevFrame = null;
  syncInputs();
  setStatus('reset');
  render();
}

els.randomizeBtn.addEventListener('click', randomizeAll);
els.resetBtn.addEventListener('click', resetAll);

/* ============================================================
 * Init
 * ============================================================ */

buildControls();
setStatus('no signal');

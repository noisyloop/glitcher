'use strict';

/*
 * io.js — file import, source/output canvases, and PNG export.
 *
 * Owns everything image-IO: the hardened file input, drawing the decoded
 * source into the original-preview canvas, writing pipeline output to the
 * output canvas, and exporting a PNG. It knows nothing about sliders/effects;
 * callers hand it ImageData and a provider for the export frame.
 */

import { setStatus } from './ui.js';

// Security limits for imported images.
const MAX_FILE_BYTES = 30 * 1024 * 1024;   // 30 MB hard cap
const MAX_DIMENSION = 2400;                // clamp very large images to bound memory/CPU
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

const els = {
  fileInput: document.getElementById('fileInput'),
  exportBtn: document.getElementById('exportBtn'),
  original: document.getElementById('originalCanvas'),
  output: document.getElementById('outputCanvas'),
  meta: document.getElementById('meta')
};
const origCtx = els.original.getContext('2d');
const outCtx = els.output.getContext('2d');

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

function drawTo(canvas, ctx, imgData) {
  if (canvas.width !== imgData.width) canvas.width = imgData.width;
  if (canvas.height !== imgData.height) canvas.height = imgData.height;
  ctx.putImageData(imgData, 0, 0);
}

// Draw a pipeline result into the output preview canvas.
export function drawOutput(imgData) {
  drawTo(els.output, outCtx, imgData);
}

async function handleFile(file, onImport) {
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

  const sourceImageData = origCtx.getImageData(0, 0, w, h);

  // Filename is shown via textContent (not innerHTML) so it can't inject markup.
  const noteScale = scale < 1 ? ' (scaled from larger source)' : '';
  els.meta.textContent = `${file.name} — ${w}×${h}${noteScale}`;
  els.exportBtn.disabled = false;
  setStatus('ready');

  onImport(sourceImageData);
}

/**
 * Wire the file input.
 * @param {(sourceImageData: ImageData) => void} onImport
 */
export function initImport(onImport) {
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file, onImport);
    // reset so re-selecting the same file fires change again
    els.fileInput.value = '';
  });
}

/**
 * Wire the export button.
 * @param {() => (ImageData | Promise<ImageData|null>)} getExportImageData
 */
export function initExport(getExportImageData) {
  els.exportBtn.addEventListener('click', async () => {
    setStatus('rendering export…');
    const result = await getExportImageData();
    if (!result) { setStatus('export failed'); return; }

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
  });
}

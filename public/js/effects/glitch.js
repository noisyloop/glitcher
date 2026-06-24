'use strict';

/*
 * glitch.js — Glitch / Corruption effects.
 * slice_shift (+ slice_count param), block_displacement, noise_amount,
 * jpeg_artifact, row_shift_chaos, data_bend, ghost (+ ghost_x/ghost_y params)
 */

import { cloneImageData, clamp8, makeRng, scratch } from './util.js';

// EFFECT: slice_shift — randomly shift horizontal slices sideways. value = intensity (0-1), extra = count, seed.
export function slice_shift(img, intensity, count = 12, seed = 1) {
  if (intensity <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const slices = Math.max(1, Math.round(count));
  const out = cloneImageData(img);
  const dst = out.data;
  const rng = makeRng(seed);
  const sliceH = Math.ceil(h / slices);
  const maxShift = intensity * w;
  for (let s = 0; s < slices; s++) {
    const shift = Math.round((rng() * 2 - 1) * maxShift);
    if (shift === 0) continue;
    const y0 = s * sliceH;
    const y1 = Math.min(y0 + sliceH, h);
    for (let y = y0; y < y1; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const sx = ((x - shift) % w + w) % w;
        const di = (row + x) * 4, si = (row + sx) * 4;
        dst[di] = src[si]; dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
      }
    }
  }
  return out;
}

// EFFECT: block_displacement — randomly move rectangular blocks. value = intensity (0-1), extra = seed.
export function block_displacement(img, intensity, seed = 1) {
  if (intensity <= 0) return img;
  const { width: w, height: h } = img;
  const out = cloneImageData(img);
  const src = img.data, dst = out.data;
  const rng = makeRng(seed);
  const count = Math.round(intensity * 40);
  const maxBw = Math.max(8, (w * 0.4) | 0);
  const maxBh = Math.max(8, (h * 0.2) | 0);
  for (let c = 0; c < count; c++) {
    const bw = 8 + ((rng() * maxBw) | 0);
    const bh = 4 + ((rng() * maxBh) | 0);
    const sx = (rng() * (w - bw)) | 0;
    const sy = (rng() * (h - bh)) | 0;
    const dx = Math.max(0, Math.min(w - bw, sx + (((rng() * 2 - 1) * intensity * w) | 0)));
    const dy = Math.max(0, Math.min(h - bh, sy + (((rng() * 2 - 1) * intensity * h * 0.3) | 0)));
    for (let y = 0; y < bh; y++) {
      const sRow = ((sy + y) * w + sx) * 4;
      const dRow = ((dy + y) * w + dx) * 4;
      for (let x = 0; x < bw * 4; x++) dst[dRow + x] = src[sRow + x];
    }
  }
  return out;
}

// EFFECT: noise_amount — add random color pixel noise. value = amount (0-1).
export function noise_amount(img, amt) {
  if (amt <= 0) return img;
  const out = cloneImageData(img);
  const d = out.data;
  const k = amt * 255;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp8(d[i] + (Math.random() - 0.5) * k);
    d[i + 1] = clamp8(d[i + 1] + (Math.random() - 0.5) * k);
    d[i + 2] = clamp8(d[i + 2] + (Math.random() - 0.5) * k);
  }
  return out;
}

// EFFECT: jpeg_artifact — heavy JPEG recompression at low quality. value = amount (0-1). ASYNC.
export async function jpeg_artifact(img, amt) {
  if (amt <= 0) return img;
  const { width: w, height: h } = img;
  const { canvas, ctx } = scratch(w, h);
  ctx.putImageData(img, 0, 0);
  // amount 0..1 maps to quality 1.0 .. 0.01
  const quality = Math.max(0.01, 1 - amt * 0.99);
  const blob = await new Promise((res) =>
    canvas.toBlob(res, 'image/jpeg', quality)
  );
  if (!blob) return img;
  const bmp = await createImageBitmap(blob);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

// EFFECT: row_shift_chaos — random horizontal shift per row (time-variable). value = max px (0-80), extra = seed.
export function row_shift_chaos(img, amount, seed = 1) {
  if (amount <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  const rng = makeRng(seed);
  for (let y = 0; y < h; y++) {
    const shift = Math.round((rng() * 2 - 1) * amount);
    if (shift === 0) continue;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const sx = ((x - shift) % w + w) % w;
      const di = (row + x) * 4, si = (row + sx) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
    }
  }
  return out;
}

// EFFECT: data_bend — corrupt raw pixel byte runs by offsetting them (hex-edit sim). value = amount (0-1), extra = seed.
export function data_bend(img, amount, seed = 1) {
  if (amount <= 0) return img;
  const out = cloneImageData(img);
  const d = out.data;
  const len = d.length;
  const rng = makeRng(seed);
  const runs = Math.round(amount * 60);
  const maxRun = Math.max(16, (len * amount * 0.02) | 0);
  for (let r = 0; r < runs; r++) {
    const runLen = 4 + ((rng() * maxRun) | 0);
    const from = (rng() * (len - runLen)) | 0;
    const to = (rng() * (len - runLen)) | 0;
    // copy a run of raw bytes to a different offset (skipping alpha desync is
    // intentional — that's what gives the "broken file" look)
    if (to <= from) {
      for (let i = 0; i < runLen; i++) d[to + i] = d[from + i];
    } else {
      for (let i = runLen - 1; i >= 0; i--) d[to + i] = d[from + i];
    }
  }
  return out;
}

// EFFECT: ghost — overlay a semi-transparent offset copy. value = opacity (0-1), extra = offX, offY.
export function ghost(img, opacity, offX = 0, offY = 0) {
  if (opacity <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  const ox = Math.round(offX), oy = Math.round(offY);
  for (let y = 0; y < h; y++) {
    const sy = y - oy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x - ox;
      if (sx < 0 || sx >= w) continue;
      const di = (y * w + x) * 4, si = (sy * w + sx) * 4;
      dst[di] = dst[di] * (1 - opacity) + src[si] * opacity;
      dst[di + 1] = dst[di + 1] * (1 - opacity) + src[si + 1] * opacity;
      dst[di + 2] = dst[di + 2] * (1 - opacity) + src[si + 2] * opacity;
    }
  }
  return out;
}

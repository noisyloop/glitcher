'use strict';

/*
 * geometry.js — Geometry effects.
 * zoom, rotate, mirror_x, mirror_y, wave_warp (+ wave_warp_freq param)
 */

import { cloneImageData, scratch } from './util.js';

// EFFECT: zoom — center zoom. value = factor (0.5-3, neutral 1).
export function zoom(img, factor) {
  if (factor === 1) return img;
  const { width: w, height: h } = img;
  // snapshot the source into a second canvas so we can draw it scaled.
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').putImageData(img, 0, 0);

  const { ctx } = scratch(w, h);
  ctx.clearRect(0, 0, w, h);
  const sw = w / factor, sh = h / factor;
  const sx = (w - sw) / 2, sy = (h - sh) / 2;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// EFFECT: rotate — rotate around center. value = degrees (0-360).
export function rotate(img, deg) {
  if (deg % 360 === 0) return img;
  const { width: w, height: h } = img;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').putImageData(img, 0, 0);

  const { ctx } = scratch(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2);
  ctx.restore();
  return ctx.getImageData(0, 0, w, h);
}

// EFFECT: mirror_x — blend with horizontally mirrored image. value = amount (0-1).
export function mirror_x(img, amt) {
  if (amt <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const mx = w - 1 - x;
      const di = (row + x) * 4, si = (row + mx) * 4;
      d[di] = d[di] * (1 - amt) + src[si] * amt;
      d[di + 1] = d[di + 1] * (1 - amt) + src[si + 1] * amt;
      d[di + 2] = d[di + 2] * (1 - amt) + src[si + 2] * amt;
    }
  }
  return out;
}

// EFFECT: mirror_y — blend with vertically mirrored image. value = amount (0-1).
export function mirror_y(img, amt) {
  if (amt <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    const my = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4, si = (my * w + x) * 4;
      d[di] = d[di] * (1 - amt) + src[si] * amt;
      d[di + 1] = d[di + 1] * (1 - amt) + src[si + 1] * amt;
      d[di + 2] = d[di + 2] * (1 - amt) + src[si + 2] * amt;
    }
  }
  return out;
}

// EFFECT: wave_warp — sine-wave horizontal warp. value = amplitude px (0-80), extra = frequency (1-20).
export function wave_warp(img, amplitude, frequency = 4) {
  if (amplitude <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  const f = (frequency * Math.PI * 2) / h;
  for (let y = 0; y < h; y++) {
    const shift = Math.round(Math.sin(y * f) * amplitude);
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

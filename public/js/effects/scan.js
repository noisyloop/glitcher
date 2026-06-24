'use strict';

/*
 * scan.js — Scan / Raster effects.
 * scanlines (+ scanline_gap param), interlace, crt_curve, phosphor_blur
 */

import { cloneImageData, emptyLike } from './util.js';

// EFFECT: scanlines — darken horizontal scanlines. value = darkness (0-1), extra = gap px.
export function scanlines(img, darkness, gap = 2) {
  if (darkness <= 0) return img;
  const g = Math.max(1, Math.round(gap));
  const { width: w, height: h } = img;
  const out = cloneImageData(img);
  const d = out.data;
  const f = 1 - darkness;
  for (let y = 0; y < h; y++) {
    if (y % g !== 0) continue;
    let i = y * w * 4;
    for (let x = 0; x < w; x++) {
      d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      i += 4;
    }
  }
  return out;
}

// EFFECT: interlace — shift alternating rows left/right. value = px (0-80).
export function interlace(img, px) {
  const shift = Math.round(px);
  if (shift === 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    const dir = y % 2 === 0 ? shift : -shift;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sx = ((x - dir) % w + w) % w;
      const di = (row + x) * 4, si = (row + sx) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
    }
  }
  return out;
}

// EFFECT: crt_curve — fake barrel distortion (warp edges inward). value = amount (0-1).
export function crt_curve(img, amount) {
  if (amount <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = emptyLike(img);
  const dst = out.data;
  const k = amount * 0.35;
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / cx;
      const r2 = nx * nx + ny * ny;
      const f = 1 + k * r2;
      const sx = Math.round(cx + nx * cx * f);
      const sy = Math.round(cy + ny * cy * f);
      const di = (y * w + x) * 4;
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
        dst[di + 3] = 255; // out of bounds -> black
        continue;
      }
      const si = (sy * w + sx) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
    }
  }
  return out;
}

// EFFECT: phosphor_blur — vertical smear per scanline. value = radius px (0-10).
export function phosphor_blur(img, px) {
  const r = Math.round(px);
  if (r <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const si = (yy * w + x) * 4;
        sr += src[si]; sg += src[si + 1]; sb += src[si + 2]; n++;
      }
      const di = (y * w + x) * 4;
      dst[di] = sr / n; dst[di + 1] = sg / n; dst[di + 2] = sb / n;
    }
  }
  return out;
}

'use strict';

/*
 * pixel.js — Pixel / Color effects.
 * pixelate, bitcrush, channel_shift_r/g/b, hue_rotate, saturation, invert, threshold
 *
 * Convention: each effect is `(imageData, value, ...extra) => ImageData` and
 * never mutates its input (returns a new ImageData, or the original unchanged
 * when the value is at its neutral/no-op position).
 */

import { cloneImageData, clamp8, luma } from './util.js';

// EFFECT: pixelate — block-pixel downscale (CryptoPunk style). value = block size.
export function pixelate(img, size) {
  const n = Math.round(size);
  if (n <= 1) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  for (let by = 0; by < h; by += n) {
    for (let bx = 0; bx < w; bx += n) {
      // sample the block's top-left pixel
      const si = (by * w + bx) * 4;
      const r = src[si], g = src[si + 1], b = src[si + 2], a = src[si + 3];
      const ymax = Math.min(by + n, h);
      const xmax = Math.min(bx + n, w);
      for (let y = by; y < ymax; y++) {
        let di = (y * w + bx) * 4;
        for (let x = bx; x < xmax; x++) {
          dst[di] = r; dst[di + 1] = g; dst[di + 2] = b; dst[di + 3] = a;
          di += 4;
        }
      }
    }
  }
  return out;
}

// EFFECT: bitcrush — reduce color depth per channel (posterize). value = bits (1-8).
export function bitcrush(img, bits) {
  const b = Math.round(bits);
  if (b >= 8) return img;
  const levels = Math.pow(2, b);
  const step = 255 / (levels - 1);
  const out = cloneImageData(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(Math.round(d[i] / step) * step);
    d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
    d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
  }
  return out;
}

function channelShift(img, px, channel) {
  const shift = Math.round(px);
  if (shift === 0) return img;
  const { width: w, height: h, data: src } = img;
  const out = cloneImageData(img);
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sx = x - shift;
      sx = ((sx % w) + w) % w; // wrap
      dst[(row + x) * 4 + channel] = src[(row + sx) * 4 + channel];
    }
  }
  return out;
}

// EFFECT: channel_shift_r — shift the red channel horizontally. value = px (-100..100).
export function channel_shift_r(img, px) { return channelShift(img, px, 0); }
// EFFECT: channel_shift_g — shift the green channel horizontally. value = px (-100..100).
export function channel_shift_g(img, px) { return channelShift(img, px, 1); }
// EFFECT: channel_shift_b — shift the blue channel horizontally. value = px (-100..100).
export function channel_shift_b(img, px) { return channelShift(img, px, 2); }

// EFFECT: hue_rotate — rotate hue. value = degrees (0-360).
export function hue_rotate(img, deg) {
  if (deg % 360 === 0) return img;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // standard hue-rotation matrix
  const m = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072
  ];
  const out = cloneImageData(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = clamp8(r * m[0] + g * m[1] + b * m[2]);
    d[i + 1] = clamp8(r * m[3] + g * m[4] + b * m[5]);
    d[i + 2] = clamp8(r * m[6] + g * m[7] + b * m[8]);
  }
  return out;
}

// EFFECT: saturation — 0 (grayscale) to 3 (oversaturated). value = factor.
export function saturation(img, s) {
  if (s === 1) return img;
  const out = cloneImageData(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d[i], d[i + 1], d[i + 2]);
    d[i] = clamp8(l + (d[i] - l) * s);
    d[i + 1] = clamp8(l + (d[i + 1] - l) * s);
    d[i + 2] = clamp8(l + (d[i + 2] - l) * s);
  }
  return out;
}

// EFFECT: invert — blend with the inverted image. value = amount (0-1).
export function invert(img, amt) {
  if (amt <= 0) return img;
  const out = cloneImageData(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (255 - 2 * d[i]) * amt;
    d[i + 1] = d[i + 1] + (255 - 2 * d[i + 1]) * amt;
    d[i + 2] = d[i + 2] + (255 - 2 * d[i + 2]) * amt;
  }
  return out;
}

// EFFECT: threshold — posterize to pure black/white. value = threshold (1-255, 0 = off).
export function threshold(img, t) {
  if (t <= 0) return img;
  const out = cloneImageData(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = luma(d[i], d[i + 1], d[i + 2]) >= t ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return out;
}

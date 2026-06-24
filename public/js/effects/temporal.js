'use strict';

/*
 * temporal.js — Temporal / Motion effects.
 * frame_blend, time_pixel (+ time_pixel_bands param),
 * pixel_sort_threshold (+ pixel_sort_direction param)
 */

import { cloneImageData, makeRng, luma } from './util.js';

// EFFECT: frame_blend — blend current state with a stored previous state. value = amount (0-1), extra = prev ImageData.
export function frame_blend(img, amount, prev) {
  if (amount <= 0 || !prev || prev.width !== img.width || prev.height !== img.height) return img;
  const out = cloneImageData(img);
  const d = out.data, p = prev.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * (1 - amount) + p[i] * amount;
    d[i + 1] = d[i + 1] * (1 - amount) + p[i + 1] * amount;
    d[i + 2] = d[i + 2] * (1 - amount) + p[i + 2] * amount;
  }
  return out;
}

// EFFECT: time_pixel — quantize image into time-sliced horizontal bands, each at a snapped random x-offset.
//   value = intensity (0-1), extra = bandCount, seed, gridSnap.
export function time_pixel(img, intensity, bandCount = 8, seed = 1, gridSnap = 8) {
  if (intensity <= 0) return img;
  const { width: w, height: h, data: src } = img;
  const bands = Math.max(1, Math.round(bandCount));
  const out = cloneImageData(img);
  const dst = out.data;
  const rng = makeRng(seed);
  const grid = Math.max(1, Math.round(gridSnap));
  const bandH = Math.ceil(h / bands);
  const maxShift = intensity * w;
  for (let b = 0; b < bands; b++) {
    let shift = Math.round((rng() * 2 - 1) * maxShift);
    shift = Math.round(shift / grid) * grid; // snap to pixelate grid
    const y0 = b * bandH;
    const y1 = Math.min(y0 + bandH, h);
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

// EFFECT: pixel_sort_threshold — sort row/column runs by brightness below a threshold.
//   value = threshold (1-255, 0=off), extra = vertical (pixel_sort_direction).
export function pixel_sort_threshold(img, thr, vertical = false) {
  if (thr <= 0) return img;
  const out = cloneImageData(img);
  const { width: w, height: h } = out;
  const d = out.data;

  const sortLine = (indices) => {
    // walk the line, collect contiguous runs of "dark" pixels and sort them
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        run.sort((a, b) => a.l - b.l);
        // write sorted colors back into the original positions (ascending)
        for (let k = 0; k < run.length; k++) {
          const pos = run[k].pos;
          const c = run[k].c;
          d[pos] = c[0]; d[pos + 1] = c[1]; d[pos + 2] = c[2];
        }
      }
      run = [];
    };
    for (let n = 0; n < indices.length; n++) {
      const pos = indices[n];
      const l = luma(d[pos], d[pos + 1], d[pos + 2]);
      if (l < thr) {
        run.push({ pos, l, c: [d[pos], d[pos + 1], d[pos + 2]] });
      } else {
        flush();
      }
    }
    flush();
  };

  if (!vertical) {
    for (let y = 0; y < h; y++) {
      const indices = new Array(w);
      for (let x = 0; x < w; x++) indices[x] = (y * w + x) * 4;
      sortLine(indices);
    }
  } else {
    for (let x = 0; x < w; x++) {
      const indices = new Array(h);
      for (let y = 0; y < h; y++) indices[y] = (y * w + x) * 4;
      sortLine(indices);
    }
  }
  return out;
}

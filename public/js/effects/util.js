'use strict';

/*
 * util.js — shared helpers for the effect modules.
 *
 * These are internal building blocks (PRNG, buffer clones, a reusable
 * offscreen canvas) used by several effect files. They are NOT effects and
 * are never exposed through effects/index.js or the pipeline.
 */

// Reusable offscreen canvas for effects that need 2D context operations.
const _scratch = document.createElement('canvas');
const _scratchCtx = _scratch.getContext('2d', { willReadFrequently: true });

export function scratch(w, h) {
  if (_scratch.width !== w) _scratch.width = w;
  if (_scratch.height !== h) _scratch.height = h;
  _scratchCtx.clearRect(0, 0, w, h);
  return { canvas: _scratch, ctx: _scratchCtx };
}

export function cloneImageData(img) {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

export function emptyLike(img) {
  return new ImageData(img.width, img.height);
}

// Deterministic PRNG (mulberry32) so "time-variable" effects can be reproduced
// for a given seed but vary frame-to-frame when the caller bumps the seed.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

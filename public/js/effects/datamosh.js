'use strict';

/*
 * datamosh.js — Datamosh effects.
 * datamosh_blocks (+ datamosh_block_size, datamosh_direction_x/y, datamosh_decay params)
 */

import { cloneImageData } from './util.js';

// EFFECT: datamosh_blocks — blend each macro-block with a motion-shifted copy of itself (P-frame smear).
//   value = intensity (0-1), extra = blockSize, dx, dy, decay, prev ImageData.
export function datamosh_blocks(img, intensity, blockSize = 16, dx = 0, dy = 0, decay = 0, prev = null) {
  if (intensity <= 0) return img;
  const { width: w, height: h } = img;
  const src = img.data;
  const out = cloneImageData(img);
  const dst = out.data;
  const bs = Math.max(4, Math.round(blockSize));
  const mvx = Math.round(dx), mvy = Math.round(dy);
  const usePrev = decay > 0 && prev && prev.width === w && prev.height === h;
  const ref = usePrev ? prev.data : src; // previous frame data bleeds through

  for (let by = 0; by < h; by += bs) {
    for (let bx = 0; bx < w; bx += bs) {
      const ymax = Math.min(by + bs, h);
      const xmax = Math.min(bx + bs, w);
      for (let y = by; y < ymax; y++) {
        for (let x = bx; x < xmax; x++) {
          // motion-compensated source sample (shifted by the motion vector)
          let sx = x + mvx, sy = y + mvy;
          if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
          if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
          const di = (y * w + x) * 4;
          const si = (sy * w + sx) * 4;
          // blend current block with shifted reference (codec smear)
          let r = src[si], g = src[si + 1], b = src[si + 2];
          if (usePrev) {
            r = r * (1 - decay) + ref[si] * decay;
            g = g * (1 - decay) + ref[si + 1] * decay;
            b = b * (1 - decay) + ref[si + 2] * decay;
          }
          dst[di] = dst[di] * (1 - intensity) + r * intensity;
          dst[di + 1] = dst[di + 1] * (1 - intensity) + g * intensity;
          dst[di + 2] = dst[di + 2] * (1 - intensity) + b * intensity;
        }
      }
    }
  }
  return out;
}

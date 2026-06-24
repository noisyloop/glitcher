'use strict';

/*
 * glitch.js — every visual effect lives here.
 *
 * Convention: each effect is `(imageData, value, ...extra) => ImageData`.
 * Effects must NOT mutate their input ImageData; they return a new one (or the
 * original unchanged when the value is at its neutral/no-op position, so the
 * pipeline stays cheap). `value` is the primary slider; a few effects take
 * extra parameters (slice count, offsets, the previous frame, etc.).
 */

/* ============================ helpers ============================ */

// Reusable offscreen canvas for effects that need 2D context operations.
const _scratch = document.createElement('canvas');
const _scratchCtx = _scratch.getContext('2d', { willReadFrequently: true });

function scratch(w, h) {
  if (_scratch.width !== w) _scratch.width = w;
  if (_scratch.height !== h) _scratch.height = h;
  _scratchCtx.clearRect(0, 0, w, h);
  return { canvas: _scratch, ctx: _scratchCtx };
}

function cloneImageData(img) {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

function emptyLike(img) {
  return new ImageData(img.width, img.height);
}

// Deterministic PRNG (mulberry32) so "time-variable" effects can be reproduced
// for a given seed but vary frame-to-frame when the caller bumps the seed.
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/* ============================ Pixel / Color ============================ */

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

/* ============================ Scan / Raster ============================ */

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

/* ============================ Glitch / Corruption ============================ */

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
  const { canvas } = scratch(w, h);
  _scratchCtx.putImageData(img, 0, 0);
  // amount 0..1 maps to quality 1.0 .. 0.01
  const quality = Math.max(0.01, 1 - amt * 0.99);
  const blob = await new Promise((res) =>
    canvas.toBlob(res, 'image/jpeg', quality)
  );
  if (!blob) return img;
  const bmp = await createImageBitmap(blob);
  _scratchCtx.clearRect(0, 0, w, h);
  _scratchCtx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return _scratchCtx.getImageData(0, 0, w, h);
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

/* ============================ Temporal / Motion ============================ */

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

// EFFECT: pixel_sort — sort row/column runs by brightness below a threshold. value = threshold (1-255, 0=off), extra = vertical.
export function pixel_sort(img, thr, vertical = false) {
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

/* ============================ Datamosh ============================ */

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

/* ============================ Geometry ============================ */

function canvasFromImageData(img) {
  const { canvas, ctx } = scratch(img.width, img.height);
  ctx.putImageData(img, 0, 0);
  return { canvas, ctx };
}

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

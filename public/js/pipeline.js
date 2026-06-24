'use strict';

/*
 * pipeline.js — the effect pipeline runner.
 *
 * `runPipeline(sourceImageData, effectValues)` applies every effect in the
 * order declared by config/effects.json, skipping any effect sitting at its
 * neutral value (and skipping pure-parameter entries, whose values are fed
 * into the effect that owns them). Returns the final ImageData.
 *
 * Temporal state (the previous rendered frame + a per-render seed) lives here
 * so the runner is self-contained; call `resetPipelineState()` to clear it
 * (e.g. on a new import or Reset All).
 */

import effects from './effects/index.js';
import { EFFECTS_CONFIG } from './config.js';
import { cloneImageData } from './effects/util.js';

// --- temporal state ---
let prevFrame = null;       // previous full render output
let frameSeed = 1;          // bumped each render -> time-variable effects move

export function resetPipelineState() {
  prevFrame = null;
}

// How each effect gathers its extra arguments from the full value map.
// Anything not listed just receives its own slider value.
const defaultResolver = (value) => [value];

const ARG_RESOLVERS = {
  scanlines: (v, vals) => [v, vals.scanline_gap],
  slice_shift: (v, vals, ctx) => [v, vals.slice_count, ctx.seed + 11],
  block_displacement: (v, vals, ctx) => [v, ctx.seed + 23],
  row_shift_chaos: (v, vals, ctx) => [v, ctx.seed + 37],
  data_bend: (v, vals, ctx) => [v, ctx.seed + 51],
  ghost: (v, vals) => [v, vals.ghost_x, vals.ghost_y],
  time_pixel: (v, vals, ctx) => [v, vals.time_pixel_bands, ctx.seed + 67, Math.max(1, vals.pixelate)],
  pixel_sort_threshold: (v, vals) => [v, !!vals.pixel_sort_direction],
  frame_blend: (v, vals, ctx) => [v, ctx.prevFrame],
  datamosh_blocks: (v, vals, ctx) => [
    v, vals.datamosh_block_size, vals.datamosh_direction_x,
    vals.datamosh_direction_y, vals.datamosh_decay, ctx.prevFrame
  ],
  wave_warp: (v, vals) => [v, vals.wave_warp_freq]
};

export async function runPipeline(sourceImageData, effectValues) {
  frameSeed = (frameSeed + 1) >>> 0;
  const ctx = { seed: frameSeed, prevFrame };

  let d = sourceImageData; // effects never mutate input, so reassigning is safe

  for (const entry of EFFECTS_CONFIG) {
    if (entry.param) continue;            // pure parameter of another effect
    const fn = effects[entry.id];
    if (typeof fn !== 'function') continue;
    const value = effectValues[entry.id];
    if (value === entry.neutral) continue; // no-op -> skip for speed

    const resolve = ARG_RESOLVERS[entry.id] || defaultResolver;
    const args = resolve(value, effectValues, ctx);
    // `await` is a no-op for synchronous effects; jpeg_artifact returns a Promise.
    d = await fn(d, ...args);
  }

  // store a copy for temporal effects (frame_blend / datamosh) on the next run
  prevFrame = cloneImageData(d);
  return d;
}

'use strict';

/*
 * index.js — flat named map of every effect, re-exported so the pipeline does
 * not need to know which category file an effect lives in.
 *
 * Keys here match the effect `id` in config/effects.json. Slider entries that
 * are pure parameters of another effect (e.g. slice_count, ghost_x,
 * scanline_gap, datamosh_block_size, pixel_sort_direction) intentionally have
 * NO entry here — the pipeline feeds their values into the owning effect.
 */

import * as pixel from './pixel.js';
import * as scan from './scan.js';
import * as glitch from './glitch.js';
import * as temporal from './temporal.js';
import * as datamosh from './datamosh.js';
import * as geometry from './geometry.js';

export const effects = {
  // Pixel / Color
  pixelate: pixel.pixelate,
  bitcrush: pixel.bitcrush,
  channel_shift_r: pixel.channel_shift_r,
  channel_shift_g: pixel.channel_shift_g,
  channel_shift_b: pixel.channel_shift_b,
  hue_rotate: pixel.hue_rotate,
  saturation: pixel.saturation,
  invert: pixel.invert,
  threshold: pixel.threshold,

  // Scan / Raster
  scanlines: scan.scanlines,
  interlace: scan.interlace,
  crt_curve: scan.crt_curve,
  phosphor_blur: scan.phosphor_blur,

  // Glitch / Corruption
  slice_shift: glitch.slice_shift,
  block_displacement: glitch.block_displacement,
  noise_amount: glitch.noise_amount,
  jpeg_artifact: glitch.jpeg_artifact,
  row_shift_chaos: glitch.row_shift_chaos,
  data_bend: glitch.data_bend,
  ghost: glitch.ghost,

  // Temporal / Motion
  time_pixel: temporal.time_pixel,
  pixel_sort_threshold: temporal.pixel_sort_threshold,
  frame_blend: temporal.frame_blend,

  // Datamosh
  datamosh_blocks: datamosh.datamosh_blocks,

  // Geometry
  zoom: geometry.zoom,
  rotate: geometry.rotate,
  mirror_x: geometry.mirror_x,
  mirror_y: geometry.mirror_y,
  wave_warp: geometry.wave_warp
};

export default effects;

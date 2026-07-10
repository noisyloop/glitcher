'use strict';

/*
 * export3d.js — turn a (pixelated) image into a 3D voxel object, exported as
 * a binary glTF (.glb).
 *
 * The image is sampled on a grid (one cell per pixelate block); each cell
 * becomes a colored square column, Minecraft style:
 *
 *   mode "blocks" — column height driven by the cell's brightness, so the
 *                   image extrudes into a voxel relief.
 *   mode "tiles"  — every column has height 1: a flat pixel-art slab.
 *
 * Colors are baked in as per-vertex COLOR_0, so the mesh opens ready-colored
 * in Blender, three.js, Windows/macOS 3D viewers, etc. Only faces that are
 * actually visible (exposed sides, tops, bottoms) are emitted.
 *
 * This module is intentionally pure — no DOM, no Canvas. It takes any
 * `{ width, height, data }` (an ImageData qualifies) and returns bytes,
 * which also makes it testable under plain Node.
 */

// Keep exports sane: cap the voxel grid so a non-pixelated 2400px image still
// produces a reasonable mesh instead of ~6M cubes.
const MAX_GRID = 160;
// Skip cells that are essentially transparent.
const ALPHA_CUTOFF = 128;

// glTF constants
const COMP_FLOAT = 5126;
const COMP_UBYTE = 5121;
const COMP_UINT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY = 34963;
const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/**
 * Sample the image on a grid of `block`-sized cells.
 * Returns { gw, gh, cells } where cells[i] is null (transparent) or
 * { r, g, b, h } with h = column height in voxel units (>= 1).
 */
function buildGrid(img, block, mode) {
  const { width: w, height: h, data } = img;
  const gw = Math.ceil(w / block);
  const gh = Math.ceil(h / block);

  // Height range for "blocks" mode: proportional to the grid so the relief
  // reads at any resolution. "tiles" mode is a uniform 1-unit slab.
  const maxH = mode === 'tiles' ? 1 : Math.min(48, Math.max(4, Math.round(Math.max(gw, gh) * 0.25)));

  const cells = new Array(gw * gh).fill(null);
  for (let gy = 0; gy < gh; gy++) {
    const y0 = gy * block, y1 = Math.min(y0 + block, h);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * block, x1 = Math.min(x0 + block, w);
      // average the block (after pixelate the block is uniform anyway, but
      // averaging keeps exports sensible for non-pixelated images too)
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
          n++;
        }
      }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      if (a / n < ALPHA_CUTOFF) continue; // transparent cell -> no voxel
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const hh = mode === 'tiles' ? 1 : 1 + Math.round((luma / 255) * (maxH - 1));
      cells[gy * gw + gx] = { r, g, b, h: hh };
    }
  }
  return { gw, gh, cells };
}

/**
 * Build the visible-face voxel mesh from the grid.
 * Coordinates: x = column (image left→right), z = row (image top→bottom),
 * y = up (column height). The mesh is centered on the origin.
 */
function buildMesh({ gw, gh, cells }) {
  const positions = []; // float x,y,z per vertex
  const normals = [];   // float x,y,z per vertex
  const colors = [];    // ubyte r,g,b,a per vertex
  const indices = [];   // uint per triangle corner

  const cx = gw / 2, cz = gh / 2; // centering offsets

  // One flat-shaded quad: 4 verts sharing a normal + color, two triangles.
  // Callers list corners counter-clockwise as seen from outside the mesh.
  function quad(p0, p1, p2, p3, nrm, c) {
    const base = positions.length / 3;
    for (const p of [p0, p1, p2, p3]) {
      positions.push(p[0] - cx, p[1], p[2] - cz);
      normals.push(nrm[0], nrm[1], nrm[2]);
      colors.push(c.r, c.g, c.b, 255);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const heightAt = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return 0;
    const cell = cells[gy * gw + gx];
    return cell ? cell.h : 0;
  };

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const cell = cells[gy * gw + gx];
      if (!cell) continue;
      const x0 = gx, x1 = gx + 1, z0 = gy, z1 = gy + 1, h = cell.h;

      // top (+y) and bottom (-y) are always exposed
      quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], cell);
      quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, -1, 0], cell);

      // sides: only the band that rises above the neighbouring column
      const east = heightAt(gx + 1, gy);
      if (h > east) quad([x1, east, z1], [x1, east, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], cell);
      const west = heightAt(gx - 1, gy);
      if (h > west) quad([x0, west, z0], [x0, west, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], cell);
      const south = heightAt(gx, gy + 1);
      if (h > south) quad([x0, south, z1], [x1, south, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], cell);
      const north = heightAt(gx, gy - 1);
      if (h > north) quad([x1, north, z0], [x0, north, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], cell);
    }
  }

  return { positions, normals, colors, indices };
}

// Pad a byte length up to a multiple of 4 (glTF chunk alignment).
const pad4 = (n) => (n + 3) & ~3;

/**
 * Assemble mesh arrays into a valid binary glTF 2.0 container.
 * Layout: [POSITION f32][NORMAL f32][COLOR_0 u8x4 normalized][indices u32] —
 * every section is naturally 4-byte aligned.
 */
function buildGlb({ positions, normals, colors, indices }) {
  const posArr = new Float32Array(positions);
  const nrmArr = new Float32Array(normals);
  const colArr = new Uint8Array(colors);
  const idxArr = new Uint32Array(indices);
  const vertCount = posArr.length / 3;

  // POSITION accessors require min/max
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posArr.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (posArr[i + k] < min[k]) min[k] = posArr[i + k];
      if (posArr[i + k] > max[k]) max[k] = posArr[i + k];
    }
  }

  const sections = [posArr, nrmArr, colArr, idxArr].map((a) => new Uint8Array(a.buffer));
  const offsets = [];
  let binLength = 0;
  for (const s of sections) {
    offsets.push(binLength);
    binLength += pad4(s.byteLength);
  }

  const json = {
    asset: { version: '2.0', generator: 'glitcher' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'glitcher_voxels' }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
        indices: 3,
        material: 0
      }]
    }],
    materials: [{
      name: 'voxel_vertex_colors',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }
    }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: posArr.byteLength, target: TARGET_ARRAY_BUFFER },
      { buffer: 0, byteOffset: offsets[1], byteLength: nrmArr.byteLength, target: TARGET_ARRAY_BUFFER },
      { buffer: 0, byteOffset: offsets[2], byteLength: colArr.byteLength, target: TARGET_ARRAY_BUFFER },
      { buffer: 0, byteOffset: offsets[3], byteLength: idxArr.byteLength, target: TARGET_ELEMENT_ARRAY }
    ],
    accessors: [
      { bufferView: 0, componentType: COMP_FLOAT, count: vertCount, type: 'VEC3', min, max },
      { bufferView: 1, componentType: COMP_FLOAT, count: vertCount, type: 'VEC3' },
      { bufferView: 2, componentType: COMP_UBYTE, normalized: true, count: vertCount, type: 'VEC4' },
      { bufferView: 3, componentType: COMP_UINT, count: idxArr.length, type: 'SCALAR' }
    ],
    buffers: [{ byteLength: binLength }]
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = pad4(jsonBytes.byteLength);
  const totalLength = 12 + 8 + jsonPadded + 8 + binLength;

  const out = new Uint8Array(totalLength);
  const dv = new DataView(out.buffer);

  // GLB header
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLength, true);

  // JSON chunk (space-padded per spec)
  dv.setUint32(12, jsonPadded, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);

  // BIN chunk (zero-padded)
  const binStart = 20 + jsonPadded;
  dv.setUint32(binStart, binLength, true);
  dv.setUint32(binStart + 4, CHUNK_BIN, true);
  const binData = binStart + 8;
  for (let i = 0; i < sections.length; i++) {
    out.set(sections[i], binData + offsets[i]);
  }

  return out;
}

/**
 * Convert an image into a voxel-mesh GLB.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 *        pipeline output (an ImageData works as-is)
 * @param {{blockSize?:number, mode?:'blocks'|'tiles'}} [opts]
 *        blockSize: pixels per voxel — pass the pixelate slider value; it is
 *        raised automatically if the grid would exceed MAX_GRID.
 * @returns {{bytes:Uint8Array, stats:{grid:string,voxels:number,triangles:number}} | null}
 *          null when the image has no opaque pixels to voxelize.
 */
export function imageToGlb(img, opts = {}) {
  const mode = opts.mode === 'tiles' ? 'tiles' : 'blocks';
  const requested = Math.max(1, Math.round(opts.blockSize || 1));
  const minBlock = Math.ceil(Math.max(img.width, img.height) / MAX_GRID);
  const block = Math.max(requested, minBlock);

  const grid = buildGrid(img, block, mode);
  const voxels = grid.cells.reduce((n, c) => n + (c ? 1 : 0), 0);
  if (voxels === 0) return null;

  const mesh = buildMesh(grid);
  const bytes = buildGlb(mesh);
  return {
    bytes,
    stats: {
      grid: `${grid.gw}×${grid.gh}`,
      voxels,
      triangles: mesh.indices.length / 3
    }
  };
}

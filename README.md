# glitcher

A browser-based image glitch tool with a dark terminal aesthetic. All image
processing happens **entirely in your browser** via the Canvas API — the
Node/Express server only serves static files.

## Run

```bash
npm install
node server.js
# open http://localhost:3000
```

## Use

1. **▶ IMPORT** a JPG or PNG (left panel).
2. Drag the sliders in the right panel — the OUTPUT preview updates live.
3. **⚄ RANDOMIZE ALL** for chaos, **⟲ RESET ALL** to return to neutral.
4. **▼ EXPORT PNG** renders the full pipeline at native resolution and
   downloads `glitch_<timestamp>.png`.
5. **▼ EXPORT 3D (GLB)** turns the output into a voxel 3D object
   (`glitch3d_<timestamp>.glb`). Crank up **pixelate** first — every pixel
   block becomes one voxel column. Two styles via the dropdown:
   - **minecraft blocks** — brighter blocks extrude taller, producing a
     voxel relief.
   - **flat tiles** — every block is a 1-unit tile: a flat pixel-art slab.

   Colors are baked in as vertex colors, and the binary glTF (`.glb`) opens
   ready-colored in Blender, three.js, and the built-in Windows/macOS 3D
   viewers. Transparent pixels are skipped, so PNGs with alpha become
   cut-out shapes.

## Effects

Sliders are grouped: **Pixel/Color**, **Scan/Raster**, **Glitch/Corruption**,
**Temporal/Motion**, **Datamosh**, and **Geometry**. Effects compose top-to-bottom
in a pipeline; any slider at its neutral position is a no-op (kept fast).

> **Datamosh tip:** the temporal P-frame smear only appears when `frame_blend > 0`,
> since `datamosh_decay` bleeds the *previous* rendered frame through.

## Architecture

Modular ES modules under `public/js/`, with `config/effects.json` as the single
source of truth for what effects exist (id, label, group, range, neutral value).

| File | Role |
|------|------|
| `server.js` | Minimal Express static server with strict CSP + security headers. |
| `public/index.html` | Two-panel CSS-grid layout. |
| `public/style.css` | Phosphor-green-on-black terminal theme. |
| `public/config/effects.json` | Slider/effect definitions — single source of truth. |
| `public/js/main.js` | Entry point — wires UI + pipeline + IO together. |
| `public/js/config.js` | Loads `effects.json` and exposes it to ui + pipeline. |
| `public/js/pipeline.js` | `runPipeline(source, values)` — applies effects in order, skipping neutrals. |
| `public/js/ui.js` | Slider rendering, value tracking, Randomize/Reset. Knows nothing about Canvas. |
| `public/js/io.js` | Hardened image import, source/output canvases, PNG + GLB export. Knows nothing about sliders. |
| `public/js/export3d.js` | Pure ImageData→voxel-mesh→binary glTF (.glb) converter used by the 3D export. No DOM, no dependencies. |
| `public/js/effects/*.js` | One file per category; one exported function per effect. `index.js` re-exports a flat map. |

## Security notes

Imported images are validated before decoding: reported MIME type is gated to
`image/jpeg`/`image/png`, the file is size-capped (30 MB), and the real
**magic bytes** are sniffed and must match the claimed type (defends against
spoofed/renamed files). Decoding uses `createImageBitmap` (no DOM attachment,
no SVG/script vectors), dimensions are clamped to bound memory/CPU, and all
user-derived text (e.g. filenames) is rendered via `textContent`, never
`innerHTML`. The server sends a strict Content-Security-Policy, rejects
non-GET/HEAD methods, and serves only files under `public/`.

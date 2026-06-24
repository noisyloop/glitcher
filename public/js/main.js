'use strict';

/*
 * main.js — entry point. Wires the UI, the pipeline, and image IO together:
 *   slider change -> runPipeline(source, values) -> draw to output canvas.
 */

import { initUI, setStatus } from './ui.js';
import { runPipeline, resetPipelineState } from './pipeline.js';
import { initImport, initExport, drawOutput } from './io.js';

let sourceImageData = null;   // native-resolution source
let lastResult = null;        // most recent pipeline output (reused for export)
let ui = null;

// Render concurrency: latest-wins. If a render is requested while one is in
// flight (jpeg_artifact is async), queue exactly one follow-up.
let rendering = false;
let renderQueued = false;

async function render() {
  if (!sourceImageData) return null;
  if (rendering) { renderQueued = true; return lastResult; }
  rendering = true;
  try {
    const result = await runPipeline(sourceImageData, ui.getValues());
    drawOutput(result);
    lastResult = result;
    return result;
  } catch (err) {
    console.error('render failed', err);
    setStatus('render error');
    return lastResult;
  } finally {
    rendering = false;
    if (renderQueued) { renderQueued = false; render(); }
  }
}

// ~30ms debounce on slider input
let debounceTimer = null;
function scheduleRender() {
  if (!sourceImageData) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 30);
}

// --- wire UI ---
ui = initUI({
  onInput: scheduleRender,
  onRandomize: render,
  onReset: () => { resetPipelineState(); render(); }
});

// --- wire IO ---
initImport((src) => {
  sourceImageData = src;
  lastResult = null;
  resetPipelineState();
  render();
});

initExport(async () => {
  if (!sourceImageData) return null;
  // export exactly what the user sees; render once if nothing is cached yet
  return lastResult || (await render());
});

setStatus('no signal');

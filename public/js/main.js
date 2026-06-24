'use strict';

/*
 * main.js — entry point. Wires the UI, the pipeline, image IO, and the WebM
 * randomizer (animate + recorder) together:
 *   slider change      -> runPipeline(source, values) -> draw to output canvas
 *   RECORD GLITCH btn  -> animate sliders + capture output canvas to WebM
 */

import { initUI, setStatus } from './ui.js';
import { runPipeline, resetPipelineState } from './pipeline.js';
import { initImport, initExport, drawOutput } from './io.js';
import { EFFECTS_CONFIG } from './config.js';
import { startAnimation, stopAnimation } from './animate.js';
import { startRecording, stopRecording } from './recorder.js';

let sourceImageData = null;   // native-resolution source
let lastResult = null;        // most recent pipeline output (reused for export)
let ui = null;
let recording = false;        // are we currently recording a glitch clip?

const outputCanvas = document.getElementById('outputCanvas');
const outputCtx = outputCanvas.getContext('2d');
const recordBtn = document.getElementById('recordBtn');

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
    if (recording) drawRecIndicator();   // overlay the REC dot for capture
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

// Pulsing red REC indicator, drawn directly on the output canvas (top-right)
// after the pipeline result is painted, so it ends up in the captured stream.
function drawRecIndicator() {
  const r = 6;
  const pad = 14;
  const x = outputCanvas.width - pad - r;
  const y = pad + r;
  // pulse opacity between 0.4 and 1.0
  const op = 0.4 + ((Math.sin(Date.now() / 300) + 1) / 2) * 0.6;
  outputCtx.save();
  outputCtx.globalAlpha = op;
  outputCtx.fillStyle = '#ff3b30';
  outputCtx.beginPath();
  outputCtx.arc(x, y, r, 0, Math.PI * 2);
  outputCtx.fill();
  outputCtx.font = '14px monospace';
  outputCtx.textAlign = 'right';
  outputCtx.textBaseline = 'middle';
  outputCtx.fillText('REC', x - r - 6, y);
  outputCtx.restore();
}

// --- wire UI ---
ui = initUI({
  onInput: scheduleRender,
  onRandomize: render,
  onReset: () => { resetPipelineState(); render(); }
});

// Apply a partial { id: value } map onto the live UI state and reflect it in
// the DOM. ui.getValues() returns the live state object, so mutating it keeps
// render()'s view consistent without modifying ui.js.
function setValues(vals) {
  const state = ui.getValues();
  for (const k in vals) state[k] = vals[k];
  ui.syncInputs();
}

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

// --- wire WebM randomizer ---
function setRecordButton(on) {
  if (on) {
    recordBtn.textContent = '⏹ STOP';
    recordBtn.style.color = '#ff4d4d';
    recordBtn.style.borderColor = '#ff4d4d';
    recordBtn.style.boxShadow = '0 0 10px #ff4d4d55';
  } else {
    recordBtn.textContent = '▶ RECORD GLITCH';
    recordBtn.style.color = '';
    recordBtn.style.borderColor = '';
    recordBtn.style.boxShadow = '';
  }
}

function startGlitchRecording() {
  if (!sourceImageData) { setStatus('import an image first'); return; }
  recording = true;
  setRecordButton(true);
  setStatus('recording…');
  startRecording(outputCanvas);
  // render directly each frame (not debounced) so the animation is smooth and
  // every interpolated frame lands in the captured stream.
  startAnimation(() => ui.getValues(), setValues, () => EFFECTS_CONFIG, render);
}

function stopGlitchRecording() {
  recording = false;
  setRecordButton(false);
  stopAnimation();
  stopRecording();
  setStatus('saved webm');
  render(); // redraw once without the REC overlay
}

recordBtn.addEventListener('click', () => {
  if (recording) stopGlitchRecording();
  else startGlitchRecording();
});

setStatus('no signal');

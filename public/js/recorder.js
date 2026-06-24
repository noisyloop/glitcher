'use strict';

/*
 * recorder.js — owns the browser-native MediaRecorder.
 *
 * Captures a stream from the output canvas, collects chunks, and on stop
 * assembles a WebM Blob and triggers a download. No encoding libraries.
 */

let recorder = null;
let chunks = [];

/**
 * Start recording the given canvas at 30fps.
 * @param {HTMLCanvasElement} canvas
 */
export function startRecording(canvas) {
  if (typeof MediaRecorder === 'undefined') {
    console.warn('MediaRecorder is not available in this browser; cannot record.');
    return false;
  }

  const stream = canvas.captureStream(30);
  chunks = [];

  // Prefer video/webm; fall back to the browser default if unsupported.
  let options;
  if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm')) {
    options = { mimeType: 'video/webm' };
  } else {
    console.warn('video/webm mimeType not supported — falling back to default MediaRecorder mimeType.');
    options = undefined;
  }

  try {
    recorder = new MediaRecorder(stream, options);
  } catch (err) {
    console.warn('MediaRecorder rejected the requested options; using default mimeType.', err);
    recorder = new MediaRecorder(stream);
  }

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  return true;
}

/**
 * Stop recording, build the Blob, and download it as glitch_<timestamp>.webm.
 */
export function stopRecording() {
  if (!recorder) return;

  recorder.onstop = () => {
    const type = (recorder && recorder.mimeType) || 'video/webm';
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glitch_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    recorder = null;
    chunks = [];
  };

  recorder.stop();
}

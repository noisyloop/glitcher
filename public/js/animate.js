'use strict';

/*
 * animate.js — owns the interpolation loop used by the WebM randomizer.
 *
 * It repeatedly eases every slider from its current value toward a random
 * target (drawn from each effect's own min/max in the config), holds briefly
 * on arrival, then picks a fresh target — looping until stopped.
 *
 * It does not touch Canvas, the pipeline, or the recorder: callers inject
 * accessors so this stays a pure value-animation engine.
 */

const LERP = 0.06;     // per-frame ease factor: next = cur + (target - cur) * LERP
const SNAP = 0.5;      // snap to target once within this distance (value units)
const HOLD_MS = 500;   // hold on target before randomizing again

let rafId = null;

function randomTarget(config) {
  const t = {};
  for (const c of config) {
    if (c.type === 'checkbox') {
      t[c.id] = Math.random() < 0.5 ? 1 : 0;
    } else {
      t[c.id] = c.min + Math.random() * (c.max - c.min);
    }
  }
  return t;
}

/**
 * Start the rAF interpolation loop.
 * @param {() => Object} getCurrentValues  returns the live { id: value } map
 * @param {(vals: Object) => void} setValues  applies a partial { id: value } map
 * @param {() => Array} getEffectConfig  returns the effects config array
 * @param {() => void} onFrame  called after each tick (e.g. to re-render)
 */
export function startAnimation(getCurrentValues, setValues, getEffectConfig, onFrame) {
  stopAnimation(); // never run two loops at once

  const config = getEffectConfig();
  let target = randomTarget(config);
  let holding = false;
  let holdStart = 0;

  function tick() {
    const current = getCurrentValues();
    const next = {};
    let moving = false;

    for (const c of config) {
      const id = c.id;
      if (c.type === 'checkbox') {
        next[id] = target[id];       // discrete: jump to target
        continue;
      }
      const cur = current[id];
      const tgt = target[id];
      if (Math.abs(tgt - cur) < SNAP) {
        next[id] = tgt;              // snap
      } else {
        next[id] = cur + (tgt - cur) * LERP;
        moving = true;
      }
    }

    setValues(next);
    onFrame();

    if (!moving) {
      // arrived — hold, then choose a new random target
      const now = performance.now();
      if (!holding) {
        holding = true;
        holdStart = now;
      } else if (now - holdStart >= HOLD_MS) {
        target = randomTarget(config);
        holding = false;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
}

export function stopAnimation() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

'use strict';

/*
 * ui.js — all slider/DOM interaction.
 *
 * Renders the controls from config/effects.json, tracks their current values,
 * and emits change events. It owns Randomize All / Reset All. It knows nothing
 * about Canvas or ImageData — it only deals in plain numeric values.
 */

import { EFFECTS_CONFIG, DEFAULTS } from './config.js';

// Per-group help text (UI copy, kept out of the data config).
const GROUP_HINTS = {
  'Temporal / Motion':
    'frame_blend stores the previous render and blends it back — drives persistence trails for datamosh.',
  'Datamosh':
    'Needs frame_blend > 0 to reveal the temporal P-frame smear (datamosh_decay bleeds the previous frame through).'
};

const statusEl = document.getElementById('status');
export function setStatus(text) { if (statusEl) statusEl.textContent = text; }

// current values, keyed by effect id
const state = { ...DEFAULTS };

const valueEls = {};   // id -> value display span
const inputEls = {};   // id -> input element

function isCheckbox(c) { return c.type === 'checkbox'; }

function fmt(c, v) {
  if (isCheckbox(c)) return v ? 'on' : 'off';
  return c.step < 1 ? Number(v).toFixed(2) : String(Math.round(v));
}

function groupedConfig() {
  const order = [];
  const map = new Map();
  for (const c of EFFECTS_CONFIG) {
    if (!map.has(c.group)) { map.set(c.group, []); order.push(c.group); }
    map.get(c.group).push(c);
  }
  return order.map((g) => ({ title: g, controls: map.get(g) }));
}

/**
 * Build the controls UI and wire all events.
 * @param {{onInput:Function,onRandomize:Function,onReset:Function}} handlers
 * @returns {{getValues:Function,syncInputs:Function}}
 */
export function initUI({ onInput, onRandomize, onReset }) {
  const root = document.getElementById('controls');

  for (const group of groupedConfig()) {
    const gEl = document.createElement('div');
    gEl.className = 'group';

    const title = document.createElement('h3');
    title.className = 'group-title';
    title.textContent = group.title.toUpperCase();
    gEl.appendChild(title);

    const hint = GROUP_HINTS[group.title];
    if (hint) {
      const hintEl = document.createElement('div');
      hintEl.className = 'group-hint';
      hintEl.textContent = '↳ ' + hint;
      gEl.appendChild(hintEl);
    }

    for (const c of group.controls) {
      const ctrl = document.createElement('div');
      ctrl.className = 'ctrl' + (isCheckbox(c) ? ' ctrl-check' : '');

      const row = document.createElement('div');
      row.className = 'ctrl-row';
      const label = document.createElement('span');
      label.className = 'ctrl-label';
      label.textContent = c.label;
      const val = document.createElement('span');
      val.className = 'ctrl-value';
      val.textContent = fmt(c, state[c.id]);
      row.appendChild(label);
      row.appendChild(val);
      ctrl.appendChild(row);

      let input;
      if (isCheckbox(c)) {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!state[c.id];
        input.addEventListener('change', () => {
          state[c.id] = input.checked ? 1 : 0;
          val.textContent = fmt(c, state[c.id]);
          onInput();
        });
        row.insertBefore(input, val);
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = c.min; input.max = c.max; input.step = c.step;
        input.value = state[c.id];
        input.addEventListener('input', () => {
          state[c.id] = parseFloat(input.value);
          val.textContent = fmt(c, state[c.id]);
          onInput();
        });
        ctrl.appendChild(input);
      }

      valueEls[c.id] = val;
      inputEls[c.id] = input;
      gEl.appendChild(ctrl);
    }
    root.appendChild(gEl);
  }

  // push `state` back into the DOM inputs after a programmatic change
  function syncInputs() {
    for (const c of EFFECTS_CONFIG) {
      const input = inputEls[c.id];
      if (isCheckbox(c)) input.checked = !!state[c.id];
      else input.value = state[c.id];
      valueEls[c.id].textContent = fmt(c, state[c.id]);
    }
  }

  function randomizeAll() {
    for (const c of EFFECTS_CONFIG) {
      if (isCheckbox(c)) {
        state[c.id] = Math.random() < 0.5 ? 1 : 0;
      } else {
        const raw = c.min + Math.random() * (c.max - c.min);
        state[c.id] = c.step < 1 ? Math.round(raw / c.step) * c.step : Math.round(raw);
      }
    }
    syncInputs();
    setStatus('randomized');
    onRandomize();
  }

  function resetAll() {
    for (const c of EFFECTS_CONFIG) state[c.id] = c.default;
    syncInputs();
    setStatus('reset');
    onReset();
  }

  document.getElementById('randomizeBtn').addEventListener('click', randomizeAll);
  document.getElementById('resetBtn').addEventListener('click', resetAll);

  return {
    getValues: () => state,
    syncInputs
  };
}

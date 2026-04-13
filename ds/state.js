/**
 * ds/state.js — shared reactive state for the DS module
 *
 * Both sketch.js and analytics.js import this module.
 * Because ES modules are singletons in the browser, they share
 * the same state object — no global variables or custom event bus needed.
 *
 * sketch.js  → calls resetState() and recordDetection()
 * analytics.js → calls subscribe() to receive updates
 */

export const state = {
  sigma:          0.25,     // km — current detection scale parameter
  W:              0.4,      // km — truncation distance
  transectLength: 4,        // km
  trueD:          null,     // animals/km² — set when sim initialises
  detectedDistances: [],    // perpendicular distances (km) of each detection
  dhatHistory:    [],       // D̂ after each successive detection
  speed:          'normal', // 'slow' | 'normal' | 'fast'
};

const _listeners = new Set();

// Called by sketch.js when the simulation resets
export function resetState({ sigma, W, transectLength, trueD }) {
  state.sigma          = sigma;
  state.W              = W;
  state.transectLength = transectLength;
  state.trueD          = trueD;
  state.detectedDistances = [];
  state.dhatHistory       = [];
  _notify();
}

// Called by sketch.js on each new detection
export function recordDetection(perpDistKm) {
  state.detectedDistances.push(perpDistKm);
  _notify();
}

// Called by sketch.js when σ or W changes live (without a full population reset)
export function updateParams({ sigma, W }) {
  state.sigma = sigma;
  state.W     = W;
  _notify();
}

// Called by analytics.js to receive state updates
export function subscribe(fn) {
  _listeners.add(fn);
}

function _notify() {
  for (const fn of _listeners) fn(state);
}

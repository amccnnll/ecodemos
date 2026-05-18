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
  sigma:              0.25,        // km — detection scale parameter
  W:                  0.4,         // km — truncation distance
  transectLength:     4,           // km
  trueD:              null,        // animals/km² — set when sim initialises
  detectedDistances:  [],          // perpendicular distances (km) of each detection
  detectedEfforts:    [],          // transect length covered (km) at time of each detection
  dhatHistory:        [],          // D̂ after each successive detection (rebuilt by analytics)
  speed:              'normal',    // 'slow' | 'normal' | 'fast'
  truthFn:            'halfNormal', // 'halfNormal' | 'hazardRate' — governs actual detections
  modelFn:            'halfNormal', // 'halfNormal' | 'hazardRate' — governs MLE + ESW
  b:                  2.5,         // hazard-rate shape parameter (used when either fn = hazardRate)
  sigmaHet:           false,       // per-animal sigma heterogeneity toggle
  sigmaCV:            0.30,        // coefficient of variation for sigma_i ~ LogNormal
};

const _listeners = new Set();

// Called by sketch.js when the simulation resets
export function resetState({ sigma, W, transectLength, trueD, sigmaHet, sigmaCV }) {
  state.sigma          = sigma;
  state.W              = W;
  state.transectLength = transectLength;
  state.trueD          = trueD;
  if (sigmaHet !== undefined) state.sigmaHet = sigmaHet;
  if (sigmaCV  !== undefined) state.sigmaCV  = sigmaCV;
  state.detectedDistances = [];
  state.detectedEfforts   = [];
  state.dhatHistory       = [];
  _notify();
}

// Called by sketch.js on each new detection
// effortKm = boatX at the moment of detection (transect covered so far)
export function recordDetection(perpDistKm, effortKm) {
  state.detectedDistances.push(perpDistKm);
  state.detectedEfforts.push(effortKm);
  _notify();
}

// Called by sketch.js when parameters change live (without a full population reset)
export function updateParams({ sigma, W, truthFn, modelFn, b, sigmaHet, sigmaCV } = {}) {
  if (sigma    !== undefined) state.sigma    = sigma;
  if (W        !== undefined) state.W        = W;
  if (truthFn  !== undefined) state.truthFn  = truthFn;
  if (modelFn  !== undefined) state.modelFn  = modelFn;
  if (b        !== undefined) state.b        = b;
  if (sigmaHet !== undefined) state.sigmaHet = sigmaHet;
  if (sigmaCV  !== undefined) state.sigmaCV  = sigmaCV;
  _notify();
}

// Called by analytics.js to receive state updates
export function subscribe(fn) {
  _listeners.add(fn);
}

function _notify() {
  for (const fn of _listeners) fn(state);
}

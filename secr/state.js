/**
 * secr/state.js — shared reactive state for the SECR module
 *
 * Both sketch.js and analytics.js import this module.
 * ES modules are singletons in the browser, so both files share
 * the same state object — no global variables or custom event bus needed.
 *
 * sketch.js    → calls resetState(), updatePositions(), recordOccasion(), updateParams()
 * analytics.js → calls subscribe() to receive updates
 *
 * analytics.js is NOT notified on every frame — only on reset, occasion
 * completion, and parameter changes that affect the detection surface.
 */

export const state = {
  // ── Parameters (survive resetState; updated via updateParams) ──────────────
  g0:           0.4,           // max detection probability (at d=0)
  sigma:        0.10,          // km — intrinsic home range scale (UI slider)
  sigmaEff:     0.10,          // km — effective detection σ = sigma / √fidelity

  // ── Set on resetState ──────────────────────────────────────────────────────
  N:            5,            // true number of animals
  K:            10,           // occasions per run
  trueD:        null,         // animals/km² (computed from N and total arena area)
  arenaW:       null,         // km — total arena width (inner + 2 × buffer)
  arenaH:       null,         // km — total arena height
  innerW:       null,         // km — inner study area width
  innerH:       null,         // km — inner study area height
  innerX0:      null,         // km — inner study area left edge (= bufferW)
  innerY0:      null,         // km — inner study area top edge  (= bufferH)

  // ── Runtime: updated by sketch.js each frame/occasion ─────────────────────
  animals:      [],           // [{id, x, y, cx, cy}] — current positions
  detectors:    [],           // [{id, x, y}]
  k:            0,            // current occasion index (0 = not started)

  // ── Capture history ────────────────────────────────────────────────────────
  // Each entry: { animalId, detectorId, k }
  // One entry per (animal, detector, occasion) detection event.
  captures:     [],
};

const _listeners = new Set();

// Called by sketch.js on full reset (new population or new seed).
// Clears all survey data; animals and detectors are set separately
// via updatePositions / updateDetectors.
export function resetState({ N, K, trueD, arenaW, arenaH, innerW, innerH, innerX0, innerY0 }) {
  state.N       = N;
  state.K       = K;
  state.trueD   = trueD;
  state.arenaW  = arenaW;
  state.arenaH  = arenaH;
  state.innerW  = innerW;
  state.innerH  = innerH;
  state.innerX0 = innerX0;
  state.innerY0 = innerY0;
  state.k       = 0;
  state.animals  = [];
  state.captures = [];
  _notify();
}

// Called by sketch.js every frame with updated animal positions.
// Does NOT notify analytics — positions are visual only.
export function updatePositions(animals) {
  state.animals = animals;
}

// Called by sketch.js when detector layout changes (custom placement pre-run).
// Notifies analytics so the detection surface redraws.
export function updateDetectors(detectors) {
  state.detectors = detectors;
  _notify();
}

// Called by sketch.js at the end of each occasion with that occasion's captures.
// k is the 1-based occasion index.
export function recordOccasion(k, captures) {
  state.k = k;
  for (const c of captures) state.captures.push({ ...c, k });
  _notify();
}

// Called when parameters change live (detection surface must redraw).
export function updateParams({ g0, sigma, sigmaEff } = {}) {
  if (g0       !== undefined) state.g0       = g0;
  if (sigma    !== undefined) state.sigma    = sigma;
  if (sigmaEff !== undefined) state.sigmaEff = sigmaEff;
  _notify();
}

// Called by analytics.js to receive state updates.
export function subscribe(fn) {
  _listeners.add(fn);
}

// Trigger a re-render of all subscribers without changing any state.
// Used when a display option changes (e.g. surface toggle re-enabled) mid-run.
export function notifyAll() { _notify(); }

function _notify() {
  for (const fn of _listeners) fn(state);
}

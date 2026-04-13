/**
 * secr-engine.js — pure SECR simulation engine
 *
 * No DOM, no p5, no D3. Given parameters + RNG → returns state.
 *
 * Exports:
 *   placeAnimals(n, arenaW, arenaH, rng)
 *   placeDetectors(layout, innerW, innerH, innerX0, innerY0, rng, gridN, nRandom)
 *   stepAnimal(animal, arenaW, arenaH, rng, movementType, stepSize, springStrength, habitatFn)
 *   tryDetectsOnOccasion(animals, detectors, g0, sigma, rng)
 *   detectionSurface(detectors, g0, sigma, arenaW, arenaH, cols, rows, habitatFn)
 *   computeESA(detectors, g0, sigma, arenaW, arenaH, cols, rows, habitatFn)
 */

import { halfNormal } from './stats.js';

// ─── Animal placement ─────────────────────────────────────────────────────────

// Place n animals with home range centres distributed uniformly across the full
// arena (including buffer zone). Each animal starts at its home range centre.
// cx/cy are the hidden true home range centres — never exposed to the estimator.
export function placeAnimals(n, arenaW, arenaH, rng) {
  return Array.from({ length: n }, (_, i) => {
    const cx = rng() * arenaW;
    const cy = rng() * arenaH;
    return { id: i, x: cx, y: cy, cx, cy };
  });
}

// ─── Detector placement ───────────────────────────────────────────────────────

// Place detectors within the inner study area.
//
// layout   'grid'   — gridN × gridN regular grid, evenly spaced
//          'random' — nRandom detectors uniformly distributed
//          'custom' — returns []; sketch.js manages placement directly
//
// innerX0/innerY0: top-left corner of inner study area in world coordinates (km)
// innerW/innerH:   dimensions of inner study area (km)
export function placeDetectors(
  layout,
  innerW, innerH, innerX0, innerY0,
  rng,
  gridN   = 5,
  nRandom = 16,
) {
  if (layout === 'grid') {
    const detectors = [];
    const dx = innerW / gridN;
    const dy = innerH / gridN;
    for (let row = 0; row < gridN; row++) {
      for (let col = 0; col < gridN; col++) {
        detectors.push({
          id: row * gridN + col,
          x:  innerX0 + (col + 0.5) * dx,
          y:  innerY0 + (row + 0.5) * dy,
        });
      }
    }
    return detectors;
  }

  if (layout === 'random') {
    return Array.from({ length: nRandom }, (_, i) => ({
      id: i,
      x:  innerX0 + rng() * innerW,
      y:  innerY0 + rng() * innerH,
    }));
  }

  return []; // 'custom' — managed externally by sketch.js
}

// ─── Animal movement ──────────────────────────────────────────────────────────

// Move one animal one step.
//
// movementType:
//   'randomWalk' — uniform random direction, fixed step length; no home range pull
//   'brownian'   — Gaussian step + spring toward hidden home range centre
//   'levy'       — power-law (Pareto α=1.5) step + spring toward centre
//
// stepSize (km)       — base movement magnitude per frame
// springStrength (0–1)— fraction of displacement toward home range centre per step
//
// habitatFn(x, y) → [0,1]: reserved for habitat-biased movement (v-next).
// Accepted now so call signatures stay stable when habitat is added.
//
// Boundaries: soft clamp — arena edges stop the animal. Home range spring prevents
// persistent wall-hugging. No wrap-around (unlike DS) since home ranges are localised.
export function stepAnimal(
  animal,
  arenaW, arenaH,
  rng,
  movementType   = 'brownian',
  stepSize       = 0.01,
  springStrength = 0.05,
  habitatFn      = () => 1,   // eslint-disable-line no-unused-vars
) {
  let dx = 0;
  let dy = 0;

  if (movementType === 'randomWalk') {
    const angle = rng() * 2 * Math.PI;
    dx = Math.cos(angle) * stepSize;
    dy = Math.sin(angle) * stepSize;

  } else if (movementType === 'brownian') {
    // Box-Muller Gaussian step
    const u1    = Math.max(rng(), 1e-10);
    const r     = Math.sqrt(-2 * Math.log(u1)) * stepSize;
    const angle = 2 * Math.PI * rng();
    dx = Math.cos(angle) * r;
    dy = Math.sin(angle) * r;
    // Spring pull toward hidden home range centre
    dx += (animal.cx - animal.x) * springStrength;
    dy += (animal.cy - animal.y) * springStrength;

  } else if (movementType === 'levy') {
    // Pareto inverse-CDF with α=1.5; cap extreme steps at 40% of arena width
    const u     = Math.max(rng(), 1e-10);
    const r     = Math.min(stepSize / Math.pow(u, 1 / 1.5), arenaW * 0.4);
    const angle = rng() * 2 * Math.PI;
    dx = Math.cos(angle) * r;
    dy = Math.sin(angle) * r;
    // Spring pull toward hidden home range centre
    dx += (animal.cx - animal.x) * springStrength;
    dy += (animal.cy - animal.y) * springStrength;
  }

  // Soft clamp at arena boundaries
  const nx = Math.max(0, Math.min(arenaW, animal.x + dx));
  const ny = Math.max(0, Math.min(arenaH, animal.y + dy));

  return { ...animal, x: nx, y: ny };
}

// ─── Detection ────────────────────────────────────────────────────────────────

// Run one complete occasion across all (animal, detector) pairs.
// Returns capture events: [{ animalId, detectorId }]
// A single animal may be captured by multiple detectors on the same occasion.
export function tryDetectsOnOccasion(animals, detectors, g0, sigma, rng) {
  const captures = [];
  for (const animal of animals) {
    for (const detector of detectors) {
      const d = Math.hypot(animal.x - detector.x, animal.y - detector.y);
      const g = g0 * halfNormal(d, sigma);
      if (rng() < g) {
        captures.push({ animalId: animal.id, detectorId: detector.id });
      }
    }
  }
  return captures;
}

// ─── Spatial integration ─────────────────────────────────────────────────────

// Single-occasion detection probability for a home range centre at (cx, cy).
// p(cx,cy) = 1 − ∏_d (1 − g(dist((cx,cy), d)))
function _pAtPoint(cx, cy, detectors, g0, sigma) {
  let logNonDetect = 0;
  for (const det of detectors) {
    const d = Math.hypot(cx - det.x, cy - det.y);
    const g = g0 * halfNormal(d, sigma);
    logNonDetect += Math.log(1 - g + 1e-15); // guard against log(0)
  }
  return 1 - Math.exp(logNonDetect);
}

// Compute the single-occasion detection probability surface over the full arena.
// Returns a flat array of { cx, cy, p } suitable for D3 heatmap rendering.
//
// habitatFn(x, y) → [0,1]: multiplies p at each cell.
// Default () => 1 gives the standard uniform-habitat surface.
export function detectionSurface(
  detectors,
  g0, sigma,
  arenaW, arenaH,
  cols      = 60,
  rows      = 60,
  habitatFn = () => 1,
) {
  const cellW = arenaW / cols;
  const cellH = arenaH / rows;
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      cells.push({ cx, cy, p: _pAtPoint(cx, cy, detectors, g0, sigma) * habitatFn(cx, cy) });
    }
  }
  return cells;
}

// Compute ESA (effective sample area, km²):  ESA = ∫∫ p(x,y) · h(x,y) dx dy
//
// With uniform habitat (h=1) this is just Σ p_cell × cell_area.
// Theoretical density estimate: D̂ = M / ESA
// where M is the number of distinct individuals captured at least once.
export function computeESA(
  detectors,
  g0, sigma,
  arenaW, arenaH,
  cols      = 60,
  rows      = 60,
  habitatFn = () => 1,
) {
  const cellArea = (arenaW / cols) * (arenaH / rows);
  return detectionSurface(detectors, g0, sigma, arenaW, arenaH, cols, rows, habitatFn)
    .reduce((sum, c) => sum + c.p * cellArea, 0);
}

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
    return { id: i, x: cx, y: cy, cx, cy, vx: 0, vy: 0 };
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

// Move one animal one step using OUV (OU in velocity space).
//
// Each frame the velocity is updated: drag damps it, Gaussian noise perturbs it,
// and a spring pulls it toward the hidden home range centre.  The position is
// then shifted by the resulting velocity.  This gives smooth correlated paths
// rather than the per-step direction jitter of a position-space OU process.
//
// Parameter derivation (caller's responsibility — see sketch.js):
//   springStr  = fidelity / (tau × fpk)
//   noiseScale = sigma × √(2 × drag / (tau × fpk))
//   where drag is a fixed smoothness constant (≈ 0.08)
//
// At equilibrium: σ_position ≈ sigma / √fidelity, independently of tau.
// Changing fidelity shrinks or enlarges the effective home range.
// Changing tau changes how quickly the animal moves within its range.
//
// Arena boundaries: velocity is reflected so animals don't accumulate against walls.
export function stepAnimal(
  animal,
  arenaW, arenaH,
  rng,
  noiseScale    = 0.005,
  springStr     = 0.005,
  drag          = 0.08,
) {
  // Gaussian noise via Box-Muller (2 uniform samples → 2 independent N(0,1))
  const u1 = Math.max(rng(), 1e-10);
  const r  = Math.sqrt(-2 * Math.log(u1));
  const th = 2 * Math.PI * rng();
  const nx = r * Math.cos(th) * noiseScale;
  const ny = r * Math.sin(th) * noiseScale;

  // OUV update: drag velocity, apply spring toward home centre, add noise
  let vx = (animal.vx ?? 0) * (1 - drag)
         + springStr * (animal.cx - animal.x)
         + nx;
  let vy = (animal.vy ?? 0) * (1 - drag)
         + springStr * (animal.cy - animal.y)
         + ny;

  // Update position
  let x = animal.x + vx;
  let y = animal.y + vy;

  // Reflect off arena walls (preserves speed, prevents wall-hugging)
  if (x < 0)      { x = -x;            vx = -vx; }
  if (x > arenaW) { x = 2 * arenaW - x; vx = -vx; }
  if (y < 0)      { y = -y;            vy = -vy; }
  if (y > arenaH) { y = 2 * arenaH - y; vy = -vy; }

  return { ...animal, x, y, vx, vy };
}

// ─── Detection ────────────────────────────────────────────────────────────────

// Run one complete occasion across all (animal, detector) pairs.
// Returns capture events: [{ animalId, detectorId }]
// A single animal may be captured by multiple detectors on the same occasion.
//
// Detection is based on distance from activity centre (cx, cy), not current
// position — consistent with SECR theory where g(d) is a marginalised home-range
// detection function, not an instantaneous proximity function.
export function tryDetectsOnOccasion(animals, detectors, g0, sigma, rng) {
  const captures = [];
  for (const animal of animals) {
    for (const detector of detectors) {
      const d = Math.hypot(animal.cx - detector.x, animal.cy - detector.y);
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
// This is the *single-occasion* ESA — only appropriate when K=1.
// For multi-occasion surveys, use computeESA_K.
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

// Compute K-occasion ESA:  ∫∫ [1 − (1 − p₁(x,y))^K] · h(x,y) dx dy
//
// M counts individuals caught at least once across K occasions.
// The matching denominator is the probability of detection across all K occasions,
// not just a single occasion — otherwise D̂ ≈ K × true D at default settings.
export function computeESA_K(
  detectors,
  g0, sigma,
  arenaW, arenaH,
  K,
  cols      = 60,
  rows      = 60,
  habitatFn = () => 1,
) {
  if (!K || K <= 0) return 0;
  const cellArea = (arenaW / cols) * (arenaH / rows);
  return detectionSurface(detectors, g0, sigma, arenaW, arenaH, cols, rows, habitatFn)
    .reduce((sum, c) => sum + (1 - Math.pow(1 - c.p, K)) * cellArea, 0);
}

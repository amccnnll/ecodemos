/**
 * ds-engine.js — Distance Sampling simulation engine
 *
 * Pure JS. No UI or p5 dependencies.
 * The sketch (ds/sketch.js) calls these functions each frame and renders the result.
 *
 * Exports:
 *   placAnimals(n, arenaW, arenaH, rng)  → array of {x, y, detected}
 *   tryDetect(animal, boatX, transectY, sigma, W, rng)  → true if detected this frame
 */

import { halfNormal, hazardRate } from './stats.js';

// Place n animals uniformly at random across the arena (satisfies DS assumption)
export function placeAnimals(n, arenaW, arenaH, rng) {
  const animals = [];
  for (let i = 0; i < n; i++) {
    animals.push({ x: rng() * arenaW, y: rng() * arenaH, detected: false });
  }
  return animals;
}

// Place n animals in clusters (violates DS uniform-distribution assumption).
// clumpScale controls cluster spread as a fraction of arenaW (default 0.10).
// Number of clusters = max(3, round(n/6)) — ~6 animals per cluster on average.
export function placeAnimalsClumped(n, arenaW, arenaH, rng, clumpScale = 0.10) {
  const nClusters = Math.max(3, Math.round(n / 6));
  const centres = Array.from({ length: nClusters }, () => ({
    x: rng() * arenaW,
    y: rng() * arenaH,
  }));
  const sigma = arenaW * clumpScale;
  return Array.from({ length: n }, () => {
    const c  = centres[Math.floor(rng() * nClusters)];
    // Box-Muller transform for isotropic Gaussian scatter
    const u1 = Math.max(rng(), 1e-10);
    const u2 = rng();
    const r  = Math.sqrt(-2 * Math.log(u1)) * sigma;
    const θ  = 2 * Math.PI * u2;
    // Wrap-around keeps density uniform at arena edges
    const x = ((c.x + r * Math.cos(θ)) % arenaW + arenaW) % arenaW;
    const y = ((c.y + r * Math.sin(θ)) % arenaH + arenaH) % arenaH;
    return { x, y, detected: false };
  });
}

// Place n animals on a regular grid with random jitter (overdispersed).
// regularity = 0 → perfect grid; regularity = 1 → Poisson-equivalent jitter.
export function placeAnimalsRegular(n, arenaW, arenaH, rng, regularity = 0.5) {
  const aspect = arenaW / arenaH;
  const nCols  = Math.max(1, Math.round(Math.sqrt(n * aspect)));
  const nRows  = Math.ceil(n / nCols);
  const dx     = arenaW / nCols;
  const dy     = arenaH / nRows;
  const animals = [];
  for (let row = 0; row < nRows && animals.length < n; row++) {
    for (let col = 0; col < nCols && animals.length < n; col++) {
      animals.push({
        x: (col + 0.5 + (rng() - 0.5) * regularity) * dx,
        y: (row + 0.5 + (rng() - 0.5) * regularity) * dy,
        detected: false,
      });
    }
  }
  return animals;
}

// Attempt detection of one animal as the boat passes abeam.
// detFn: 'halfNormal' | 'hazardRate' — the field-truth detection function.
// Returns true if detected this frame, false otherwise.
export function tryDetect(animal, boatX, boatSpeed, transectY, sigma, W, rng, detFn = 'halfNormal', b = 2.5) {
  if (animal.detected) return false;
  const perpDist = Math.abs(animal.y - transectY);
  if (perpDist > W) return false;
  // Fire exactly once: the frame the boat first draws level with the animal.
  const atBeam = boatX - animal.x >= 0 && boatX - animal.x < boatSpeed;
  if (!atBeam) return false;
  const p = detFn === 'hazardRate'
    ? hazardRate(perpDist, sigma, b)
    : halfNormal(perpDist, sigma);
  return rng() < p;
}

// Draw a single sigma_i from LogNormal(mean=mu, CV=cv) using one rng() call pair.
// Used to assign per-animal detection scales when heterogeneous sigma is active.
// The parameterisation ensures E[sigma_i] = mu regardless of cv.
export function drawLognormal(mu, cv, rng) {
  const tau    = Math.sqrt(Math.log(1 + cv * cv));  // log-SD
  const muLog  = Math.log(mu) - tau * tau / 2;      // log-mean (bias correction)
  // Box-Muller normal variate
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(muLog + tau * z);
}

/**
 * secr-engine.js — SECR simulation engine
 *
 * Pure JS. No UI or p5 dependencies.
 * The sketch (secr/sketch.js) calls these functions each frame and renders the result.
 *
 * Exports (v2 — stubs for now):
 *   placeAnimals(n, arenaW, arenaH, rng)  → array of animals with activity centres
 *   stepAnimal(animal, rng)               → updated animal position (Lévy walk)
 *   tryDetect(animal, detector, g0, sigma, rng)  → true if captured this frame
 */

import { halfNormal } from './stats.js';
import { distance } from './spatial.js';

// TODO: placeAnimals — place activity centres + generate attraction points from seed
// TODO: stepAnimal  — Lévy walk biased toward attraction points
// TODO: placeDetectors — generate n×n grid of detectors at given spacing

// Attempt detection of one animal by one detector
export function tryDetect(animal, detector, g0, sigma, rng) {
  const d = distance(animal.pos, detector.pos);
  const p = g0 * halfNormal(d, sigma);
  return rng() < p;
}

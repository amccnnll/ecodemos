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

import { halfNormal } from './stats.js';

// Place n animals uniformly at random across the arena
export function placeAnimals(n, arenaW, arenaH, rng) {
  const animals = [];
  for (let i = 0; i < n; i++) {
    animals.push({ x: rng() * arenaW, y: rng() * arenaH, detected: false });
  }
  return animals;
}

// Attempt detection of one animal as the boat passes
// Returns true if detected this frame, false otherwise
export function tryDetect(animal, boatX, boatSpeed, transectY, sigma, W, rng) {
  if (animal.detected) return false;                      // already detected
  const perpDist = Math.abs(animal.y - transectY);       // perpendicular distance
  if (perpDist > W) return false;                         // beyond truncation distance
  const atBeam = Math.abs(boatX - animal.x) <= boatSpeed;
  if (!atBeam) return false;                              // not yet abeam the boat
  const p = halfNormal(perpDist, sigma);                  // g(0) = 1 by construction
  return rng() < p;
}

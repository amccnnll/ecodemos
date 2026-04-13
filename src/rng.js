/**
 * rng.js — seedable random number generator
 *
 * Thin wrapper around the seedrandom library (loaded as a global).
 * All stochastic operations in engines and sketches should use
 * the rng() function from this module — never Math.random() directly.
 *
 * Usage:
 *   import { createRng } from '../src/rng.js';
 *   const rng = createRng(42);
 *   rng(); // → deterministic value in [0, 1)
 */

export function createRng(seed) {
  // seedrandom is loaded as a CDN global and patches Math.random
  // Using the factory form here to get an isolated rng instance
  return new Math.seedrandom(seed);
}

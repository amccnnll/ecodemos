/**
 * spatial.js — shared spatial utilities
 *
 * Pure functions. No UI dependencies.
 * Used by both ds-engine.js and secr-engine.js.
 */

// Euclidean distance between two points {x, y}
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// TODO: point-in-polygon (needed for state space boundary checks in SECR)

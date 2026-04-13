/**
 * stats.js — shared statistical utilities
 *
 * Pure functions. No UI dependencies.
 * Used by both ds-engine.js and secr-engine.js.
 */

// Half-normal detection function: g(x) = exp(-x² / 2σ²)
export function halfNormal(x, sigma) {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

// TODO: erf and normal distribution utilities (needed for ESW calculation)
// TODO: golden-section search for MLE sigma fitting (DS module)

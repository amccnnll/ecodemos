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

// Error function (Abramowitz & Stegun approximation, max error 1.5e-7)
export function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 +
               t * (-0.284496736 +
               t * (1.421413741 +
               t * (-1.453152027 +
               t * 1.061405429))));
  const result = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? result : -result;
}

// Effective strip width: ∫₀^W g(x) dx for the half-normal
// = σ * √(π/2) * erf(W / (σ√2))
export function computeESW(sigma, W) {
  return sigma * Math.sqrt(Math.PI / 2) * erf(W / (sigma * Math.SQRT2));
}

// DS density estimator: D̂ = n / (2 * L * ESW)
// L = transect length, n = number of detections
export function estimateDensity(n, L, sigma, W) {
  const esw = computeESW(sigma, W);
  return n / (2 * L * esw);
}

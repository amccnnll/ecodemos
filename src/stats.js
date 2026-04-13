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

// Hazard-rate detection function: g(x) = 1 − exp(−(σ/x)^b)
// g(0) = 1 by convention (limit as x → 0⁺); b controls shoulder width.
export function hazardRate(x, sigma, b) {
  if (x <= 0) return 1;
  return 1 - Math.exp(-Math.pow(sigma / x, b));
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

// Effective strip width for half-normal: ∫₀^W g(x) dx = σ√(π/2)·erf(W/(σ√2))
export function computeESW(sigma, W) {
  return sigma * Math.sqrt(Math.PI / 2) * erf(W / (sigma * Math.SQRT2));
}

// Effective strip width for hazard rate: ∫₀^W g(x) dx via trapezoid rule
export function computeESW_HR(sigma, b, W, steps = 200) {
  const dx = W / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const gx = hazardRate(i * dx, sigma, b);
    sum += (i === 0 || i === steps) ? gx * 0.5 : gx;
  }
  return sum * dx;
}

// DS density estimator: D̂ = n / (2 · L · ESW)
// modelFn: 'halfNormal' | 'hazardRate'
export function estimateDensity(n, L, sigma, W, modelFn = 'halfNormal', b = 2.5) {
  const esw = modelFn === 'hazardRate' ? computeESW_HR(sigma, b, W) : computeESW(sigma, W);
  return n / (2 * L * esw);
}

// ─── MLE fitting ─────────────────────────────────────────────────────────────

// Fit σ by minimising the negative log-likelihood of observed perpendicular
// distances under the selected truncated detection function model.
//
// Half-normal NLL:  n·log(ESW(σ))  +  Σ dᵢ²/(2σ²)
// Hazard-rate NLL:  n·log(ESW(σ,b)) − Σ log(g_HR(dᵢ, σ, b))
//
// b is held fixed during the search (golden-section over σ only).
// Requires ≥ 2 detected distances; returns null otherwise.
export function fitSigmaMLE(distances, W, modelFn = 'halfNormal', b = 2.5) {
  if (!distances || distances.length < 2) return null;
  const n = distances.length;

  function nll(sigma) {
    const esw = modelFn === 'hazardRate'
      ? computeESW_HR(sigma, b, W)
      : computeESW(sigma, W);
    if (esw <= 0 || !isFinite(esw)) return Infinity;

    if (modelFn === 'hazardRate') {
      let sumNegLog = 0;
      for (const d of distances) {
        const g = hazardRate(d, sigma, b);
        if (g <= 0) return Infinity;
        sumNegLog -= Math.log(g);
      }
      return n * Math.log(esw) + sumNegLog;
    } else {
      let sumSq = 0;
      for (const d of distances) sumSq += d * d;
      return n * Math.log(esw) + sumSq / (2 * sigma * sigma);
    }
  }

  return _goldenSection(nll, W / 20, W);
}

// Golden-section search for minimum of fn over [a, b].
function _goldenSection(fn, a, b, tol = 1e-6) {
  const phi = (Math.sqrt(5) - 1) / 2; // ≈ 0.618
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  while (b - a > tol) {
    if (fn(c) < fn(d)) { b = d; } else { a = c; }
    c = b - phi * (b - a);
    d = a + phi * (b - a);
  }
  return (a + b) / 2;
}

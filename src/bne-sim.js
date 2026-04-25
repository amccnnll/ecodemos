// src/bne-sim.js — dolphin population generative model.
// Pure engine: no DOM, D3, or p5 dependencies.

import { mulberry32, sampleSeaPoint, hexAtXY, sampleRadialSeaPoint } from './bne-hex.js';

// ── Guild centroids ───────────────────────────────────────────────────────
// Fixed reference points in the 3D preference space (depth proxy D_h,
// productivity P_h, disturbance R_h). Each dolphin draws its own preference
// vector θ_i from a Gaussian centred on its latent cluster's centroid.
// The guildOverlap slider controls the dispersion σ_cluster of that Gaussian:
// small σ → tight clusters (near-discrete behaviour); large σ → heavy overlap.
function makeGuildCentroids(G, rand) {
  const bases = [
    [0.9, 0.2, 0.1],  // offshore: deep, low productivity, low disturbance
    [0.1, 0.9, 0.1],  // productive nearshore: shallow, high productivity
    [0.5, 0.5, 0.85], // disturbance tolerant: mixed depth, high disturbance
    [0.2, 0.7, 0.3],  // coastal forager: shallow-ish, fairly productive
    [0.8, 0.6, 0.2],  // deep productive: deep + productive
    [0.1, 0.3, 0.6],  // nearshore disturbed: shallow, moderate productivity
  ];
  while (bases.length < G) { bases.push([rand(), rand(), rand()]); }
  return bases.slice(0, G);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function gaussian(rand) {
  const u1 = Math.max(1e-10, rand()), u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── Poisson draw ─────────────────────────────────────────────────────────
function poisson(mu, rand) {
  if (mu <= 0) return 0;
  if (mu > 30) {
    // Sum of uniforms normal approximation
    let s = 0;
    for (let i = 0; i < 12; i++) s += rand();
    return Math.max(0, Math.round(mu + Math.sqrt(mu) * (s - 6)));
  }
  // Knuth algorithm
  const L = Math.exp(-mu);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

// ── Main export ───────────────────────────────────────────────────────────
export function generateSimulation({
  hexGrid,
  N             = 60,
  G             = 4,
  guildOverlap  = 0.3,
  specialistFraction = 0.5,
  nTransients   = 15,   // extra dolphins with home range outside the arena (filter bait)
  T             = 6,
  effortBias    = 0.7,
  detectionProb = 0.3,
  sigmaScale    = 0.40,  // uniform home-range scale as fraction of domain diagonal
  specCoeff     = 10.0,  // guild affinity strength for specialists (strong habitat fidelity)
  genCoeff      = 5.0,   // guild affinity strength for generalists (weaker fidelity)
  seed          = 42,
} = {}) {
  const rand       = mulberry32((seed + 100) | 0);
  const effortRand = mulberry32((seed + 200) | 0);
  const sightRand  = mulberry32((seed + 300) | 0);

  const { hexes, domainDiag, xMin, xMax, yMin, yMax, domainW, domainH } = hexGrid;
  const seaHexes = hexes.filter(h => !h.isLand);
  const H = seaHexes.length;
  if (H === 0 || N === 0) return null;
  const shortDim = Math.min(domainW, domainH);

  // ── Guild centroids and dispersion ───────────────────────────────────
  const centroids = makeGuildCentroids(G, rand);
  // sigmaCluster: within-cluster dispersion of θ_i around its centroid.
  // overlap=0 → tight clusters (σ=0.05); overlap=0.9 → heavy mixing (σ=0.455).
  const sigmaCluster = 0.05 + guildOverlap * 0.45;
  // Specialists draw θ from a tighter Gaussian than generalists: their habitat
  // preferences are more peaked on the guild's axes, not just amplified.
  const specialistThetaScale = 0.4;

  // ── Dolphins ──────────────────────────────────────────────────────────
  // Home-range centres sampled CONTINUOUSLY over the sea region (rejection sampling)
  // so the underlying truth is independent of hex size. The hex grid acts purely as
  // the observation binning: changing hexSize keeps dolphin positions fixed, only
  // the sighting-bin grain changes (clean MAUP demonstration).
  // Guild signal comes from shared habitat-type preferences, not geography.
  const dolphins = [];
  const sigma = domainDiag * sigmaScale;
  for (let i = 0; i < N; i++) {
    const guild = (rand() * G) | 0;
    const isSpecialist = rand() < specialistFraction;
    const { x: mu_x, y: mu_y } = sampleSeaPoint(hexGrid, rand);
    const gc = isSpecialist ? specCoeff : genCoeff;
    const u1 = Math.max(1e-10, rand()), u2 = rand();
    const activity = 0.25 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // θ_i: per-dolphin preference vector drawn from N(centroid_guild, σ_θ² I).
    // Specialists use a tighter σ_θ so their preferences sit closer to the guild centroid.
    const mu = centroids[guild];
    const sigmaTheta = isSpecialist ? sigmaCluster * specialistThetaScale : sigmaCluster;
    const theta = [
      clamp01(mu[0] + sigmaTheta * gaussian(rand)),
      clamp01(mu[1] + sigmaTheta * gaussian(rand)),
      clamp01(mu[2] + sigmaTheta * gaussian(rand)),
    ];
    dolphins.push({ dolphin_id: i, guild_true: guild, isSpecialist, isResident: true, guildCoeff: gc,
                    mu_x, mu_y, sigma, activity, theta });
  }

  // ── Transient dolphins ────────────────────────────────────────────────
  // Home-range centres placed just outside the arena boundary so Gaussian tails
  // produce at most a handful of edge sightings. Transients typically fail the
  // ≥4 filter, contributing to raw sightings but not to the analysis pipeline.
  for (let j = 0; j < nTransients; j++) {
    const edge = (rand() * 4) | 0;  // 0=top, 1=bottom, 2=left, 3=right
    const offset = (0.15 + rand() * 0.25) * shortDim;
    let mu_x, mu_y;
    if      (edge === 0) { mu_x = xMin + rand() * domainW; mu_y = yMin - offset; }
    else if (edge === 1) { mu_x = xMin + rand() * domainW; mu_y = yMax + offset; }
    else if (edge === 2) { mu_x = xMin - offset;           mu_y = yMin + rand() * domainH; }
    else                 { mu_x = xMax + offset;           mu_y = yMin + rand() * domainH; }
    const u1 = Math.max(1e-10, rand()), u2 = rand();
    const activity = 0.25 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // Transients get a random θ (uniform) — used in the Truth view edges but not in λ (guildCoeff=0).
    const theta = [rand(), rand(), rand()];
    dolphins.push({ dolphin_id: N + j, guild_true: -1, isSpecialist: false, isResident: false,
                    guildCoeff: 0, mu_x, mu_y, sigma, activity, theta });
  }

  const Ntotal = dolphins.length;

  // ── Latent use λ per dolphin × sea hex ────────────────────────────────
  // log λ_{i,h} = -4 + activity + guildCoeff * normScore_i(h) + homeRange
  // normScore_i(h) = min-max normalised dot product θ_i · [D_h, P_h, -R_h] so
  // each dolphin's preferred hex is 1 and least preferred is 0.  guildCoeff
  // then sets the contrast: specialists (10) are sharply peaked, generalists (5)
  // moderately so, transients (0) have no habitat preference term.
  const lambdaIH = new Float64Array(Ntotal * H);
  const sig2 = 2 * sigma * sigma;
  const rawScore = new Float64Array(H);
  for (let i = 0; i < Ntotal; i++) {
    const d = dolphins[i];
    // Compute raw habitat scores and find range for normalisation
    let mn = Infinity, mx = -Infinity;
    for (let hi = 0; hi < H; hi++) {
      const hx = seaHexes[hi];
      rawScore[hi] = d.theta[0] * hx.D_h + d.theta[1] * hx.P_h - d.theta[2] * hx.R_h;
      if (rawScore[hi] < mn) mn = rawScore[hi];
      if (rawScore[hi] > mx) mx = rawScore[hi];
    }
    const rng = mx - mn || 1;
    for (let hi = 0; hi < H; hi++) {
      const hx = seaHexes[hi];
      const score = (rawScore[hi] - mn) / rng;
      const dx = hx.x - d.mu_x, dy = hx.y - d.mu_y;
      const homeRangePenalty = -(dx * dx + dy * dy) / sig2;
      const logLam = -4.0 + d.activity + d.guildCoeff * score + homeRangePenalty;
      lambdaIH[i * H + hi] = Math.exp(logLam);
    }
  }

  // ── Survey effort: radial sample points from port ─────────────────────
  // M_PER_YEAR points drawn per year from a 2D half-normal (Rayleigh) field
  // centred on the port. sigmaEff controls the radial decay: high effortBias
  // keeps effort nearshore, low effortBias spreads it across the domain.
  // Hex size only affects post-hoc binning (same as the dolphin home ranges).
  const M_PER_YEAR = 60;
  // Rayleigh sigma: density peaks AT sigmaEff, so keep it well below the sea extent.
  // effortBias=1 → tightly nearshore; effortBias=0 → spread across domain.
  const sigmaEff = (0.05 + (1 - effortBias) * 0.30) * domainDiag;

  const seaIdxMap = new Map(seaHexes.map((h, i) => [h.hex_id, i]));

  // Port: nearshore (distFromCoast < 0.25) sea hex closest to x-centroid.
  const centX = seaHexes.reduce((s, h) => s + h.x, 0) / H;
  const shallowSea = seaHexes.filter(h => h.distFromCoast < 0.25);
  const portCandidates = shallowSea.length > 0 ? shallowSea : seaHexes;
  const portHex = portCandidates.reduce((best, h) =>
    Math.abs(h.x - centX) < Math.abs(best.x - centX) ? h : best);

  // ── Observed sightings and effort ─────────────────────────────────────
  // Each sample point contributes Gamma(2,1) effort to its hex; detections
  // are drawn Poisson per (point × dolphin).
  const effortHT    = new Float64Array(H * T);
  const sightingsIH = new Float64Array(Ntotal * H);
  const effortH     = new Float64Array(H);

  for (let t = 0; t < T; t++) {
    for (let m = 0; m < M_PER_YEAR; m++) {
      const pt  = sampleRadialSeaPoint(hexGrid, portHex.x, portHex.y, sigmaEff, effortRand);
      const hex = hexAtXY(hexGrid, pt.x, pt.y);
      if (!hex || hex.isLand) continue;
      const hi = seaIdxMap.get(hex.hex_id);
      if (hi === undefined) continue;
      const g1 = -Math.log(Math.max(1e-10, effortRand()));
      const g2 = -Math.log(Math.max(1e-10, effortRand()));
      const e_w = g1 + g2;   // Gamma(2,1), dimensionless
      effortHT[hi * T + t] += e_w;
      for (let i = 0; i < Ntotal; i++) {
        const mu = e_w * detectionProb * lambdaIH[i * H + hi];
        sightingsIH[i * H + hi] += poisson(mu, sightRand);
      }
    }
  }

  for (let hi = 0; hi < H; hi++)
    for (let t = 0; t < T; t++) effortH[hi] += effortHT[hi * T + t];

  // Total sightings per dolphin; retain only those with >= 4
  const totalSightings = new Float64Array(Ntotal);
  for (let i = 0; i < Ntotal; i++) {
    for (let hi = 0; hi < H; hi++) totalSightings[i] += sightingsIH[i * H + hi];
  }
  const retainedDolphins = dolphins.filter((_, i) => totalSightings[i] >= 4);

  return { dolphins, retainedDolphins, centroids, seaHexes, portHex,
           sightingsIH, effortH, effortHT, lambdaIH, totalSightings,
           N, Ntotal, H, G, T };
}

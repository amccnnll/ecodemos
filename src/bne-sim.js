// src/bne-sim.js — dolphin population generative model.
// Pure engine: no DOM, D3, or p5 dependencies.

import { mulberry32 } from './bne-hex.js';

// ── Guild preference profiles ─────────────────────────────────────────────
// Each guild has weights [wD, wP, wR] over (depth-like, productivity, disturbance).
// Guild signal comes from habitat-type preferences, NOT home-range geography.
function makeGuildProfiles(G, overlap, rand) {
  const bases = [
    [0.9, 0.2, 0.1],  // offshore: deep, low productivity, low disturbance
    [0.1, 0.9, 0.1],  // productive nearshore: shallow, high productivity
    [0.5, 0.5, 0.85], // disturbance tolerant: mixed depth, high disturbance
    [0.2, 0.7, 0.3],  // coastal forager: shallow-ish, fairly productive
    [0.8, 0.6, 0.2],  // deep productive: deep + productive
    [0.1, 0.3, 0.6],  // nearshore disturbed: shallow, moderate productivity
  ];
  while (bases.length < G) {
    bases.push([rand(), rand(), rand()]);
  }
  // Mix each base toward centroid [0.5, 0.5, 0.5] by the overlap factor
  return bases.slice(0, G).map(base =>
    base.map(v => (1 - overlap) * v + overlap * 0.5)
  );
}

function guildScore(profile, hex) {
  return profile[0] * hex.D_h + profile[1] * hex.P_h - profile[2] * hex.R_h;
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
  T             = 6,
  effortBias    = 0.7,
  detectionProb = 0.3,
  sigmaSpecialist = 0.28,  // home-range scale as fraction of domain diagonal
  sigmaGeneralist = 0.55,
  seed          = 42,
} = {}) {
  const rand       = mulberry32((seed + 100) | 0);
  const effortRand = mulberry32((seed + 200) | 0);
  const sightRand  = mulberry32((seed + 300) | 0);

  const { hexes, domainDiag } = hexGrid;
  const seaHexes = hexes.filter(h => !h.isLand);
  const H = seaHexes.length;
  if (H === 0 || N === 0) return null;

  // ── Guild profiles ────────────────────────────────────────────────────
  const guildProfiles = makeGuildProfiles(G, guildOverlap, rand);

  // Pre-compute and normalise guild preference scores per sea hex
  const guildScores = guildProfiles.map(profile => {
    const raw = seaHexes.map(h => guildScore(profile, h));
    const mn = Math.min(...raw), mx = Math.max(...raw);
    const rng = mx - mn || 1;
    return raw.map(v => (v - mn) / rng);
  });

  // ── Dolphins ──────────────────────────────────────────────────────────
  // Home-range centres drawn UNIFORMLY from sea hexes — NOT clustered by guild.
  // Guild signal comes from shared habitat-type preferences, not geography.
  const dolphins = [];
  for (let i = 0; i < N; i++) {
    const guild = (rand() * G) | 0;
    const isSpecialist = rand() < specialistFraction;
    const homeHex = seaHexes[(rand() * H) | 0];
    const sigma = domainDiag * (isSpecialist ? sigmaSpecialist : sigmaGeneralist);
    // Box-Muller for activity level
    const u1 = Math.max(1e-10, rand()), u2 = rand();
    const activity = 0.25 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    dolphins.push({ dolphin_id: i, guild_true: guild, isSpecialist, mu_x: homeHex.x, mu_y: homeHex.y, sigma, activity });
  }

  // ── Latent use λ per dolphin × sea hex ────────────────────────────────
  // log λ_{i,h} = -4.0 + activity + 6.0 * guild_score + home_range_penalty
  // Guild coefficient 6.0 gives exp(6) ≈ 403× contrast between best and worst
  // hexes for a guild, creating clearly distinct B* profiles across guilds.
  const lambdaIH = new Float64Array(N * H);
  for (let i = 0; i < N; i++) {
    const d = dolphins[i];
    const g = d.guild_true;
    const sig2 = 2 * d.sigma * d.sigma;
    for (let hi = 0; hi < H; hi++) {
      const hx = seaHexes[hi];
      const dx = hx.x - d.mu_x, dy = hx.y - d.mu_y;
      const homeRangePenalty = -(dx * dx + dy * dy) / sig2;
      const logLam = -4.0 + d.activity + 6.0 * guildScores[g][hi] + homeRangePenalty;
      lambdaIH[i * H + hi] = Math.exp(logLam);
    }
  }

  // ── Survey effort per sea hex × year ─────────────────────────────────
  // Higher effort near the coastline (nearshore corridor).
  const effortHT = new Float64Array(H * T);
  for (let hi = 0; hi < H; hi++) {
    const corridorWeight = 1 + effortBias * 3 * (1 - seaHexes[hi].distFromCoast);
    for (let t = 0; t < T; t++) {
      // Gamma(2, corridorWeight/2): mean = corridorWeight, some variance
      const g1 = -Math.log(Math.max(1e-10, effortRand()));
      const g2 = -Math.log(Math.max(1e-10, effortRand()));
      effortHT[hi * T + t] = (g1 + g2) * (corridorWeight / 2);
    }
  }

  // ── Observed sightings aggregated over years ──────────────────────────
  const sightingsIH = new Float64Array(N * H);
  const effortH     = new Float64Array(H);

  for (let hi = 0; hi < H; hi++) {
    for (let t = 0; t < T; t++) {
      const E = effortHT[hi * T + t];
      effortH[hi] += E;
      for (let i = 0; i < N; i++) {
        const mu = E * detectionProb * lambdaIH[i * H + hi];
        sightingsIH[i * H + hi] += poisson(mu, sightRand);
      }
    }
  }

  // Total sightings per dolphin; retain only those with >= 4
  const totalSightings = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (let hi = 0; hi < H; hi++) totalSightings[i] += sightingsIH[i * H + hi];
  }
  const retainedDolphins = dolphins.filter((_, i) => totalSightings[i] >= 4);

  return { dolphins, retainedDolphins, guildProfiles, guildScores, seaHexes,
           sightingsIH, effortH, effortHT, lambdaIH, totalSightings, N, H, G, T };
}

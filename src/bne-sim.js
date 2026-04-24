// src/bne-sim.js — dolphin population generative model.
// Pure engine: no DOM, D3, or p5 dependencies.

import { mulberry32, sampleSeaPoint } from './bne-hex.js';

const SQRT3 = Math.sqrt(3);

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
    // Specialists have stronger habitat fidelity (high guildCoeff) rather than a
    // smaller home range. Both types roam equally; specialists just prefer their
    // guild's habitat type more strongly.
    const gc = isSpecialist ? specCoeff : genCoeff;
    const u1 = Math.max(1e-10, rand()), u2 = rand();
    const activity = 0.25 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    dolphins.push({ dolphin_id: i, guild_true: guild, isSpecialist, isResident: true, guildCoeff: gc,
                    mu_x, mu_y, sigma, activity });
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
    dolphins.push({ dolphin_id: N + j, guild_true: -1, isSpecialist: false, isResident: false,
                    guildCoeff: 0, mu_x, mu_y, sigma, activity });
  }

  const Ntotal = dolphins.length;

  // ── Latent use λ per dolphin × sea hex ────────────────────────────────
  // log λ_{i,h} = -4.0 + activity + guildCoeff * guild_score + home_range_penalty
  // Specialists: guildCoeff=10 → exp(10) ≈ 22000× contrast between best and worst
  // hexes, so B* concentrates sharply in guild-preferred habitat (low core50).
  // Generalists: guildCoeff=5 → exp(5) ≈ 148× contrast, B* spread more evenly.
  // Transients: guildCoeff=0, home range outside arena → weak edge sightings only.
  const lambdaIH = new Float64Array(Ntotal * H);
  const sig2 = 2 * sigma * sigma;
  for (let i = 0; i < Ntotal; i++) {
    const d = dolphins[i];
    const g = d.guild_true;
    for (let hi = 0; hi < H; hi++) {
      const hx = seaHexes[hi];
      const dx = hx.x - d.mu_x, dy = hx.y - d.mu_y;
      const homeRangePenalty = -(dx * dx + dy * dy) / sig2;
      const guildTerm = g >= 0 ? d.guildCoeff * guildScores[g][hi] : 0;
      const logLam = -4.0 + d.activity + guildTerm + homeRangePenalty;
      lambdaIH[i * H + hi] = Math.exp(logLam);
    }
  }

  // ── Survey effort: tendril routes from a single port hex ─────────────
  // Routes are tendril hex-walks in continuous space: each hex centre visited is
  // a waypoint at a known (x, y). Effort and detections are computed per waypoint
  // so that hex size only affects post-hoc binning, not the observation process.
  //
  // Physical step length between adjacent hex centres (pointy-top).
  const delta = hexGrid.hexSize * SQRT3;
  // Route length in continuous units; n_steps constant regardless of hex size.
  const L_cont   = (0.10 + (1 - effortBias) * 0.40) * domainDiag;
  const n_steps  = Math.max(3, Math.round(L_cont / delta));

  const HEX_DIRS  = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  const hexByQR   = new Map(hexes.map(h => [`${h.q},${h.r}`, h]));
  const seaIdxMap = new Map(seaHexes.map((h, i) => [h.hex_id, i]));

  // Port: nearshore (distFromCoast < 0.25) sea hex closest to x-centroid.
  const centX = seaHexes.reduce((s, h) => s + h.x, 0) / H;
  const shallowSea = seaHexes.filter(h => h.distFromCoast < 0.25);
  const portCandidates = shallowSea.length > 0 ? shallowSea : seaHexes;
  const portHex = portCandidates.reduce((best, h) =>
    Math.abs(h.x - centX) < Math.abs(best.x - centX) ? h : best);

  // K_year routes per year, each with a fresh bearing offset.
  const K_year = 4;

  // Returns array of waypoint hex arrays for K routes from a given bearing offset.
  function walkRoutes(K, bearingOffset) {
    const routes = [];
    for (let ri = 0; ri < K; ri++) {
      const bearing = bearingOffset + (ri / K) * 2 * Math.PI;
      const waypoints = [portHex];
      let cur = portHex;
      for (let s = 0; s < n_steps; s++) {
        let bestHex = null, bestAligned = Infinity;
        const candidates = [];
        for (const [dq, dr] of HEX_DIRS) {
          const nbr = hexByQR.get(`${cur.q + dq},${cur.r + dr}`);
          if (!nbr || nbr.isLand) continue;
          const angle = Math.atan2(nbr.y - cur.y, nbr.x - cur.x);
          const diff = Math.abs(((angle - bearing + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
          candidates.push({ hex: nbr, diff });
          if (diff < bestAligned) { bestAligned = diff; bestHex = nbr; }
        }
        if (!bestHex) break;
        const chosen = (effortRand() < 0.20 && candidates.length > 1)
          ? candidates[(effortRand() * candidates.length) | 0].hex
          : bestHex;
        waypoints.push(chosen);
        cur = chosen;
      }
      routes.push(waypoints);
    }
    return routes;
  }

  // ── Observed sightings and effort ─────────────────────────────────────
  // Effort and sightings accumulate per waypoint. Each waypoint contributes
  // delta * Gamma(2,1) effort to its hex; detections are drawn Poisson per
  // (waypoint × dolphin) so that hex size only determines the binning grain.
  const effortHT    = new Float64Array(H * T);
  const sightingsIH = new Float64Array(Ntotal * H);
  const effortH     = new Float64Array(H);

  for (let t = 0; t < T; t++) {
    const bearingOffset = effortRand() * (2 * Math.PI / K_year);
    const routes = walkRoutes(K_year, bearingOffset);
    for (const waypoints of routes) {
      for (const wp of waypoints) {
        const hi = seaIdxMap.get(wp.hex_id);
        if (hi === undefined) continue;
        const g1 = -Math.log(Math.max(1e-10, effortRand()));
        const g2 = -Math.log(Math.max(1e-10, effortRand()));
        const e_wp = delta * (g1 + g2);   // Gamma(2,1) scaled by step length
        effortHT[hi * T + t] += e_wp;
        for (let i = 0; i < Ntotal; i++) {
          const mu = e_wp * detectionProb * lambdaIH[i * H + hi];
          sightingsIH[i * H + hi] += poisson(mu, sightRand);
        }
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

  return { dolphins, retainedDolphins, guildProfiles, guildScores, seaHexes,
           sightingsIH, effortH, effortHT, lambdaIH, totalSightings,
           N, Ntotal, H, G, T };
}

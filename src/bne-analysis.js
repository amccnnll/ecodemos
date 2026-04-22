// src/bne-analysis.js — B*, weighted Jaccard, kNN pruning, Louvain.
// Pure engine: no DOM, D3, or p5 dependencies.

export function runAnalysis(simData, params) {
  const { retainedDolphins, seaHexes, sightingsIH, effortH } = simData;
  const { eMin = 5, k = 8, louvainResolution = 1.0, minCommunitySize = 3 } = params;
  const H = seaHexes.length;
  const dolphins = retainedDolphins;
  const N = dolphins.length;
  if (N < 2) return null;

  // ── B* matrix ────────────────────────────────────────────────────────────
  const Bstar = new Float64Array(N * H);
  for (let i = 0; i < N; i++) {
    const di = dolphins[i].dolphin_id;
    for (let hi = 0; hi < H; hi++) {
      Bstar[i * H + hi] = sightingsIH[di * H + hi] / Math.max(effortH[hi], eMin);
    }
  }

  // ── Row-normalise B* before Jaccard ─────────────────────────────────────
  // Normalise each dolphin's B* row to unit sum (probability distribution over
  // hexes) so Jaccard compares habitat-preference shape, not absolute sighting
  // counts. This removes activity-level variation and makes same-guild dolphins
  // comparable even when one has far more sightings than another.
  const BnormI = new Float64Array(N * H);
  for (let i = 0; i < N; i++) {
    let tot = 0;
    for (let hi = 0; hi < H; hi++) tot += Bstar[i * H + hi];
    if (tot > 0) for (let hi = 0; hi < H; hi++) BnormI[i * H + hi] = Bstar[i * H + hi] / tot;
  }

  // ── Weighted Jaccard on normalised profiles ──────────────────────────────
  const jaccard = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let num = 0, den = 0;
      const offI = i * H, offJ = j * H;
      for (let hi = 0; hi < H; hi++) {
        const a = BnormI[offI + hi], b = BnormI[offJ + hi];
        num += a < b ? a : b;
        den += a > b ? a : b;
      }
      const wj = den > 1e-12 ? num / den : 0;
      jaccard[i * N + j] = wj;
      jaccard[j * N + i] = wj;
    }
  }

  // ── kNN pruning ──────────────────────────────────────────────────────────
  // Each dolphin keeps its k strongest edges; symmetrise by taking the max.
  const knnAdj = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    const row = [];
    for (let j = 0; j < N; j++) {
      if (j !== i) row.push({ j, w: jaccard[i * N + j] });
    }
    row.sort((a, b) => b.w - a.w);
    const topK = Math.min(k, row.length);
    for (let ri = 0; ri < topK; ri++) {
      knnAdj[i * N + row[ri].j] = row[ri].w;
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const w = Math.max(knnAdj[i * N + j], knnAdj[j * N + i]);
      knnAdj[i * N + j] = w;
      knnAdj[j * N + i] = w;
    }
  }

  // Edge list from kNN (undirected, deduped)
  const edges = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const w = knnAdj[i * N + j];
      if (w > 0) edges.push({ u: i, v: j, w });
    }
  }

  // ── Louvain community detection ──────────────────────────────────────────
  const rawComms = louvain(N, edges, louvainResolution);

  // Filter communities smaller than minCommunitySize
  const commCounts = new Map();
  for (const c of rawComms) commCounts.set(c, (commCounts.get(c) || 0) + 1);
  const communities = rawComms.map(c => (commCounts.get(c) >= minCommunitySize) ? c : -1);

  const nCommunities = new Set(communities.filter(c => c >= 0)).size;
  const Q = computeModularity(N, edges, communities);

  // ── Within/between similarity ratio ─────────────────────────────────────
  let sumW = 0, nW = 0, sumB = 0, nB = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const ci = communities[i], cj = communities[j];
      const wj = jaccard[i * N + j];
      if (ci >= 0 && ci === cj) { sumW += wj; nW++; }
      else if (ci >= 0 && cj >= 0) { sumB += wj; nB++; }
    }
  }
  const withinBetweenRatio = (nW > 0 && nB > 0) ? (sumW / nW) / (sumB / nB) : null;

  return { Bstar, jaccard, knnAdj, edges, rawComms, communities, nCommunities, Q, withinBetweenRatio, dolphins, H, N };
}

// ── Louvain ───────────────────────────────────────────────────────────────
function louvain(N, edges, resolution = 1.0) {
  if (N === 0) return [];
  if (edges.length === 0) return Array.from({ length: N }, (_, i) => i);

  const degree = new Float64Array(N);
  const adj    = Array.from({ length: N }, () => []);
  let m = 0;

  for (const { u, v, w } of edges) {
    adj[u].push({ nbr: v, w });
    adj[v].push({ nbr: u, w });
    degree[u] += w; degree[v] += w;
    m += w;
  }

  const comm   = Int32Array.from({ length: N }, (_, i) => i);
  const sigTot = Float64Array.from(degree);
  const sigIn  = new Float64Array(N);

  let improved = true;
  let passes = 0;

  while (improved && passes++ < 100) {
    improved = false;
    for (let i = 0; i < N; i++) {
      const ci = comm[i];
      const ki = degree[i];

      // Remove i from its community
      sigTot[ci] -= ki;
      let ki_in_ci = 0;
      for (const { nbr, w } of adj[i]) {
        if (comm[nbr] === ci) ki_in_ci += w;
      }
      sigIn[ci] = Math.max(0, sigIn[ci] - 2 * ki_in_ci);

      // Gain for each neighbouring community
      const ngain = new Map();
      for (const { nbr, w } of adj[i]) {
        const c = comm[nbr];
        ngain.set(c, (ngain.get(c) || 0) + w);
      }
      if (!ngain.has(ci)) ngain.set(ci, 0);

      let bestC = ci, bestGain = 0;
      for (const [c, ki_c] of ngain) {
        const gain = ki_c / m - resolution * ki * sigTot[c] / (2 * m * m);
        if (gain > bestGain) { bestGain = gain; bestC = c; }
      }

      comm[i] = bestC;
      sigTot[bestC] += ki;
      sigIn[bestC] += 2 * (ngain.get(bestC) || 0);
      if (bestC !== ci) improved = true;
    }
  }

  // Compact IDs
  const remap = new Map(); let nextId = 0;
  return Array.from(comm, c => {
    if (!remap.has(c)) remap.set(c, nextId++);
    return remap.get(c);
  });
}

// ── Modularity Q ─────────────────────────────────────────────────────────
function computeModularity(N, edges, communities) {
  if (!edges.length) return 0;
  const degree = new Float64Array(N);
  let m = 0;
  for (const { u, v, w } of edges) { degree[u] += w; degree[v] += w; m += w; }
  if (m === 0) return 0;
  let Q = 0;
  for (const { u, v, w } of edges) {
    if (communities[u] >= 0 && communities[u] === communities[v]) {
      Q += w - (degree[u] * degree[v]) / (2 * m);
    }
  }
  return Q / m;
}

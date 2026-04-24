// src/bne-metrics.js — ARI, niche breadth, evenness, specialist/generalist.
// Pure engine: no DOM, D3, or p5 dependencies.

export function computeMetrics(simData, analysis) {
  const { retainedDolphins } = simData;
  const { Bstar, communities, H } = analysis;
  const N = retainedDolphins.length;

  // ── Niche breadth and Shannon evenness ───────────────────────────────────
  const nicheBreadth = new Float64Array(N);
  const evenness     = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const off = i * H;
    // Relative threshold: only count hexes with B* > 5% of this dolphin's peak.
    // Removes Poisson-noise incidentals from the niche breadth count.
    let maxB = 0;
    for (let hi = 0; hi < H; hi++) { if (Bstar[off + hi] > maxB) maxB = Bstar[off + hi]; }
    const thresh = maxB * 0.05;

    let total = 0, nonZero = 0;
    for (let hi = 0; hi < H; hi++) {
      const v = Bstar[off + hi];
      if (v > thresh) { total += v; nonZero++; }
    }
    nicheBreadth[i] = nonZero;

    // Pielou's J over ALL H sea hexes (0 * log(0) = 0 convention).
    // Normalising by log(H) rather than log(nonZero) keeps a constant
    // denominator so specialists (concentrated B*) score lower than generalists.
    let totalAll = 0;
    for (let hi = 0; hi < H; hi++) { const v = Bstar[off + hi]; if (v > 0) totalAll += v; }
    if (totalAll === 0 || H <= 1) { evenness[i] = 0; continue; }
    let shannonAll = 0;
    for (let hi = 0; hi < H; hi++) {
      const v = Bstar[off + hi];
      if (v > 0) { const p = v / totalAll; shannonAll -= p * Math.log(p); }
    }
    evenness[i] = shannonAll / Math.log(H);
  }

  // ── Core50: hexes needed to capture 50% of total B* (sorted descending) ─
  // Smaller core50 = B* concentrated in few hexes = specialist behaviour.
  const core50 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const off = i * H;
    const vals = [];
    for (let hi = 0; hi < H; hi++) { const v = Bstar[off + hi]; if (v > 0) vals.push(v); }
    vals.sort((a, b) => b - a);
    const total = vals.reduce((s, v) => s + v, 0);
    const half = total * 0.5;
    let cum = 0, count = 0;
    for (const v of vals) { cum += v; count++; if (cum >= half) break; }
    core50[i] = count;
  }

  // ── Specialist/generalist (median niche-breadth split) ───────────────────
  const sorted  = Float64Array.from(nicheBreadth).sort();
  const medianNB = sorted[Math.floor(N / 2)];
  const strategy = Array.from(nicheBreadth, nb => nb < medianNB ? 'specialist' : 'generalist');

  // ── ARI vs true guilds ───────────────────────────────────────────────────
  const trueLabels      = retainedDolphins.map(d => d.guild_true);
  const predictedLabels = communities;
  const ari = adjustedRandIndex(trueLabels, predictedLabels);

  return { nicheBreadth, evenness, core50, strategy, ari, medianNB };
}

// ── Adjusted Rand Index ───────────────────────────────────────────────────
function adjustedRandIndex(labels1, labels2) {
  const n = labels1.length;
  if (n === 0) return 0;

  const count12 = new Map();
  const count1  = new Map();
  const count2  = new Map();
  let valid = 0;

  for (let i = 0; i < n; i++) {
    const a = labels1[i], b = labels2[i];
    if (a < 0 || b < 0) continue;
    valid++;
    count1.set(a, (count1.get(a) || 0) + 1);
    count2.set(b, (count2.get(b) || 0) + 1);
    const key = `${a},${b}`;
    count12.set(key, (count12.get(key) || 0) + 1);
  }
  if (valid < 2) return 0;

  function C2(x) { return x < 2 ? 0 : x * (x - 1) / 2; }

  let sumC12 = 0; for (const v of count12.values()) sumC12 += C2(v);
  let sumC1  = 0; for (const v of count1.values())  sumC1  += C2(v);
  let sumC2  = 0; for (const v of count2.values())  sumC2  += C2(v);

  const cn2 = C2(valid);
  if (cn2 === 0) return 1;
  const expected = (sumC1 * sumC2) / cn2;
  const maxRI    = (sumC1 + sumC2) / 2;
  if (maxRI === expected) return 1;

  return (sumC12 - expected) / (maxRI - expected);
}

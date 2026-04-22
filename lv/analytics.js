import { subscribe, state } from "./state.js";

// ── Persistent chart state ────────────────────────────────────────────────────
// Built once; rebuilt only when the container dimensions change.
// This avoids removing and recreating ~100 SVG DOM nodes every animation frame.

let _ts = null;   // time-series chart refs
let _pp = null;   // phase-plane chart refs

// ── Time-series chart ─────────────────────────────────────────────────────────

function buildTimeSeries(host, W, H) {
  host.selectAll("*").remove();
  const m = { t: 14, r: 12, b: 28, l: 42 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const svg = host.append("svg").attr("width", W).attr("height", H);
  const g   = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

  const x = d3.scaleLinear().range([0, iw]);
  const y = d3.scaleLinear().range([ih, 0]);

  const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`);
  const yAxisG = g.append("g").attr("class", "axis");

  g.append("text").attr("class", "chart-label")
    .attr("x", iw / 2).attr("y", ih + 24).attr("text-anchor", "middle").text("Time");
  g.append("text").attr("class", "chart-label")
    .attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -30)
    .attr("text-anchor", "middle").text("Population size");

  const linePrey = d3.line().x(d => x(d.t)).y(d => y(d.prey));
  const linePred = d3.line().x(d => x(d.t)).y(d => y(d.predator));

  const pathPrey = g.append("path").attr("fill", "none")
    .attr("stroke", "#4f81d8").attr("stroke-width", 2);
  const pathPred = g.append("path").attr("fill", "none")
    .attr("stroke", "#df614b").attr("stroke-width", 2);
  const lblPrey = g.append("text").attr("class", "chart-label").attr("text-anchor", "end");
  const lblPred = g.append("text").attr("class", "chart-label").attr("text-anchor", "end");

  return { W, H, iw, g, x, y, xAxisG, yAxisG, linePrey, linePred, pathPrey, pathPred, lblPrey, lblPred };
}

function drawTimeSeries(s) {
  const host = d3.select("#chart-lv-main-timeseries");
  const W = host.node()?.clientWidth  || 0;
  const H = host.node()?.clientHeight || 0;
  if (W <= 1 || H <= 1) return;

  if (!_ts || _ts.W !== W || _ts.H !== H) _ts = buildTimeSeries(host, W, H);
  const c = _ts;

  // Manual max scan — avoids creating intermediate arrays (d3.max uses callbacks)
  let yMax = 1;
  for (const d of s.series) { if (d.prey > yMax) yMax = d.prey; if (d.predator > yMax) yMax = d.predator; }
  const xMin = s.series.length ? s.series[0].t : 0;
  const xMax = Math.max(xMin + 1e-6, s.series.length ? s.series[s.series.length - 1].t : 1);

  c.x.domain([xMin, xMax]);
  c.y.domain([0, yMax * 1.05]);
  c.xAxisG.call(d3.axisBottom(c.x).ticks(5));
  c.yAxisG.call(d3.axisLeft(c.y).ticks(5));

  c.pathPrey.datum(s.series).attr("d", c.linePrey);
  c.pathPred.datum(s.series).attr("d", c.linePred);

  const last = s.series[s.series.length - 1];
  if (last) {
    c.lblPrey.attr("x", c.iw).attr("y", c.y(last.prey) - 6)
      .text(s.modelType === "competition" ? "Species 1" : "Prey");
    c.lblPred.attr("x", c.iw).attr("y", c.y(last.predator) + 12)
      .text(s.modelType === "competition" ? "Species 2" : "Predators");
  }
}

// ── Phase-plane chart ─────────────────────────────────────────────────────────

function buildPhasePlane(host, W, H) {
  host.selectAll("*").remove();
  const m = { t: 14, r: 14, b: 30, l: 38 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const svg = host.append("svg").attr("width", W).attr("height", H);
  const g   = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

  const x = d3.scaleLinear().range([0, iw]);
  const y = d3.scaleLinear().range([ih, 0]);

  const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`);
  const yAxisG = g.append("g").attr("class", "axis");

  const line = d3.line().x(d => x(d.prey)).y(d => y(d.predator));

  const path = g.append("path").attr("fill", "none")
    .attr("stroke", "#5d5d5d").attr("stroke-width", 1.8);
  const dot = g.append("circle").attr("r", 4).attr("fill", "#222");

  const xLbl = g.append("text").attr("class", "chart-label")
    .attr("x", iw / 2).attr("y", ih + 26).attr("text-anchor", "middle");
  const yLbl = g.append("text").attr("class", "chart-label")
    .attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -28)
    .attr("text-anchor", "middle");

  return { W, H, g, x, y, xAxisG, yAxisG, line, path, dot, xLbl, yLbl };
}

function drawPhasePlane(s) {
  const host = d3.select("#chart-lv-phase");
  const W = host.node()?.clientWidth  || 0;
  const H = host.node()?.clientHeight || 0;
  if (W <= 1 || H <= 1) return;

  if (!_pp || _pp.W !== W || _pp.H !== H) _pp = buildPhasePlane(host, W, H);
  const c = _pp;

  // Use running maxima tracked in state — avoids O(n) scan over phaseSeries
  const xMax = Math.max(1, s.phasePreyMax);
  const yMax = Math.max(1, s.phasePredMax);

  c.x.domain([0, xMax * 1.05]);
  c.y.domain([0, yMax * 1.05]);
  c.xAxisG.call(d3.axisBottom(c.x).ticks(5));
  c.yAxisG.call(d3.axisLeft(c.y).ticks(5));

  c.path.datum(s.phaseSeries).attr("d", c.line);

  const last = s.phaseSeries[s.phaseSeries.length - 1];
  if (last) {
    c.dot.attr("cx", c.x(last.prey)).attr("cy", c.y(last.predator));
  }

  const isComp = s.modelType === "competition";
  const isDyn  = s.modelType === "dynamicPredatorPrey";
  c.xLbl.text(isComp ? "Species 1" : "Prey");
  c.yLbl.text(isComp ? "Species 2" : "Predators");
}

// ── Estimates strip ───────────────────────────────────────────────────────────

function updateEstimates(s) {
  let preyEq = 0, predEq = 0;

  if (s.modelType === "competition") {
    const denom = 1 - s.alpha12 * s.alpha21;
    if (Math.abs(denom) > 1e-8) {
      preyEq = (s.K1 - s.alpha12 * s.K2) / denom;
      predEq = (s.K2 - s.alpha21 * s.K1) / denom;
    }
  } else if (s.modelType === "dynamicPredatorPrey") {
    const kSafe = Math.max(1e-8, s.Kdyn);
    const bSafe = Math.max(1e-8, s.beta);
    const dSafe = Math.max(1e-8, s.delta);
    if (s.mPred > 1e-8) {
      const denom = dSafe + (s.mPred * s.alpha) / (bSafe * kSafe);
      if (Math.abs(denom) > 1e-8) {
        preyEq = (s.gamma + (s.mPred * s.alpha) / bSafe) / denom;
        predEq = Math.max(0, (dSafe * preyEq - s.gamma) / s.mPred);
      }
    } else {
      preyEq = s.gamma / dSafe;
      predEq = (s.alpha / bSafe) * (1 - preyEq / kSafe);
    }
  } else {
    preyEq = s.gamma > 0 && s.delta > 0 ? s.gamma / s.delta : 0;
    predEq = s.alpha > 0 && s.beta > 0  ? s.alpha / s.beta  : 0;
  }

  document.getElementById("est-lv-time").textContent     = s.t.toFixed(2);
  document.getElementById("est-lv-prey").textContent     = s.prey.toFixed(2);
  document.getElementById("est-lv-pred").textContent     = s.predator.toFixed(2);
  document.getElementById("est-lv-prey-eq").textContent  = preyEq.toFixed(2);
  document.getElementById("est-lv-pred-eq").textContent  = predEq.toFixed(2);
}

// ── Init ──────────────────────────────────────────────────────────────────────

function render(s) {
  try { drawTimeSeries(s); } catch (err) { console.error("LV time-series render failed", err); }
  try { drawPhasePlane(s); } catch (err) { console.error("LV phase render failed",       err); }
  updateEstimates(s);
}

export function initAnalytics() {
  subscribe(render);
  requestAnimationFrame(() => render(state));
}

import { subscribe, state } from "./state.js";

function drawTimeSeries(s) {
  const host = d3.select("#chart-lv-main-timeseries");
  host.selectAll("*").remove();

  const W = host.node()?.clientWidth || 0;
  const H = host.node()?.clientHeight || 0;
  if (W <= 1 || H <= 1) return;

  const m = { t: 14, r: 12, b: 28, l: 42 };
  const w = W - m.l - m.r;
  const h = H - m.t - m.b;

  const svg = host.append("svg").attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

  const xMin = d3.min(s.series, (d) => d.t) || 0;
  const xMax = Math.max(xMin + 1e-6, d3.max(s.series, (d) => d.t) || 1);
  const yMax = Math.max(
    1,
    d3.max(s.series, (d) => Math.max(d.prey, d.predator)) || 1
  );

  const x = d3.scaleLinear().domain([xMin, xMax]).range([0, w]);
  const y = d3.scaleLinear().domain([0, yMax * 1.05]).range([h, 0]);

  const linePrey = d3
    .line()
    .x((d) => x(d.t))
    .y((d) => y(d.prey));

  const linePred = d3
    .line()
    .x((d) => x(d.t))
    .y((d) => y(d.predator));

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

  g.append("text")
    .attr("class", "chart-label")
    .attr("x", w / 2)
    .attr("y", h + 24)
    .attr("text-anchor", "middle")
    .text("Time");

  g.append("text")
    .attr("class", "chart-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -h / 2)
    .attr("y", -30)
    .attr("text-anchor", "middle")
    .text("Population size");

  g.append("path")
    .datum(s.series)
    .attr("fill", "none")
    .attr("stroke", "#4f81d8")
    .attr("stroke-width", 2)
    .attr("d", linePrey);

  g.append("path")
    .datum(s.series)
    .attr("fill", "none")
    .attr("stroke", "#df614b")
    .attr("stroke-width", 2)
    .attr("d", linePred);

  g.append("text")
    .attr("class", "chart-label")
    .attr("x", w)
    .attr("y", y(s.series[s.series.length - 1].prey) - 6)
    .attr("text-anchor", "end")
    .text(s.modelType === "competition" ? "Species 1" : "Prey");

  g.append("text")
    .attr("class", "chart-label")
    .attr("x", w)
    .attr("y", y(s.series[s.series.length - 1].predator) + 12)
    .attr("text-anchor", "end")
    .text(s.modelType === "competition" ? "Species 2" : "Predators");
}

function drawPhasePlane(s) {
  const host = d3.select("#chart-lv-phase");
  host.selectAll("*").remove();

  const W = host.node()?.clientWidth || 0;
  const H = host.node()?.clientHeight || 0;
  if (W <= 1 || H <= 1) return;

  const m = { t: 14, r: 14, b: 30, l: 38 };
  const w = W - m.l - m.r;
  const h = H - m.t - m.b;

  const svg = host.append("svg").attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

  const xMax = Math.max(1, d3.max(s.series, (d) => d.prey) || 1);
  const yMax = Math.max(1, d3.max(s.series, (d) => d.predator) || 1);

  const x = d3.scaleLinear().domain([0, xMax * 1.05]).range([0, w]);
  const y = d3.scaleLinear().domain([0, yMax * 1.05]).range([h, 0]);

  const line = d3
    .line()
    .x((d) => x(d.prey))
    .y((d) => y(d.predator));

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

  g.append("path")
    .datum(s.series)
    .attr("fill", "none")
    .attr("stroke", "#5d5d5d")
    .attr("stroke-width", 1.8)
    .attr("d", line);

  const last = s.series[s.series.length - 1];
  g.append("circle")
    .attr("cx", x(last.prey))
    .attr("cy", y(last.predator))
    .attr("r", 4)
    .attr("fill", "#222");

  g.append("text")
    .attr("class", "chart-label")
    .attr("x", w / 2)
    .attr("y", h + 26)
    .attr("text-anchor", "middle")
    .text(s.modelType === "competition" ? "Species 1" : "Prey");

  g.append("text")
    .attr("class", "chart-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -h / 2)
    .attr("y", -28)
    .attr("text-anchor", "middle")
    .text(s.modelType === "competition" ? "Species 2" : "Predators");
}

function updateEstimates(s) {
  let preyEq = 0;
  let predEq = 0;

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
    predEq = s.alpha > 0 && s.beta > 0 ? s.alpha / s.beta : 0;
  }

  document.getElementById("est-lv-time").textContent = s.t.toFixed(2);
  document.getElementById("est-lv-prey").textContent = s.prey.toFixed(2);
  document.getElementById("est-lv-pred").textContent = s.predator.toFixed(2);
  document.getElementById("est-lv-prey-eq").textContent = preyEq.toFixed(2);
  document.getElementById("est-lv-pred-eq").textContent = predEq.toFixed(2);
}

function render(s) {
  try {
    drawTimeSeries(s);
  } catch (err) {
    console.error("LV time-series render failed", err);
  }

  try {
    drawPhasePlane(s);
  } catch (err) {
    console.error("LV phase render failed", err);
  }

  updateEstimates(s);
}

export function initAnalytics() {
  subscribe(render);
  requestAnimationFrame(() => render(state));
}

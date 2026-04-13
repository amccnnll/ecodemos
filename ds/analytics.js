/**
 * ds/analytics.js — Distance Sampling analytics pane
 *
 * Sets up three D3 panels and subscribes to state updates:
 *   1. Detection function — histogram of observed distances + theoretical g(x) curve
 *   2. Running estimates  — n, effort, ESW, D̂
 *   3. D̂ convergence     — D̂ vs cumulative detections, true D reference line
 *
 * d3 is available as a global (loaded via CDN in index.html).
 */

import { subscribe, state } from './state.js';
import { halfNormal, computeESW, estimateDensity } from '../src/stats.js';

const M = { top: 18, right: 18, bottom: 42, left: 50 }; // shared chart margins

// ─── Initialise all panels ───────────────────────────────────────────────────

export function initAnalytics() {
  const updateDetFn   = initDetectionFnChart('chart-detection-fn');
  const updateDhat    = initDhatChart('chart-dhat');

  subscribe((s) => {
    const n   = s.detectedDistances.length;
    const esw = computeESW(s.sigma, s.W);
    const dhat = n > 0 ? estimateDensity(n, s.transectLength, s.sigma, s.W) : null;

    // Append D̂ to history on each new detection
    if (n > 0 && s.dhatHistory.length < n) {
      s.dhatHistory.push(dhat);
    }

    updateDetFn(s.detectedDistances, s.sigma, s.W);
    updateEstimates(n, s.transectLength, esw, dhat);
    updateDhat(s.dhatHistory, s.trueD);
  });
}

// ─── 1. Detection function chart ─────────────────────────────────────────────

function initDetectionFnChart(containerId) {
  const el     = document.getElementById(containerId);
  const W      = el.clientWidth;
  const H      = el.clientHeight;
  const iW     = W - M.left - M.right;
  const iH     = H - M.top  - M.bottom;

  const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  const xScale = d3.scaleLinear().domain([0, state.W]).range([0, iW]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([iH, 0]);

  // Axes
  const xAxis = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${iH})`);
  const yAxis = g.append('g').attr('class', 'axis');
  xAxis.call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${d.toFixed(2)}`));
  yAxis.call(d3.axisLeft(yScale).ticks(4));

  // Axis labels
  g.append('text').attr('class', 'chart-label')
    .attr('x', iW / 2).attr('y', iH + 36)
    .attr('text-anchor', 'middle').text('Perpendicular distance (km)');
  g.append('text').attr('class', 'chart-label')
    .attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -40)
    .attr('text-anchor', 'middle').text('Detection probability');

  // Histogram bars group (drawn first so curve sits on top)
  const barsG = g.append('g').attr('class', 'hist-bars');

  // Theoretical curve
  const lineGen = d3.line().x(d => xScale(d.x)).y(d => yScale(d.y)).curve(d3.curveBasis);
  const curvePath = g.append('path')
    .attr('class', 'det-curve')
    .attr('fill', 'none').attr('stroke', '#2255cc').attr('stroke-width', 2);

  // W truncation marker
  g.append('line').attr('class', 'w-line')
    .attr('x1', xScale(state.W)).attr('x2', xScale(state.W))
    .attr('y1', 0).attr('y2', iH)
    .attr('stroke', '#ccc').attr('stroke-width', 1).attr('stroke-dasharray', '4 3');

  function update(distances, sigma, W) {
    xScale.domain([0, W]);
    xAxis.call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${d.toFixed(2)}`));

    // Theoretical curve
    const pts = d3.range(0, W * 1.001, W / 120).map(x => ({ x, y: halfNormal(x, sigma) }));
    curvePath.datum(pts).attr('d', lineGen);

    // Histogram (only once we have enough data)
    if (distances.length < 3) { barsG.selectAll('rect').remove(); return; }

    const bins = d3.histogram()
      .domain([0, W])
      .thresholds(d3.range(0, W, W / 10))(distances);

    const maxCount = d3.max(bins, b => b.length) || 1;

    barsG.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x',      b => xScale(b.x0) + 1)
      .attr('width',  b => Math.max(0, xScale(b.x1) - xScale(b.x0) - 2))
      .attr('y',      b => yScale(b.length / maxCount))
      .attr('height', b => iH - yScale(b.length / maxCount))
      .attr('fill', '#7aaee8').attr('opacity', 0.55);
  }

  // Draw theoretical curve immediately with defaults
  update([], state.sigma, state.W);
  return update;
}

// ─── 2. Running estimates strip ───────────────────────────────────────────────

function updateEstimates(n, L, esw, dhat) {
  const fmt2 = d3.format('.2f');
  const fmt1 = d3.format('.1f');

  setText('est-n',      n);
  setText('est-effort', fmt2(L) + ' km');
  setText('est-esw',    n > 0 ? fmt2(esw) + ' km' : '—');
  setText('est-dhat',   dhat != null ? fmt1(dhat) : '—');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── 3. D̂ convergence chart ──────────────────────────────────────────────────

function initDhatChart(containerId) {
  const el = document.getElementById(containerId);
  const W  = el.clientWidth;
  const H  = el.clientHeight;
  const iW = W - M.left - M.right;
  const iH = H - M.top  - M.bottom;

  const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  const xScale = d3.scaleLinear().range([0, iW]);
  const yScale = d3.scaleLinear().range([iH, 0]);

  const xAxis = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${iH})`);
  const yAxis = g.append('g').attr('class', 'axis');

  g.append('text').attr('class', 'chart-label')
    .attr('x', iW / 2).attr('y', iH + 36)
    .attr('text-anchor', 'middle').text('Cumulative detections');
  g.append('text').attr('class', 'chart-label')
    .attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -40)
    .attr('text-anchor', 'middle').text('D̂ (animals / km²)');

  // True D reference line
  const trueDLine = g.append('line')
    .attr('class', 'true-d-line')
    .attr('x1', 0).attr('x2', iW)
    .attr('stroke', '#cc3333').attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '5 3').attr('opacity', 0);

  // D̂ history line
  const lineGen  = d3.line().x((_, i) => xScale(i + 1)).y(d => yScale(d)).curve(d3.curveMonotoneX);
  const dhatPath = g.append('path')
    .attr('class', 'dhat-line')
    .attr('fill', 'none').attr('stroke', '#2255cc').attr('stroke-width', 2);

  function update(history, trueD) {
    if (history.length === 0) return;

    const yMin = trueD ? Math.min(d3.min(history), trueD) * 0.6 : d3.min(history) * 0.6;
    const yMax = trueD ? Math.max(d3.max(history), trueD) * 1.4 : d3.max(history) * 1.4;

    xScale.domain([1, Math.max(history.length, 10)]);
    yScale.domain([Math.max(0, yMin), yMax]);

    xAxis.call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d')));
    yAxis.call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('.0f')));

    dhatPath.datum(history).attr('d', lineGen);

    if (trueD != null) {
      trueDLine
        .attr('y1', yScale(trueD)).attr('y2', yScale(trueD))
        .attr('opacity', 0.7);
    }
  }

  return update;
}

/**
 * ds/analytics.js — Distance Sampling analytics pane
 *
 * Sets up three D3 panels and subscribes to state updates:
 *   1. Detection function — histogram of observed distances + theoretical g(x) curve
 *   2. Running estimates  — n, effort, ESW, σ̂, D̂
 *   3. D̂ convergence     — D̂ vs cumulative detections, true D reference line
 *
 * d3 is available as a global (loaded via CDN in index.html).
 */

import { subscribe, state } from './state.js';
import { halfNormal, hazardRate, computeESW, computeESW_HR, estimateDensity, fitSigmaMLE } from '../src/stats.js';

const M = { top: 18, right: 18, bottom: 42, left: 50 }; // shared chart margins

// ─── Initialise all panels ───────────────────────────────────────────────────

export function initAnalytics() {
  const updateDetFn = initDetectionFnChart('chart-detection-fn');
  const updateDhat  = initDhatChart('chart-dhat');

  // Ghost run data — purely display state, never stored in shared state
  let ghosts        = [];    // [{ dhatHistory, sigmaHat, trueD }, ...]
  let prevHistory   = [];    // dhatHistory at the previous subscriber call
  let prevGhostData = null;  // metadata to attach when saving a ghost
  let lastRender    = null;  // cached args so the clear button can force a redraw

  document.getElementById('btn-clear-ghosts')?.addEventListener('click', () => {
    ghosts = [];
    if (lastRender) {
      const { filteredDists, sigma, W, sigmaHat, dhatHistory, trueD, truthFn, modelFn, b } = lastRender;
      updateDetFn(filteredDists, sigma, W, sigmaHat, [], truthFn, modelFn, b);
      updateDhat(dhatHistory, trueD, []);
    }
  });

  subscribe((s) => {
    const filteredDists = s.detectedDistances.filter(d => d <= s.W);
    const n = filteredDists.length;

    // Detect reset: previous call had data, this call is empty → maybe save ghost
    if (n === 0 && prevHistory.length > 0 && prevGhostData) {
      if (document.getElementById('checkbox-keep-runs')?.checked) {
        ghosts.push({ ...prevGhostData, dhatHistory: [...prevHistory] });
        if (ghosts.length > 8) ghosts.shift(); // cap at 8 past runs
      }
    }

    // MLE fit for σ — uses the selected model function
    const sigmaHat = n >= 3 ? fitSigmaMLE(filteredDists, s.W, s.modelFn, s.b) : null;
    const sigmaEff = sigmaHat ?? s.sigma;

    // Rebuild D̂ history using MLE σ̂, per-detection effort, and model function
    s.dhatHistory = [];
    let filteredN = 0;
    for (let i = 0; i < s.detectedDistances.length; i++) {
      if (s.detectedDistances[i] <= s.W) {
        filteredN++;
        s.dhatHistory.push(
          estimateDensity(filteredN, s.detectedEfforts[i], sigmaEff, s.W, s.modelFn, s.b)
        );
      }
    }

    const esw = s.modelFn === 'hazardRate'
      ? computeESW_HR(sigmaEff, s.b, s.W)
      : computeESW(sigmaEff, s.W);
    const dhat = n > 0 ? s.dhatHistory[s.dhatHistory.length - 1] : null;

    // Cache current state for ghost detection and clear-button redraw
    prevHistory   = [...s.dhatHistory];
    prevGhostData = { sigmaHat, trueD: s.trueD, modelFn: s.modelFn, b: s.b };
    lastRender    = { filteredDists: [...filteredDists], sigma: s.sigma, W: s.W,
                      sigmaHat, dhatHistory: [...s.dhatHistory], trueD: s.trueD,
                      truthFn: s.truthFn, modelFn: s.modelFn, b: s.b };

    updateDetFn(filteredDists, s.sigma, s.W, sigmaHat, ghosts, s.truthFn, s.modelFn, s.b);
    updateEstimates(n, s.transectLength, esw, dhat, s.trueD, sigmaHat, s.sigma);
    updateDhat(s.dhatHistory, s.trueD, ghosts);
  });
}

// ─── 1. Detection function chart ─────────────────────────────────────────────

function initDetectionFnChart(containerId) {
  const el = document.getElementById(containerId);
  const W  = el.clientWidth;
  const H  = el.clientHeight;
  const iW = W - M.left - M.right;
  const iH = H - M.top  - M.bottom;

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
    .attr('text-anchor', 'middle').text('g(x)  (estimated)');

  // Histogram bars (drawn first so curves sit on top)
  const barsG = g.append('g').attr('class', 'hist-bars');

  // Ghost fitted curves (behind current curves)
  const ghostCurvesG = g.append('g').attr('class', 'ghost-curves');

  const lineGen = d3.line().x(d => xScale(d.x)).y(d => yScale(d.y)).curve(d3.curveBasis);

  // Theoretical curve — solid blue
  const curvePath = g.append('path')
    .attr('fill', 'none').attr('stroke', '#2255cc').attr('stroke-width', 2);

  // MLE fitted curve — dashed pink
  const fittedCurvePath = g.append('path')
    .attr('fill', 'none').attr('stroke', '#cc44aa').attr('stroke-width', 2)
    .attr('stroke-dasharray', '7 4').attr('opacity', 0);

  // W truncation marker
  g.append('line')
    .attr('x1', iW).attr('x2', iW).attr('y1', 0).attr('y2', iH)
    .attr('stroke', '#ccc').attr('stroke-width', 1).attr('stroke-dasharray', '4 3');

  function update(distances, sigma, W, sigmaHat, ghosts = [], truthFn = 'halfNormal', modelFn = 'halfNormal', b = 2.5) {
    xScale.domain([0, W]);
    xAxis.call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${d.toFixed(2)}`));

    const evalFn = (fn, x, s) => fn === 'hazardRate' ? hazardRate(x, s, b) : halfNormal(x, s);
    const pts    = d3.range(0, W * 1.001, W / 120);

    // Ghost fitted curves — draw using the model fn active at time of that run
    const ghostsWithFit = ghosts.filter(g => g.sigmaHat != null);
    const nGF = ghostsWithFit.length;
    ghostCurvesG.selectAll('path')
      .data(ghostsWithFit)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#cc44aa')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '7 4')
      .attr('opacity', (d, i) => nGF === 1 ? 0.35 : 0.12 + (i / (nGF - 1)) * 0.28)
      .attr('d', d => lineGen(
        pts.map(x => ({ x, y: d.modelFn === 'hazardRate' ? hazardRate(x, d.sigmaHat, d.b ?? 2.5) : halfNormal(x, d.sigmaHat) }))
      ));

    // Theoretical curve — drawn with field truth function
    curvePath.datum(pts.map(x => ({ x, y: evalFn(truthFn, x, sigma) }))).attr('d', lineGen);

    // MLE fitted curve — drawn with model function
    if (sigmaHat != null) {
      fittedCurvePath
        .datum(pts.map(x => ({ x, y: evalFn(modelFn, x, sigmaHat) })))
        .attr('d', lineGen).attr('opacity', 1);
    } else {
      fittedCurvePath.attr('opacity', 0);
    }

    if (distances.length < 3) { barsG.selectAll('rect').remove(); return; }

    const n        = distances.length;
    const binWidth = W / 10;
    // Normalise bars against truth-function ESW so they sit on the g(x) scale
    const eswNorm  = truthFn === 'hazardRate' ? computeESW_HR(sigma, b, W) : computeESW(sigma, W);
    const scale    = n * binWidth / eswNorm;

    const bins = d3.histogram()
      .domain([0, W])
      .thresholds(d3.range(W / 10, W, W / 10))(distances);

    const barHeights = bins.map(b => b.length / scale);
    const yMax = Math.max(1.1, d3.max(barHeights) * 1.05);
    yScale.domain([0, yMax]);
    yAxis.call(d3.axisLeft(yScale).ticks(4));

    barsG.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x',      b => xScale(b.x0) + 1)
      .attr('width',  b => Math.max(0, xScale(b.x1) - xScale(b.x0) - 2))
      .attr('y',      (b, i) => yScale(barHeights[i]))
      .attr('height', (b, i) => iH - yScale(barHeights[i]))
      .attr('fill', '#7aaee8').attr('opacity', 0.55);
  }

  update([], state.sigma, state.W, null, [], state.truthFn, state.modelFn, state.b);
  return update;
}

// ─── 2. Running estimates strip ───────────────────────────────────────────────

function updateEstimates(n, L, esw, dhat, trueD, sigmaHat, trueSigma) {
  const fmt2 = d3.format('.2f');
  const fmt1 = d3.format('.1f');
  const fmt3 = d3.format('.3f');

  setText('est-n',          n);
  setText('est-effort',     fmt2(L) + ' km');
  setText('est-esw',        n > 0 ? fmt2(esw) + ' km' : '—');
  setText('est-sigma-hat',  sigmaHat  != null ? fmt3(sigmaHat)  + ' km' : '—');
  setText('est-true-sigma', trueSigma != null ? fmt3(trueSigma) + ' km' : '—');
  setText('est-dhat',       dhat  != null ? fmt1(dhat)  : '—');
  setText('est-trued',      trueD != null ? fmt1(trueD) : '—');
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

  const xScale = d3.scaleLinear().domain([1, 10]).range([0, iW]);
  const yScale = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

  const xAxis = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${iH})`);
  const yAxis = g.append('g').attr('class', 'axis');
  xAxis.call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d')));
  yAxis.call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('.0f')));

  g.append('text').attr('class', 'chart-label')
    .attr('x', iW / 2).attr('y', iH + 36)
    .attr('text-anchor', 'middle').text('Cumulative detections');
  g.append('text').attr('class', 'chart-label')
    .attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -40)
    .attr('text-anchor', 'middle').text('D̂ (animals / km²)');

  // Ghost lines (drawn behind everything else)
  const ghostG = g.append('g').attr('class', 'ghost-runs');

  // True D reference line
  const trueDLine = g.append('line')
    .attr('x1', 0).attr('x2', iW)
    .attr('stroke', '#cc3333').attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '5 3').attr('opacity', 0);

  // Current D̂ history line
  const lineGen  = d3.line().x((_, i) => xScale(i + 1)).y(d => yScale(d)).curve(d3.curveMonotoneX);
  const dhatPath = g.append('path')
    .attr('fill', 'none').attr('stroke', '#2a7a2a').attr('stroke-width', 2);

  // Expand-only domain tracking — prevents jitter from micro-rescales
  let committedYHi  = 0;
  let committedXMax = 10;

  function update(history, trueD, ghosts = []) {
    const hasData = history.length > 0 || ghosts.some(g => g.dhatHistory.length > 0);

    if (!hasData) {
      // Hard reset — snap axes back immediately
      committedYHi  = 0;
      committedXMax = 10;
      xScale.domain([1, 10]);
      yScale.domain([0, 100]);
      xAxis.call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d')));
      yAxis.call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('.0f')));
      dhatPath.attr('d', null);
      trueDLine.attr('opacity', 0);
      ghostG.selectAll('path').remove();
      return;
    }

    // Compute desired extents with 25% headroom on y
    const allValues = [...history, ...ghosts.flatMap(g => g.dhatHistory)].filter(isFinite);
    const allTrueDs = [trueD, ...ghosts.map(g => g.trueD)].filter(v => v != null);
    const maxLen    = Math.max(history.length, ...ghosts.map(g => g.dhatHistory.length), 10);
    const rawHi     = Math.max(...allValues, ...allTrueDs);
    const desiredHi = rawHi * 1.1;

    // Only expand domains, never contract mid-run
    const yExpanded = desiredHi > committedYHi;
    const xExpanded = maxLen    > committedXMax;
    if (yExpanded) committedYHi  = desiredHi;
    if (xExpanded) committedXMax = maxLen;

    xScale.domain([1, committedXMax]);
    yScale.domain([0, committedYHi]);

    // Animate axis only when domain actually grows; otherwise skip transition
    if (yExpanded) yAxis.transition().duration(250).call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('.0f')));
    if (xExpanded) xAxis.transition().duration(250).call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d')));

    // Ghost lines — faded, older = more transparent
    const nG = ghosts.length;
    ghostG.selectAll('path')
      .data(ghosts)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#2a7a2a')
      .attr('stroke-width', 1.5)
      .attr('opacity', (d, i) => nG === 1 ? 0.40 : 0.12 + (i / (nG - 1)) * 0.30)
      .attr('d', d => d3.line()
        .x((_, j) => xScale(j + 1))
        .y(v => yScale(v))
        .curve(d3.curveMonotoneX)(d.dhatHistory));

    // Current run
    if (history.length > 0) {
      dhatPath.datum(history).attr('d', lineGen);
    } else {
      dhatPath.attr('d', null);
    }

    // True D reference line
    if (trueD != null) {
      trueDLine.attr('y1', yScale(trueD)).attr('y2', yScale(trueD)).attr('opacity', 0.7);
    }
  }

  return update;
}

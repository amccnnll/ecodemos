/**
 * secr/analytics.js — D3 analytics for the SECR module
 *
 * Three panels:
 *  1. Detection surface heatmap — p(x,y) probability surface, updates on g₀/σ/detector change
 *  2. Capture history matrix   — individuals × occasions, detector index per cell
 *  3. D̂ convergence chart     — running D̂ = M / ESA, true D reference
 *
 * Receives all data via subscribe() from secr/state.js.
 * Never touches the DOM outside its own chart containers.
 */

import { subscribe, state } from './state.js';
import { detectionSurface, computeESA_K } from '../src/secr-engine.js';

// Match sketch.js — per-animal colours for capture history row headers
const ANIMAL_COLOURS = [
  '#4080ff', '#dc5050', '#3cb43c', '#c850c8',
  '#f0a028', '#28c8c8', '#a05028', '#b43c78',
  '#c8c828', '#6464c8',
];
const ANIMAL_LABELS = 'ABCDEFGHIJ';

export function initAnalytics() {
  subscribe(render);
  // Force a deferred render one frame after init.  This catches two failure modes:
  // (a) resetState() fired before subscribe() was called (p5 preload timing race)
  // (b) chart containers had 0 dimensions when the initial notification arrived
  requestAnimationFrame(() => render(state));
}

function render(s) {
  if (!s.arenaW) return; // not yet initialised
  // Run each panel independently — one failure should not block the others
  for (const [name, fn] of [
    ['surface',   updateSurface],
    ['captures',  updateCaptureHistory],
    ['dhat',      updateDhat],
    ['estimates', updateSecrEstimates],
  ]) {
    try { fn(s); } catch (err) { console.error(`[SECR analytics] ${name}:`, err); }
  }
}

// ─── 1. Detection surface heatmap ─────────────────────────────────────────────

let surfaceSvg = null;
let surfaceG   = null;
let surfaceScale;  // colour scale
let surfaceX;      // px scale for world x
let surfaceY;      // px scale for world y

function updateSurface(s) {
  const container = document.getElementById('chart-detection-surface');
  if (!container) return;
  // Skip expensive computation while the overlay is hidden
  const overlayEl = document.getElementById('surface-overlay');
  if (!overlayEl || overlayEl.style.display === 'none') return;

  const W    = container.clientWidth  || 260;
  const H    = container.clientHeight || W;
  // Square: use whichever dimension is smaller so the SVG fits its container
  const side   = Math.min(W, H);
  const margin = { top: 8, right: 8, bottom: 32, left: 30 };
  const innerW = side - margin.left - margin.right;
  const innerH = side - margin.top  - margin.bottom;

  // Build or rebuild SVG
  if (!surfaceSvg || surfaceSvg.attr('data-side') !== String(side)) {
    d3.select(container).selectAll('svg').remove();
    surfaceSvg = d3.select(container).append('svg')
      .attr('width', side).attr('height', side)
      .attr('data-side', side);

    // Gradient definition for colour legend
    const defs = surfaceSvg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'surface-legend-grad')
      .attr('x1', '0%').attr('x2', '100%');
    const nStops = 12;
    for (let i = 0; i <= nStops; i++) {
      grad.append('stop')
        .attr('offset', `${(i / nStops * 100).toFixed(1)}%`)
        .attr('stop-color', d3.interpolateYlOrRd(i / nStops));
    }

    surfaceG = surfaceSvg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    surfaceG.append('g').attr('class', 'cells');
    surfaceG.append('g').attr('class', 'overlay');   // boundaries + detectors
    surfaceG.append('g').attr('class', 'y-axis');
    // Colour legend at bottom
    const legendG = surfaceG.append('g').attr('class', 'legend')
      .attr('transform', `translate(0,${innerH + 10})`);
    legendG.append('rect')
      .attr('width', innerW).attr('height', 9).attr('rx', 2)
      .attr('fill', 'url(#surface-legend-grad)');
    legendG.append('text')
      .attr('x', 0).attr('y', 20)
      .attr('font-size', 9).attr('fill', '#777').attr('text-anchor', 'start')
      .text('p = 0');
    legendG.append('text')
      .attr('x', innerW / 2).attr('y', 20)
      .attr('font-size', 9).attr('fill', '#777').attr('text-anchor', 'middle')
      .text('detection probability');
    legendG.append('text')
      .attr('x', innerW).attr('y', 20)
      .attr('font-size', 9).attr('fill', '#777').attr('text-anchor', 'end')
      .text('1');

    surfaceScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);
  }

  surfaceX = d3.scaleLinear().domain([0, s.arenaW]).range([0, innerW]);
  surfaceY = d3.scaleLinear().domain([0, s.arenaH]).range([0, innerH]);

  const cols     = 50;
  const rows     = 50;
  const cellPxW  = innerW / cols;
  const cellPxH  = innerH / rows;
  const hasDetectors = s.detectors && s.detectors.length > 0;

  // Compute surface (only if detectors exist)
  const cells = hasDetectors
    ? detectionSurface(s.detectors, s.g0, s.sigmaEff, s.arenaW, s.arenaH, cols, rows)
    : Array.from({ length: cols * rows }, (_, i) => ({
        cx: ((i % cols) + 0.5) * (s.arenaW / cols),
        cy: (Math.floor(i / cols) + 0.5) * (s.arenaH / rows),
        p:  0,
      }));

  surfaceG.select('.cells').selectAll('rect').data(cells, (_, i) => i)
    .join('rect')
      .attr('x',      d => surfaceX(d.cx) - cellPxW / 2)
      .attr('y',      d => surfaceY(d.cy) - cellPxH / 2)
      .attr('width',  cellPxW + 0.5)   // slight overlap to avoid subpixel gaps
      .attr('height', cellPxH + 0.5)
      .attr('fill',   d => d.p < 0.001 ? 'transparent' : surfaceScale(d.p));

  // Overlay: inner study area boundary
  const overlay = surfaceG.select('.overlay');
  overlay.selectAll('*').remove();

  if (s.innerX0 != null) {
    const bx = surfaceX(s.innerX0);
    const by = surfaceY(s.innerY0);
    const bw = surfaceX(s.innerX0 + s.innerW) - bx;
    const bh = surfaceY(s.innerY0 + s.innerH) - by;
    overlay.append('rect')
      .attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh)
      .attr('fill', 'none').attr('stroke', '#3060aa').attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '4 3').attr('opacity', 0.7);
  }

  // Detector markers
  if (hasDetectors) {
    overlay.selectAll('circle.det').data(s.detectors)
      .join('circle').attr('class', 'det')
        .attr('cx', d => surfaceX(d.x))
        .attr('cy', d => surfaceY(d.y))
        .attr('r', 3)
        .attr('fill', '#3060aa')
        .attr('opacity', 0.8);
  }

  // Y-axis (km scale)
  surfaceG.select('.y-axis').call(
    d3.axisLeft(surfaceY).ticks(4).tickFormat(d => d + ' km')
  );
}

// ─── 2. Capture history matrix ────────────────────────────────────────────────

let histSvg    = null;
let histG      = null;

function updateCaptureHistory(s) {
  const container = document.getElementById('chart-capture-history');
  if (!container) return;

  const captures = s.captures ?? [];
  const k        = s.k ?? 0;

  // Unique captured animal IDs, in order of first capture
  const seen       = new Set();
  const animalIds  = [];
  for (const c of captures) {
    if (!seen.has(c.animalId)) { seen.add(c.animalId); animalIds.push(c.animalId); }
  }

  // Build lookup: captureMap[animalId][k] = [detectorId, ...]
  const captureMap = {};
  for (const id of animalIds) captureMap[id] = {};
  for (const c of captures) {
    if (!captureMap[c.animalId][c.k]) captureMap[c.animalId][c.k] = [];
    captureMap[c.animalId][c.k].push(c.detectorId);
  }

  const cellW    = 28;
  const cellH    = 26;
  const rowLabelW = 24;
  const colLabelH = 18;
  const occasions = k > 0 ? d3.range(1, k + 1) : [];
  const svgW = rowLabelW + occasions.length * cellW + 2;
  const svgH = colLabelH + animalIds.length  * cellH + 2;

  if (!histSvg) {
    d3.select(container).selectAll('svg').remove();
    histSvg = d3.select(container).append('svg');
    histG   = histSvg.append('g').attr('transform', `translate(0,0)`);
    histG.append('g').attr('class', 'col-labels');
    histG.append('g').attr('class', 'rows');
  }

  histSvg.attr('width', Math.max(svgW, container.clientWidth))
         .attr('height', Math.max(svgH, 40));

  // Column labels (k = 1, 2, …)
  histG.select('.col-labels').selectAll('text').data(occasions)
    .join('text')
      .attr('x', (_, i) => rowLabelW + i * cellW + cellW / 2)
      .attr('y', colLabelH - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#666')
      .text(d => d);

  // One row per captured animal
  const rows = histG.select('.rows').selectAll('g.animal-row').data(animalIds, d => d)
    .join('g').attr('class', 'animal-row')
    .attr('transform', (_, i) => `translate(0, ${colLabelH + i * cellH})`);

  // Row label (coloured box + letter)
  rows.selectAll('rect.label-bg').data(d => [d])
    .join('rect').attr('class', 'label-bg')
      .attr('x', 0).attr('y', 0).attr('width', rowLabelW - 2).attr('height', cellH - 2)
      .attr('rx', 3).attr('fill', d => ANIMAL_COLOURS[d % ANIMAL_COLOURS.length]);
  rows.selectAll('text.label-txt').data(d => [d])
    .join('text').attr('class', 'label-txt')
      .attr('x', (rowLabelW - 2) / 2).attr('y', cellH / 2 + 1)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', 11).attr('font-weight', 'bold').attr('fill', '#fff')
      .text(d => ANIMAL_LABELS[d % ANIMAL_LABELS.length]);

  // Cells
  rows.each(function (animalId) {
    const row = d3.select(this);
    row.selectAll('rect.cell').data(occasions)
      .join('rect').attr('class', 'cell')
        .attr('x', (_, i) => rowLabelW + i * cellW)
        .attr('y', 0)
        .attr('width', cellW - 2).attr('height', cellH - 2)
        .attr('rx', 2)
        .attr('fill', d => {
          const dets = captureMap[animalId][d];
          return dets ? ANIMAL_COLOURS[animalId % ANIMAL_COLOURS.length] + '44' : '#f0f0f0';
        });

    row.selectAll('text.cell-txt').data(occasions)
      .join('text').attr('class', 'cell-txt')
        .attr('x', (_, i) => rowLabelW + i * cellW + cellW / 2)
        .attr('y', cellH / 2 + 1)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', 8).attr('fill', '#333')
        .text(d => {
          const dets = captureMap[animalId][d];
          return dets ? dets.join(',') : '';
        });
  });

  // Empty-state hint
  histG.selectAll('text.hint').data(animalIds.length === 0 ? [1] : [])
    .join('text').attr('class', 'hint')
      .attr('x', (container.clientWidth || 200) / 2)
      .attr('y', 36)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#aaa')
      .text('No captures yet');
}

// ─── 3. D̂ convergence ────────────────────────────────────────────────────────

let dhatSvg         = null;
let dhatG           = null;
let committedYHi    = 0;
let committedXMax   = 10;

function updateDhat(s) {
  const container = document.getElementById('chart-dhat');
  if (!container) return;

  const W      = container.clientWidth  || 260;
  const H      = container.clientHeight || 160;
  // Defer if container not yet laid out
  if (W <= 1 || H <= 1) return;

  const margin = { top: 10, right: 16, bottom: 28, left: 46 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top  - margin.bottom;

  // Rebuild SVG when container size changes (e.g. after layout settles on first load)
  const prevW = dhatSvg ? +dhatSvg.attr('width')  : 0;
  const prevH = dhatSvg ? +dhatSvg.attr('height') : 0;
  if (!dhatSvg || Math.abs(prevW - W) > 4 || Math.abs(prevH - H) > 4) {
    dhatSvg = null;
    dhatG   = null;
    committedYHi  = 0;
    committedXMax = s.K ?? 10;
    d3.select(container).selectAll('svg').remove();
    dhatSvg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    dhatG   = dhatSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    dhatG.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerH})`);
    dhatG.append('g').attr('class', 'y-axis');
    dhatG.append('path').attr('class', 'dhat-line');
    dhatG.append('line').attr('class', 'true-d-line');
    dhatG.append('text').attr('class', 'x-label')
      .attr('x', innerW / 2).attr('y', innerH + margin.bottom - 2)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#555')
      .text('Occasion (k)');
    dhatG.append('text').attr('class', 'y-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -36)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#555')
      .text('D̂ (animals / km²)');
  }

  const captures = s.captures ?? [];
  const k        = s.k ?? 0;
  const trueD    = s.trueD;

  // Compute D̂ history up to current k.
  // ESA must use the K-occasion formula: ∫∫ [1−(1−p₁)^ki] dx dy, where ki grows
  // with each occasion. Precompute the detection surface once, then derive per-ki
  // ESA by reducing over cells — avoids re-running detectionSurface k times.
  const hasDetectors = s.detectors && s.detectors.length > 0;
  const COLS = 60, ROWS = 60;
  const surface  = hasDetectors
    ? detectionSurface(s.detectors, s.g0, s.sigmaEff, s.arenaW, s.arenaH, COLS, ROWS)
    : [];
  const cellArea = s.arenaW * s.arenaH / (COLS * ROWS);

  const history = [];
  if (surface.length > 0 && k > 0) {
    for (let ki = 1; ki <= k; ki++) {
      const capturedByK = new Set(captures.filter(c => c.k <= ki).map(c => c.animalId));
      const M      = capturedByK.size;
      const esa_ki = surface.reduce((sum, c) => sum + (1 - Math.pow(1 - c.p, ki)) * cellArea, 0);
      const dhat   = esa_ki > 0 ? M / esa_ki : 0;
      history.push({ k: ki, dhat });
    }
  }

  const hasData = history.length > 0;

  if (!hasData) {
    // Hard reset on new population
    committedYHi  = 0;
    committedXMax = s.K ?? 10;
  }

  const xMax  = Math.max(committedXMax, k, s.K ?? 10);
  const rawHi = trueD ? Math.max(...history.map(d => d.dhat), trueD) : Math.max(...history.map(d => d.dhat), 1);
  const yHi   = hasData ? Math.max(committedYHi, rawHi * 1.1) : (trueD ? trueD * 2 : 1);

  committedXMax = xMax;
  if (hasData) committedYHi = yHi;

  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([0, yHi]).range([innerH, 0]);

  dhatG.select('.x-axis').call(d3.axisBottom(xScale).ticks(Math.min(xMax, 8)).tickFormat(d3.format('d')));
  dhatG.select('.y-axis').call(d3.axisLeft(yScale).ticks(4));

  // D̂ line (green, matching DS colour scheme)
  const line = d3.line().x(d => xScale(d.k)).y(d => yScale(d.dhat)).curve(d3.curveMonotoneX);
  dhatG.select('.dhat-line')
    .datum(history)
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', '#2a7a2a')
    .attr('stroke-width', 1.8);

  // True D reference line (red dashed)
  if (trueD != null) {
    const ty = yScale(trueD);
    dhatG.select('.true-d-line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', ty).attr('y2', ty)
      .attr('stroke', '#b04040')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '5 3');
  }
}

// ─── 4. Running estimates strip ───────────────────────────────────────────────

function updateSecrEstimates(s) {
  const fmt1 = d3.format('.1f');
  const fmt2 = d3.format('.2f');

  const M    = new Set(s.captures.map(c => c.animalId)).size;
  const caps = s.captures.length;
  const k    = s.k ?? 0;
  const K    = s.K ?? '—';

  const hasDetectors = s.detectors && s.detectors.length > 0;
  // Use K-occasion ESA to match the denominator for M (caught at least once across k occasions)
  const esa  = hasDetectors && s.arenaW && k > 0
    ? computeESA_K(s.detectors, s.g0, s.sigmaEff, s.arenaW, s.arenaH, k)
    : 0;
  const dhat = esa > 0 && M > 0 ? M / esa : null;

  _setText('est-secr-k',     k > 0 ? `${k} / ${K}` : '—');
  _setText('est-secr-m',     M > 0 ? String(M)       : '—');
  _setText('est-secr-caps',  caps > 0 ? String(caps)  : '—');
  _setText('est-secr-esa',   esa > 0 ? fmt2(esa) + ' km²' : '—');
  _setText('est-secr-dhat',  dhat != null ? fmt1(dhat) : '—');
  _setText('est-secr-trued', s.trueD != null ? fmt1(s.trueD) : '—');
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

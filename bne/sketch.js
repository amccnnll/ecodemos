// bne/sketch.js — hex map rendering and controls wiring.

import * as state from './state.js';
import { hexPathString } from '../src/bne-hex.js';

// ── Colour scales ─────────────────────────────────────────────────────────
const colEnv    = d3.scaleSequential(d3.interpolateViridis).domain([0, 1]);
const colEffort = d3.scaleSequential(d3.interpolateYlOrBr).domain([0, 1]);
const colSight  = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
const colBstar  = d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);
const GUILD_COLS = d3.schemeTableau10;
const LAND_FILL  = '#c8c0b0';
const SEA_FILL   = '#dbeeff';

function blendWithWhite(hexCol, t) {
  const c = d3.color(hexCol);
  if (!c) return hexCol;
  c.r = Math.round(c.r + (255 - c.r) * t);
  c.g = Math.round(c.g + (255 - c.g) * t);
  c.b = Math.round(c.b + (255 - c.b) * t);
  return c.formatHex();
}

function normArr(arr) {
  let mn = Infinity, mx = -Infinity;
  for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const rng = mx - mn || 1;
  return Array.from(arr, v => (v - mn) / rng);
}

// ── Hex map ───────────────────────────────────────────────────────────────
const hexContainer = document.getElementById('bne-hexmap-svg');
let hexG = null;
let lastHexGrid = null;

function buildHexMap() {
  const hg = state.hexGrid;
  if (!hg) return;
  lastHexGrid = hg;

  hexContainer.innerHTML = '';
  const rect = hexContainer.getBoundingClientRect();
  const cW = rect.width  || 500;
  const cH = rect.height || 460;
  const { hexes, xMin, xMax, yMin, yMax, hexSize } = hg;

  const pad    = hexSize * 0.9;
  const scaleX = (cW - 2 * pad) / (xMax - xMin || 1);
  const scaleY = (cH - 2 * pad) / (yMax - yMin || 1);
  const sc     = Math.min(scaleX, scaleY);
  const offX   = pad + (cW - 2 * pad - (xMax - xMin) * sc) / 2;
  const offY   = pad;

  const tx = x => offX + (x - xMin) * sc;
  const ty = y => offY + (y - yMin) * sc;

  const svg = d3.select(hexContainer).append('svg')
    .attr('width', cW).attr('height', cH);
  hexG = svg.append('g');

  hexG.selectAll('path.hex')
    .data(hexes)
    .join('path')
    .attr('class', 'hex')
    .attr('d', d => hexPathString(tx(d.x), ty(d.y), hexSize * sc * 0.98))
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.5)
    .style('cursor', d => d.isLand ? 'default' : 'pointer')
    .on('click', (_, d) => {
      if (!d.isLand) state.selectDolphin(-1);
    });

  updateHexColours();
}

function updateHexColours() {
  if (!hexG || !state.hexGrid) return;
  const { hexes } = state.hexGrid;
  const seaHexes = hexes.filter(h => !h.isLand);
  const H = seaHexes.length;
  const layer   = state.hexLayer;
  const sim     = state.simData;
  const anal    = state.analysis;

  let seaColour;

  if (layer === 'environment') {
    seaColour = h => colEnv(h.Q_h);

  } else if (layer === 'effort' && sim) {
    const norm = normArr(sim.effortH);
    const lut = new Map(seaHexes.map((h, i) => [h.hex_id, norm[i]]));
    seaColour = h => colEffort(lut.get(h.hex_id) ?? 0);

  } else if (layer === 'sightings' && sim && anal) {
    const totals = new Float64Array(H);
    for (const d of sim.retainedDolphins)
      for (let hi = 0; hi < H; hi++) totals[hi] += sim.sightingsIH[d.dolphin_id * H + hi];
    const norm = normArr(totals);
    const lut = new Map(seaHexes.map((h, i) => [h.hex_id, norm[i]]));
    seaColour = h => colSight(lut.get(h.hex_id) ?? 0);

  } else if (layer === 'bstar' && anal) {
    const totals = new Float64Array(H);
    const { Bstar, N } = anal;
    for (let i = 0; i < N; i++) for (let hi = 0; hi < H; hi++) totals[hi] += Bstar[i * H + hi];
    const norm = normArr(totals);
    const lut = new Map(seaHexes.map((h, i) => [h.hex_id, norm[i]]));
    seaColour = h => colBstar(lut.get(h.hex_id) ?? 0);

  } else if (layer === 'guild' && anal) {
    const { Bstar, communities, N } = anal;
    // Accumulate total B* weight and per-community weight for each sea hex
    const hexTotals = new Float64Array(H);
    const commW     = new Array(H).fill(null).map(() => new Map());
    for (let i = 0; i < N; i++) {
      const c = communities[i]; if (c < 0) continue;
      for (let hi = 0; hi < H; hi++) {
        const w = Bstar[i * H + hi]; if (w <= 0) continue;
        commW[hi].set(c, (commW[hi].get(c) || 0) + w);
        hexTotals[hi] += w;
      }
    }
    // Dominant community + its share of total B* weight for each hex
    const domResult = commW.map((m, hi) => {
      let best = -1, bestW = 0;
      for (const [c, w] of m) { if (w > bestW) { bestW = w; best = c; } }
      const share = hexTotals[hi] > 0 ? bestW / hexTotals[hi] : 0;
      return { comm: best, share };
    });
    const lut = new Map(seaHexes.map((h, i) => [h.hex_id, domResult[i]]));
    // Full colour = majority (>50%); pale = plurality only
    seaColour = h => {
      const res = lut.get(h.hex_id);
      if (!res || res.comm < 0) return SEA_FILL;
      const base = GUILD_COLS[res.comm % 10];
      return res.share > 0.5 ? base : blendWithWhite(base, 0.55);
    };

  } else if (layer === 'individual' && anal && state.selectedDolphin >= 0) {
    const { Bstar, dolphins, N } = anal;
    const idx = dolphins.findIndex(d => d.dolphin_id === state.selectedDolphin);
    if (idx >= 0) {
      const norm = normArr(Array.from({ length: H }, (_, hi) => Bstar[idx * H + hi]));
      const lut = new Map(seaHexes.map((h, i) => [h.hex_id, norm[i]]));
      seaColour = h => colBstar(lut.get(h.hex_id) ?? 0);
    } else {
      seaColour = () => SEA_FILL;
    }
  } else {
    seaColour = () => SEA_FILL;
  }

  hexG.selectAll('path.hex').attr('fill', d => d.isLand ? LAND_FILL : seaColour(d));
}

// ── Controls wiring ───────────────────────────────────────────────────────
function wireSlider(id, key, fmt, onEnd) {
  const el  = document.getElementById(id);
  const val = document.getElementById('val-' + id.replace('sl-', ''));
  if (!el) return;
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    state.setParam(key, v);
    if (val) val.textContent = fmt(v);
  });
  el.addEventListener('change', onEnd);
}

const reg = state.regenerate, rean = state.reanalyse;

wireSlider('sl-N',            'N',                  v => String(v | 0),    reg);
wireSlider('sl-G',            'G',                  v => String(v | 0),    reg);
wireSlider('sl-overlap',      'guildOverlap',        v => v.toFixed(2),     reg);
wireSlider('sl-specialist',   'specialistFraction',  v => v.toFixed(2),     reg);
wireSlider('sl-T',            'T',                  v => String(v | 0),    reg);
wireSlider('sl-effortBias',   'effortBias',          v => v.toFixed(2),     reg);
wireSlider('sl-detectionProb','detectionProb',       v => v.toFixed(2),     reg);
wireSlider('sl-hexSize',      'hexSize',             v => String(v | 0),    reg);
wireSlider('sl-seed',         'seed',                v => String(v | 0),    reg);
wireSlider('sl-k',            'k',                  v => String(v | 0),    rean);
wireSlider('sl-eMin',         'eMin',                v => v.toFixed(1),     rean);
wireSlider('sl-resolution',   'louvainResolution',   v => v.toFixed(1),     rean);

document.getElementById('btn-bne-generate').addEventListener('click', reg);

document.getElementById('bne-layer-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.bne-tab'); if (!btn) return;
  document.querySelectorAll('#bne-layer-tabs .bne-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.setHexLayer(btn.dataset.layer);
});

document.getElementById('bne-view-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.bne-tab'); if (!btn) return;
  document.querySelectorAll('#bne-view-tabs .bne-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.setNetworkView(btn.dataset.view);
});

// ── Subscribe ─────────────────────────────────────────────────────────────
state.subscribe(() => {
  if (state.hexGrid !== lastHexGrid) {
    buildHexMap();
  } else {
    updateHexColours();
  }
});

// Rebuild SVG if the container is resized (e.g. window resize)
new ResizeObserver(() => { if (state.hexGrid) buildHexMap(); }).observe(hexContainer);

// Initial run — defer so analytics.js has time to register its subscriber
requestAnimationFrame(() => {
  state.regenerate();
  buildHexMap();
});

// bne/sketch.js — hex map rendering and controls wiring.

import * as state from './state.js';
import { hexPathString, hexVertices } from '../src/bne-hex.js';

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

// ── Legend helpers ────────────────────────────────────────────────────────
const GRAD_CSS = {
  viridis: 'linear-gradient(to right,#440154,#3b528b,#21918c,#5ec962,#fde725)',
  ylorbr:  'linear-gradient(to right,#ffffd4,#fed98e,#fe9929,#d95f0e,#993404)',
  blues:   'linear-gradient(to right,#deebf7,#9ecae1,#3182bd,#084594)',
  greens:  'linear-gradient(to right,#e5f5e0,#a1d99b,#41ab5d,#006d2c)',
};

function gradBar(key) {
  return `<span class="leg-bar" style="background:${GRAD_CSS[key]}"></span>`;
}
function swatchEl(col) {
  return `<span class="leg-swatch" style="background:${col}"></span>`;
}

// ── Hex legend ────────────────────────────────────────────────────────────
const hexLegendEl = document.getElementById('bne-hex-legend');

function updateHexLegend() {
  if (!hexLegendEl) return;
  const layer = state.hexLayer;
  const anal  = state.analysis;
  const sim   = state.simData;
  let html = '';

  if (layer === 'environment') {
    html = `${gradBar('viridis')} <b>Habitat quality Q<sub>h</sub></b>&thinsp; low → high
            <span class="leg-note">Q<sub>h</sub> = 0.4·D<sub>h</sub> + 0.4·P<sub>h</sub> − 0.25·R<sub>h</sub> + 0.2 &nbsp;·&nbsp;
              D<sub>h</sub> = depth proxy (increases offshore, Perlin-perturbed) &nbsp;·&nbsp;
              P<sub>h</sub> = productivity (pure Perlin field) &nbsp;·&nbsp;
              R<sub>h</sub> = disturbance (independent Perlin field) &nbsp;·&nbsp; grey = land</span>`;

  } else if (layer === 'effort') {
    html = `${gradBar('ylorbr')} <b>Survey effort E<sub>h</sub></b>&thinsp; low → high
            <span class="leg-note">Cumulative Γ-distributed effort summed over T survey years &nbsp;·&nbsp;
              60 random sample points per year drawn from a radial (half-normal) field centred on the port &nbsp;·&nbsp;
              Effort bias slider controls the radial decay scale: 1 = tightly nearshore, 0 = spread across the domain &nbsp;·&nbsp;
              Used as denominator in B* = Y<sub>ih</sub> / max(E<sub>h</sub>, E<sub>min</sub>).</span>`;

  } else if (layer === 'sightings') {
    html = `${gradBar('blues')} <b>Total sightings Σ Y<sub>ih</sub></b>&thinsp; few → many
            <span class="leg-note">Raw observed sightings summed over all dolphins (residents and transients).
              Transients contribute here but are filtered from the analysis pipeline by the ≥ 4 sightings gate.
              Reflects habitat use and uneven effort together — <i>not</i> effort-corrected.</span>`;

  } else if (layer === 'bstar') {
    html = `${gradBar('greens')} <b>Summed B*</b>&thinsp; low → high
            <span class="leg-note">B*<sub>ih</sub> = Y<sub>ih</sub> / max(E<sub>h</sub>, E<sub>min</sub>), summed over all retained dolphins.
              Effort-corrected habitat-use index. E<sub>min</sub> floor prevents inflation in rarely-surveyed hexes.</span>`;

  } else if (layer === 'guild') {
    if (sim) {
      const swatches = Array.from({ length: sim.G }, (_, c) =>
        `${swatchEl(GUILD_COLS[c % 10])} <b>G${c + 1}</b>`).join(' &thinsp; ');
      html = `${swatches}
              <span class="leg-note"><b>Latent cluster dominance</b> — colour = the true generative cluster whose retained members contribute most cumulative B* to that hex &nbsp;·&nbsp;
                <b>Full colour</b> = majority (&gt;50% of B* weight); <b>pale tint</b> = plurality only &nbsp;·&nbsp;
                <b>neutral grey</b> = insufficient B* data to assign any cluster &nbsp;·&nbsp;
                Compare with the Guild layer and the Truth network view: high ARI means these two should broadly agree.</span>`;
    } else {
      html = '<span class="leg-note">Generate a population to see the latent cluster map.</span>';
    }

  } else if (layer === 'individual') {
    const label = state.selectedDolphin >= 0 ? `dolphin ${state.selectedDolphin}` : '— no dolphin selected';
    html = `${gradBar('greens')} <b>B* — ${label}</b>&thinsp; low → high
            <span class="leg-note">Effort-corrected sightings B*<sub>ih</sub> for the selected individual, revealing their personal habitat-use profile.
              Click a dolphin node in the network panel to select &nbsp;·&nbsp; click any sea hex to deselect.</span>`;
  }

  hexLegendEl.innerHTML = html;
}

// ── Hex map ───────────────────────────────────────────────────────────────
const hexContainer = document.getElementById('bne-hexmap-svg');
let hexG = null;
let portG = null;   // overlay group for the port hex outline
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
  portG = svg.append('g').attr('pointer-events', 'none');

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

  // ── Coastline overlay ───────────────────────────────────────────────────
  // Draw the edges where sea hexes border land hexes (or the grid boundary).
  // Uses full hex scale (not 0.98) so edges align to true hex boundaries.
  // Offset-r parity-aware neighbour tables (odd rows shift right by 0.5):
  //   directions order: E SE SW W NW NE — must match EDGE_VERTS slots below.
  const NBR_EVEN  = [[+1,0],[0,+1],[-1,+1],[-1,0],[-1,-1],[0,-1]];
  const NBR_ODD   = [[+1,0],[+1,+1],[0,+1],[-1,0],[0,-1],[+1,-1]];
  const EDGE_VERTS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]];    // vertex pairs per direction
  const hexByQR   = new Map(hexes.map(h => [`${h.q},${h.r}`, h]));
  const coastSegs = [];

  for (const h of hexes) {
    if (h.isLand) continue;
    const dirs = (h.r & 1) ? NBR_ODD : NBR_EVEN;
    const pts = hexVertices(tx(h.x), ty(h.y), hexSize * sc);
    for (let d = 0; d < 6; d++) {
      const nbr = hexByQR.get(`${h.q + dirs[d][0]},${h.r + dirs[d][1]}`);
      if (!nbr || nbr.isLand) {
        const [v0, v1] = EDGE_VERTS[d];
        coastSegs.push([pts[v0], pts[v1]]);
      }
    }
  }

  hexG.selectAll('line.coast')
    .data(coastSegs)
    .join('line')
    .attr('class', 'coast')
    .attr('x1', d => d[0].x).attr('y1', d => d[0].y)
    .attr('x2', d => d[1].x).attr('y2', d => d[1].y)
    .attr('stroke', '#c83232')
    .attr('stroke-width', 1.8)
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');

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
    const raw  = sim.effortH;
    const mx   = Math.max(...raw) || 1;
    const lut  = new Map(seaHexes.map((h, i) => [h.hex_id, Math.log1p(raw[i]) / Math.log1p(mx)]));
    seaColour = h => colEffort(lut.get(h.hex_id) ?? 0);

  } else if (layer === 'sightings' && sim && anal) {
    const totals = new Float64Array(H);
    // Sum over ALL dolphins (residents + transients) — transients contribute to raw sightings
    // even though they are filtered from the analysis pipeline by the ≥4 gate.
    for (const d of sim.dolphins)
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
    const { Bstar, dolphins, N } = anal;
    // Accumulate total B* weight and per-latent-cluster weight for each sea hex.
    // Uses guild_true (generative latent assignment), not detected communities,
    // so this layer shows the true ecological structure on the map.
    const hexTotals = new Float64Array(H);
    const commW     = new Array(H).fill(null).map(() => new Map());
    for (let i = 0; i < N; i++) {
      const c = dolphins[i].guild_true; if (c < 0) continue;
      for (let hi = 0; hi < H; hi++) {
        const w = Bstar[i * H + hi]; if (w <= 0) continue;
        commW[hi].set(c, (commW[hi].get(c) || 0) + w);
        hexTotals[hi] += w;
      }
    }
    // Dominant latent cluster + its share of total B* weight for each hex
    const domResult = commW.map((m, hi) => {
      let best = -1, bestW = 0;
      for (const [c, w] of m) { if (w > bestW) { bestW = w; best = c; } }
      const share = hexTotals[hi] > 0 ? bestW / hexTotals[hi] : 0;
      return { comm: best, share };
    });
    const lut = new Map(seaHexes.map((h, i) => [h.hex_id, domResult[i]]));
    // Full colour = majority (>50%); pale = plurality only
    // NO_GUILD_FILL: a neutral light grey, distinct from land (#c8c0b0 warm tan)
    // and from the saturated community colours.
    const NO_GUILD_FILL = '#e4e4e4';
    seaColour = h => {
      const res = lut.get(h.hex_id);
      if (!res || res.comm < 0) return NO_GUILD_FILL;
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

  // Port hex: blue outline drawn on top of the hex fill layer.
  // Redrawn each colour update so it survives layer switches.
  portG.selectAll('*').remove();
  if (sim?.portHex && state.hexGrid) {
    const { xMin, yMin, hexSize: hs } = state.hexGrid;
    const { hexes, xMax, yMax } = state.hexGrid;
    const rect2 = hexContainer.getBoundingClientRect();
    const cW2 = rect2.width || 500, cH2 = rect2.height || 460;
    const pad2 = hs * 0.9;
    const sc2 = Math.min((cW2 - 2*pad2) / (xMax - xMin || 1), (cH2 - 2*pad2) / (yMax - yMin || 1));
    const offX2 = pad2 + (cW2 - 2*pad2 - (xMax - xMin)*sc2) / 2;
    const offY2 = pad2;
    const ph = sim.portHex;
    portG.append('path')
      .attr('d', hexPathString(offX2 + (ph.x - xMin)*sc2, offY2 + (ph.y - yMin)*sc2, hs * sc2 * 0.98))
      .attr('fill', 'none')
      .attr('stroke', '#1a6faf')
      .attr('stroke-width', 2.5);
  }

  updateHexLegend();
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
wireSlider('sl-nTransients',  'nTransients',         v => String(v | 0),    reg);
wireSlider('sl-T',            'T',                  v => String(v | 0),    reg);
wireSlider('sl-effortBias',   'effortBias',          v => v.toFixed(2),     reg);
wireSlider('sl-detectionProb','detectionProb',       v => v.toFixed(2),     reg);
wireSlider('sl-hexSize',      'hexSize',             v => String(v | 0),    reg);
wireSlider('sl-k',            'k',                  v => String(v | 0),    rean);
wireSlider('sl-eMin',         'eMin',                v => v.toFixed(1),     rean);
wireSlider('sl-resolution',   'louvainResolution',   v => v.toFixed(1),     rean);

// Seed inputs (number box + random button, not sliders)
function wireSeed(inputId, btnId, key) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!inp) return;
  inp.addEventListener('change', () => {
    const v = Math.max(1, parseInt(inp.value, 10) || 1);
    inp.value = v;
    state.setParam(key, v);
    reg();
  });
  if (btn) btn.addEventListener('click', () => {
    const v = 1 + Math.floor(Math.random() * 99999);
    inp.value = v;
    state.setParam(key, v);
    reg();
  });
}

wireSeed('inp-seed',     'btn-rand-seed',     'seed');
wireSeed('inp-sim-seed', 'btn-rand-sim-seed', 'simSeed');

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

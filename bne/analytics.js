// bne/analytics.js — network/matrix panel and metrics strip.

import * as state from './state.js';

const GUILD_COLS = d3.schemeTableau10;
const UNASSIGNED = '#cccccc';

// ── Network panel ─────────────────────────────────────────────────────────
const netContainer = document.getElementById('bne-network-view');
let simulation = null;
let netSvg = null, netG = null;
let netNodes = [], netLinks = [];

function buildNetwork() {
  netContainer.innerHTML = '';
  const anal = state.analysis;
  if (!anal) { netContainer.innerHTML = '<p class="bne-empty">Run Generate to see the network.</p>'; return; }

  const cW = netContainer.clientWidth  || 500;
  const cH = netContainer.clientHeight || 380;

  if (state.networkView === 'bstar') { drawBstarMatrix(cW, cH); return; }

  netSvg = d3.select(netContainer).append('svg').attr('width', cW).attr('height', cH);
  netG   = netSvg.append('g');

  // Arrow marker for directed hint (not used here, but svg defs)
  const defs = netSvg.append('defs');

  // Build nodes and links based on current view
  const { dolphins, jaccard, knnAdj, communities, rawComms, N } = anal;

  netNodes = dolphins.map((d, i) => ({
    id: d.dolphin_id,
    idx: i,
    guild_true: d.guild_true,
    community: communities[i],
    isSpecialist: d.isSpecialist,
  }));

  const view = state.networkView;
  const adjMatrix = (view === 'jaccard') ? jaccard : knnAdj;
  netLinks = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const w = adjMatrix[i * N + j];
      if (w > 0) netLinks.push({ source: i, target: j, w });
    }
  }

  // Stop old simulation
  if (simulation) simulation.stop();

  // Links
  const linkSel = netG.append('g').attr('class', 'net-links')
    .selectAll('line')
    .data(netLinks)
    .join('line')
    .attr('stroke', '#ccc')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', d => Math.max(0.3, d.w * 4));

  // Nodes
  const radius = Math.max(4, Math.min(8, 300 / Math.sqrt(N)));
  const nodeSel = netG.append('g').attr('class', 'net-nodes')
    .selectAll('circle')
    .data(netNodes)
    .join('circle')
    .attr('r', radius)
    .attr('stroke', d => d.community >= 0 ? '#fff' : '#aaa')
    .attr('stroke-width', 1.5)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag',  dragged)
      .on('end',   dragEnd))
    .on('click', (event, d) => {
      event.stopPropagation();
      state.selectDolphin(d.id);
    });

  applyNodeColours(nodeSel);

  // Tooltips
  nodeSel.append('title').text(d => {
    const s = d.isSpecialist ? 'Specialist' : 'Generalist';
    const c = d.community >= 0 ? `Community ${d.community + 1}` : 'Unassigned';
    return `Dolphin ${d.id} · ${s} · True guild ${d.guild_true + 1} · ${c}`;
  });

  // Click background to deselect
  netSvg.on('click', () => state.selectDolphin(-1));

  // Force simulation
  simulation = d3.forceSimulation(netNodes)
    .force('link',   d3.forceLink(netLinks).id((_, i) => i).strength(d => d.w).distance(40))
    .force('charge', d3.forceManyBody().strength(-60))
    .force('center', d3.forceCenter(cW / 2, cH / 2))
    .force('collide',d3.forceCollide(radius + 2))
    .on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel
        .attr('cx', d => d.x).attr('cy', d => d.y);
    });
}

function applyNodeColours(sel) {
  const view = state.networkView;
  sel.attr('fill', d => {
    if (view === 'truth') {
      return GUILD_COLS[d.guild_true % GUILD_COLS.length];
    }
    return d.community >= 0 ? GUILD_COLS[d.community % GUILD_COLS.length] : UNASSIGNED;
  });
}

function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d)  { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d)  {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

// ── B* matrix heatmap ────────────────────────────────────────────────────
function drawBstarMatrix(cW, cH) {
  const { Bstar, dolphins, communities, N, H } = state.analysis;
  if (!Bstar) return;

  const margin = { t: 10, r: 10, b: 30, l: 10 };
  const w = cW - margin.l - margin.r;
  const h = cH - margin.t - margin.b;

  // Sort dolphins by community then guild
  const order = [...dolphins.keys()].sort((a, b) => {
    const ca = communities[a] >= 0 ? communities[a] : 999;
    const cb = communities[b] >= 0 ? communities[b] : 999;
    return ca !== cb ? ca - cb : dolphins[a].guild_true - dolphins[b].guild_true;
  });

  // Normalise B* per dolphin for visibility
  const rows = order.map(i => {
    const row = Array.from({ length: H }, (_, hi) => Bstar[i * H + hi]);
    const mx  = Math.max(...row) || 1;
    return row.map(v => v / mx);
  });

  const canvas = document.createElement('canvas');
  canvas.width  = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const cellW = w / H, cellH = h / order.length;

  const col = d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);

  for (let ri = 0; ri < order.length; ri++) {
    for (let hi = 0; hi < H; hi++) {
      ctx.fillStyle = col(rows[ri][hi]);
      ctx.fillRect(hi * cellW, ri * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  // Community colour bar on left
  for (let ri = 0; ri < order.length; ri++) {
    const c = communities[order[ri]];
    ctx.fillStyle = c >= 0 ? GUILD_COLS[c % 10] : UNASSIGNED;
    ctx.fillRect(0, ri * cellH, 6, Math.ceil(cellH));
  }

  const svg = d3.select(netContainer).append('svg').attr('width', cW).attr('height', cH);
  svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`)
    .append('foreignObject').attr('width', w).attr('height', h)
    .append('xhtml:div').style('line-height', '0')
    .node().appendChild(canvas);

  svg.append('text').attr('x', margin.l).attr('y', cH - 6)
    .attr('font-size', '10px').attr('fill', '#666')
    .text('← hexes (sorted by seaIdx) →  |  rows = dolphins sorted by community');
}

// ── Metrics strip ─────────────────────────────────────────────────────────
function updateMetrics() {
  const anal = state.analysis;
  const met  = state.metrics;
  const sim  = state.simData;

  function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  if (!anal) {
    ['bne-m-n','bne-m-ncomm','bne-m-q','bne-m-ari','bne-m-wb'].forEach(id => set(id, '—'));
    return;
  }

  set('bne-m-n',     String(anal.N));
  set('bne-m-ncomm', String(anal.nCommunities));
  set('bne-m-q',     anal.Q.toFixed(3));
  set('bne-m-ari',   met ? met.ari.toFixed(3) : '—');
  set('bne-m-wb',    anal.withinBetweenRatio != null ? anal.withinBetweenRatio.toFixed(2) + '×' : '—');
}

// ── Init and subscribe ────────────────────────────────────────────────────
export function initAnalytics() {
  state.subscribe(() => {
    buildNetwork();
    updateMetrics();
  });
}

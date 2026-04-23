// bne/analytics.js — network/matrix panel, scatter, and metrics strip.

import * as state from './state.js';

const GUILD_COLS = d3.schemeTableau10;
const UNASSIGNED = '#cccccc';

// ── Network legend helpers ─────────────────────────────────────────────────────
const netLegendEl = document.getElementById('bne-network-legend');

function gradBarNet(cssGrad) {
  return `<span class="leg-bar" style="background:${cssGrad}"></span>`;
}
function swatchNet(col) {
  return `<span class="leg-swatch" style="background:${col}"></span>`;
}
function commSwatches(n) {
  return Array.from({ length: n }, (_, c) =>
    `${swatchNet(GUILD_COLS[c % 10])} <b>C${c + 1}</b>`).join(' &thinsp; ');
}
function guildSwatches(n) {
  return Array.from({ length: n }, (_, g) =>
    `${swatchNet(GUILD_COLS[g % 10])} <b>G${g + 1}</b>`).join(' &thinsp; ');
}

function updateNetworkLegend(view) {
  if (!netLegendEl) return;
  const anal = state.analysis;
  let html = '';

  if (view === 'bstar') {
    html = `${gradBarNet('linear-gradient(to right,#e5f5e0,#a1d99b,#41ab5d,#006d2c)')}
            <b>Row-normalised B*</b>&thinsp; low → high
            <span class="leg-note">Rows = dolphins sorted by detected community (<b>left colour bar</b> = community) &nbsp;·&nbsp;
              Columns = sea hexes (sorted by position) &nbsp;·&nbsp;
              Cell = B*<sub>ih</sub> scaled to each row's maximum, so each dolphin's profile has equal visual weight regardless of activity level &nbsp;·&nbsp;
              Block patterns in the rows reveal shared habitat use within communities.</span>`;

  } else if (view === 'jaccard') {
    html = `${gradBarNet('linear-gradient(to right,#deebf7,#9ecae1,#3182bd,#084594)')}
            <b>Weighted Jaccard similarity</b>&thinsp; 0 → 0.65
            <span class="leg-note">Rows and columns = all retained dolphins &nbsp;·&nbsp;
              Cell = Σ min(a,b) / Σ max(a,b) on row-normalised B* profiles &nbsp;·&nbsp;
              Blues = higher habitat overlap &nbsp;·&nbsp;
              Diagonal = grey (self-similarity undefined) &nbsp;·&nbsp;
              Block structure on the diagonal indicates natural groupings — before any community labels are assigned.</span>`;

  } else if (view === 'knn') {
    html = `${swatchNet('#b0b8c4')} <b>node</b> &thinsp; ${swatchNet('#d0d0d0')} <b>edge</b>
            <span class="leg-note">Each dolphin (node) connected to its k most-similar neighbours by Jaccard, then symmetrised by taking the max weight &nbsp;·&nbsp;
              <b>Edge width</b> ∝ Jaccard similarity &nbsp;·&nbsp;
              Nodes and edges are neutral — community colours are not revealed until the Communities view &nbsp;·&nbsp;
              This is the graph that Louvain partitions.</span>`;

  } else if (view === 'communities') {
    const n = anal?.nCommunities ?? 0;
    html = `${n ? commSwatches(n) + ' &thinsp;' : ''}
            ${swatchNet('#e0e0e0')} <b>between</b>
            <span class="leg-note"><b>Nodes</b> = dolphins, colour = detected Louvain community &nbsp;·&nbsp;
              <b>Within-community edges</b>: community colour, opacity 0.55 &nbsp;·&nbsp;
              <b>Between-community edges</b>: pale grey, opacity 0.20 &nbsp;·&nbsp;
              <b>Edge width</b> ∝ Jaccard similarity &nbsp;·&nbsp;
              Nodes sorted by community on a circle; angular gaps mark community boundaries &nbsp;·&nbsp;
              Labels C1, C2 … placed outside the ring.</span>`;

  } else if (view === 'truth') {
    const G = anal ? (anal.dolphins.reduce((mx, d) => Math.max(mx, d.guild_true), -1) + 1) : 0;
    html = `${G ? guildSwatches(G) + ' &thinsp;' : ''}
            <span class="leg-note"><b>Node colour = true simulated guild</b> (not the detected community) &nbsp;·&nbsp;
              Nodes sorted by true guild &nbsp;·&nbsp;
              All edges pale grey; edge width ∝ Jaccard similarity &nbsp;·&nbsp;
              Labels G1, G2 … &nbsp;·&nbsp;
              Compare with the Communities view: if detected communities align with true guilds, ARI will be high.</span>`;
  }

  netLegendEl.innerHTML = html;
}

// ── Rebuild guards ────────────────────────────────────────────────────────────
let _prevAnalysis    = null;
let _prevNetworkView = null;
let _prevMetrics     = null;

// ── Network panel ─────────────────────────────────────────────────────────────
const netContainer = document.getElementById('bne-network-view');

// Place nodes on a circle sorted by sortField, with gaps at group boundaries.
function placeOnCircle(nodes, sortField, cx, cy, radius) {
  const N = nodes.length;
  if (N === 0) return;

  const order = [...Array(N).keys()].sort((a, b) => {
    const ka = nodes[a][sortField] >= 0 ? nodes[a][sortField] : 9999;
    const kb = nodes[b][sortField] >= 0 ? nodes[b][sortField] : 9999;
    return ka !== kb ? ka - kb : a - b;
  });

  let nGaps = 0, prevKey = null;
  for (const i of order) {
    const k = nodes[i][sortField] >= 0 ? nodes[i][sortField] : 9999;
    if (prevKey !== null && k !== prevKey) nGaps++;
    prevKey = k;
  }

  const GAP          = nGaps > 0 ? 0.10 : 0;
  const totalGap     = GAP * nGaps;
  const anglePerNode = (2 * Math.PI - totalGap) / N;
  let   angle        = -Math.PI / 2;
  prevKey            = null;

  for (const i of order) {
    const k = nodes[i][sortField] >= 0 ? nodes[i][sortField] : 9999;
    if (prevKey !== null && k !== prevKey) angle += GAP;
    nodes[i].x = cx + radius * Math.cos(angle);
    nodes[i].y = cy + radius * Math.sin(angle);
    angle   += anglePerNode;
    prevKey  = k;
  }
}

function buildNetwork() {
  netContainer.innerHTML = '';
  const anal = state.analysis;
  if (!anal) {
    netContainer.innerHTML = '<p class="bne-empty">Run Generate to see the network.</p>';
    if (netLegendEl) netLegendEl.innerHTML = '';
    return;
  }

  const rect = netContainer.getBoundingClientRect();
  const cW   = rect.width  || 520;
  const cH   = rect.height || 500;
  const view = state.networkView;

  if (view === 'bstar')   { drawBstarMatrix(cW, cH);   updateNetworkLegend('bstar');   return; }
  if (view === 'jaccard') { drawJaccardMatrix(cW, cH); updateNetworkLegend('jaccard'); return; }

  // ── Static circular node-link (knn / communities / truth) ──────────────────
  const { dolphins, knnAdj, communities, N } = anal;

  const nodes = dolphins.map((d, i) => ({
    id: d.dolphin_id, idx: i,
    guild_true: d.guild_true, community: communities[i],
    isSpecialist: d.isSpecialist,
    x: 0, y: 0,
  }));

  const sortField    = (view === 'truth') ? 'guild_true' : 'community';
  const nodeRadius   = Math.max(3, Math.min(7, 230 / Math.sqrt(N)));
  const layoutRadius = Math.min(cW, cH) * 0.38;

  placeOnCircle(nodes, sortField, cW / 2, cH / 2, layoutRadius);

  const edges = [];
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const w = knnAdj[i * N + j];
      if (w > 0) edges.push({ i, j, w });
    }

  const svg = d3.select(netContainer).append('svg')
    .attr('width', cW).attr('height', cH)
    .on('click', () => state.selectDolphin(-1));

  // kNN shows the graph that feeds into Louvain — no community colours yet.
  // Only 'communities' and 'truth' views reveal the partition result.
  const within = e => nodes[e.i].community >= 0 && nodes[e.i].community === nodes[e.j].community;
  const useComm = view === 'communities' || view === 'truth';

  // Draw between-community edges first (behind), within second (in front)
  const sortedEdges = useComm
    ? [...edges].sort((a, b) => (within(a) ? 1 : 0) - (within(b) ? 1 : 0))
    : edges;

  svg.append('g')
    .selectAll('line')
    .data(sortedEdges)
    .join('line')
    .attr('x1', e => nodes[e.i].x).attr('y1', e => nodes[e.i].y)
    .attr('x2', e => nodes[e.j].x).attr('y2', e => nodes[e.j].y)
    .attr('stroke', e => {
      if (!useComm) return '#d0d0d0';
      if (view === 'truth') return '#ccc';
      const c = nodes[e.i].community;
      return within(e) ? GUILD_COLS[c % GUILD_COLS.length] : '#e0e0e0';
    })
    .attr('stroke-opacity', e => useComm && within(e) ? 0.55 : 0.22)
    .attr('stroke-width',   e => Math.max(0.3, e.w * 2.5));

  // Nodes
  const colFn = view === 'truth'
    ? d => GUILD_COLS[d.guild_true % GUILD_COLS.length]
    : view === 'communities'
      ? d => (d.community >= 0 ? GUILD_COLS[d.community % GUILD_COLS.length] : UNASSIGNED)
      : () => '#b0b8c4'; // kNN: neutral before community detection

  svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('cx', d => d.x).attr('cy', d => d.y)
    .attr('r',  nodeRadius)
    .attr('fill',   colFn)
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .style('cursor', 'pointer')
    .on('click', (event, d) => { event.stopPropagation(); state.selectDolphin(d.id); })
    .append('title')
    .text(d => {
      const s = d.isSpecialist ? 'Specialist' : 'Generalist';
      const c = d.community >= 0 ? `Community ${d.community + 1}` : 'Unassigned';
      return `Dolphin ${d.id} · ${s} · True guild ${d.guild_true + 1} · ${c}`;
    });

  // Labels around the ring (skip for knn view — it shows structure before community assignment)
  if (view !== 'knn') {
    const groups = d3.group(nodes, d => view === 'truth' ? d.guild_true : d.community);
    groups.forEach((members, key) => {
      if (key < 0) return;
      const mx  = d3.mean(members, d => d.x);
      const my  = d3.mean(members, d => d.y);
      const ang = Math.atan2(my - cH / 2, mx - cW / 2);
      const lr  = layoutRadius + nodeRadius + 14;
      svg.append('text')
        .attr('x', cW / 2 + lr * Math.cos(ang))
        .attr('y', cH / 2 + lr * Math.sin(ang))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', GUILD_COLS[key % GUILD_COLS.length])
        .text(view === 'truth' ? `G${key + 1}` : `C${key + 1}`);
    });
  }

  updateNetworkLegend(view);
}

// ── Jaccard similarity matrix heatmap ─────────────────────────────────────────
function drawJaccardMatrix(cW, cH) {
  const { jaccard, dolphins, communities, N } = state.analysis;

  const margin = { t: 14, r: 14, b: 34, l: 14 };
  const w = cW - margin.l - margin.r;
  const h = cH - margin.t - margin.b;

  const order = [...dolphins.keys()].sort((a, b) => {
    const ca = communities[a] >= 0 ? communities[a] : 999;
    const cb = communities[b] >= 0 ? communities[b] : 999;
    return ca !== cb ? ca - cb : dolphins[a].guild_true - dolphins[b].guild_true;
  });

  const cell = Math.min(w, h) / N;
  const mW = Math.ceil(cell * N), mH = Math.ceil(cell * N);
  const canvas = document.createElement('canvas');
  canvas.width = mW; canvas.height = mH;
  const ctx = canvas.getContext('2d');
  const col = d3.scaleSequential(d3.interpolateBlues).domain([0, 0.65]);

  for (let ri = 0; ri < N; ri++) {
    for (let ci = 0; ci < N; ci++) {
      ctx.fillStyle = (ri === ci) ? '#ececec' : col(jaccard[order[ri] * N + order[ci]]);
      ctx.fillRect(ci * cell, ri * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }

  const ox = margin.l + (w - mW) / 2;
  const svg = d3.select(netContainer).append('svg').attr('width', cW).attr('height', cH);
  svg.append('g').attr('transform', `translate(${ox},${margin.t})`)
    .append('foreignObject').attr('width', mW).attr('height', mH)
    .append('xhtml:div').style('line-height', '0')
    .node().appendChild(canvas);

  svg.append('text').attr('x', cW / 2).attr('y', cH - 8)
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px').attr('fill', '#666')
    .text('Weighted Jaccard similarity · dolphins sorted by community');
}

// ── B* matrix heatmap ─────────────────────────────────────────────────────────
function drawBstarMatrix(cW, cH) {
  const { Bstar, dolphins, communities, N, H } = state.analysis;
  if (!Bstar) return;

  const margin = { t: 10, r: 10, b: 30, l: 10 };
  const w = cW - margin.l - margin.r;
  const h = cH - margin.t - margin.b;

  const order = [...dolphins.keys()].sort((a, b) => {
    const ca = communities[a] >= 0 ? communities[a] : 999;
    const cb = communities[b] >= 0 ? communities[b] : 999;
    return ca !== cb ? ca - cb : dolphins[a].guild_true - dolphins[b].guild_true;
  });

  const rows = order.map(i => {
    const row = Array.from({ length: H }, (_, hi) => Bstar[i * H + hi]);
    const mx  = Math.max(...row) || 1;
    return row.map(v => v / mx);
  });

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const cellW = w / H, cellH = h / order.length;
  const col = d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);

  for (let ri = 0; ri < order.length; ri++) {
    for (let hi = 0; hi < H; hi++) {
      ctx.fillStyle = col(rows[ri][hi]);
      ctx.fillRect(hi * cellW, ri * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }
  // Community colour bar on left edge — helps identify block structure.
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
    .text('← hexes (sorted by seaIdx) →  ·  rows = dolphins sorted by community');
}

// ── Specialist / generalist scatter ──────────────────────────────────────────
const scatterContainer = document.getElementById('chart-bne-scatter');

function buildScatter() {
  if (!scatterContainer) return;
  scatterContainer.innerHTML = '';
  const met  = state.metrics;
  const anal = state.analysis;
  if (!met || !anal) {
    scatterContainer.innerHTML = '<p class="bne-empty">Generate a population to see this chart.</p>';
    return;
  }

  const { dolphins, communities } = anal;
  const { nicheBreadth, core50 } = met;

  const rect    = scatterContainer.getBoundingClientRect();
  const W       = Math.max(rect.width  || 500, 300);
  const H_chart = 240;
  const margin  = { t: 16, r: 24, b: 44, l: 52 };
  const iW = W - margin.l - margin.r;
  const iH = H_chart - margin.t - margin.b;

  const xMax = d3.max(nicheBreadth) || 1;
  const yMax = d3.max(core50) || 1;
  const xScale = d3.scaleLinear().domain([0, xMax * 1.06]).nice().range([0, iW]);
  const yScale = d3.scaleLinear().domain([0, yMax * 1.08]).nice().range([iH, 0]);

  const svg = d3.select(scatterContainer).append('svg')
    .attr('width', W).attr('height', H_chart);
  const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);

  // Gridlines
  g.append('g').attr('class', 'grid')
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-iW).tickFormat(''))
    .selectAll('line').attr('stroke', '#f0f0f0');
  g.select('.grid .domain').remove();

  // Axes
  g.append('g').attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(6))
    .call(ax => ax.select('.domain').attr('stroke', '#ccc'))
    .call(ax => ax.selectAll('line').attr('stroke', '#ccc'));

  g.append('g')
    .call(d3.axisLeft(yScale).ticks(5))
    .call(ax => ax.select('.domain').attr('stroke', '#ccc'))
    .call(ax => ax.selectAll('line').attr('stroke', '#ccc'));

  // Axis labels
  g.append('text').attr('x', iW / 2).attr('y', iH + 36)
    .attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#555')
    .text('Niche breadth (hexes with non-zero B*)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -iH / 2).attr('y', -40)
    .attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#555')
    .text('Core₅₀ (hexes for 50% of B*)');

  // Points
  const points = dolphins.map((d, i) => ({
    nb: nicheBreadth[i], c50: core50[i],
    community: communities[i], isSpecialist: d.isSpecialist,
    guild_true: d.guild_true, id: d.dolphin_id,
  }));

  g.selectAll('circle')
    .data(points)
    .join('circle')
    .attr('cx', d => xScale(d.nb))
    .attr('cy', d => yScale(d.c50))
    .attr('r', 5)
    .attr('fill',         d => d.community >= 0 ? GUILD_COLS[d.community % GUILD_COLS.length] : UNASSIGNED)
    .attr('fill-opacity', 0.80)
    .attr('stroke',       d => d.isSpecialist ? '#333' : 'none')
    .attr('stroke-width', 1.5)
    .append('title')
    .text(d => {
      const s = d.isSpecialist ? 'Specialist' : 'Generalist';
      const c = d.community >= 0 ? `Community ${d.community + 1}` : 'Unassigned';
      return `Dolphin ${d.id} · ${s} · ${c} · breadth ${d.nb} · core50 ${d.c50}`;
    });

  // Inline legend (top-right corner)
  const nComm = new Set(points.map(d => d.community).filter(c => c >= 0)).size;
  const leg = svg.append('g').attr('transform', `translate(${W - margin.r - 4},${margin.t})`);

  // Community colour swatches
  for (let c = 0; c < nComm; c++) {
    const ly = c * 14;
    leg.append('rect').attr('x', -100).attr('y', ly).attr('width', 10).attr('height', 10)
      .attr('rx', 2).attr('fill', GUILD_COLS[c % GUILD_COLS.length]).attr('opacity', 0.80);
    leg.append('text').attr('x', -87).attr('y', ly + 9)
      .attr('font-size', '9px').attr('fill', '#444').text(`Community ${c + 1}`);
  }

  // Specialist / generalist markers
  const symY = nComm * 14 + 6;
  leg.append('circle').attr('cx', -95).attr('cy', symY + 5).attr('r', 5)
    .attr('fill', '#aaa').attr('fill-opacity', 0.80).attr('stroke', '#333').attr('stroke-width', 1.5);
  leg.append('text').attr('x', -87).attr('y', symY + 9).attr('font-size', '9px').attr('fill', '#444')
    .text('Specialist (true)');

  leg.append('circle').attr('cx', -95).attr('cy', symY + 19).attr('r', 5)
    .attr('fill', '#aaa').attr('fill-opacity', 0.80);
  leg.append('text').attr('x', -87).attr('y', symY + 23).attr('font-size', '9px').attr('fill', '#444')
    .text('Generalist (true)');

  // Legend box background (drawn first — insert before legend content)
  const legH = nComm * 14 + 46;
  leg.insert('rect', ':first-child')
    .attr('x', -105).attr('y', -4).attr('width', 108).attr('height', legH)
    .attr('rx', 3).attr('fill', 'rgba(255,255,255,0.88)').attr('stroke', '#ddd').attr('stroke-width', 0.5);
}

// ── Metrics strip ─────────────────────────────────────────────────────────────
function updateMetrics() {
  const anal = state.analysis;
  const met  = state.metrics;
  function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
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

// ── Init and subscribe ────────────────────────────────────────────────────────
export function initAnalytics() {
  state.subscribe(() => {
    // Metrics strip is cheap and must always stay in sync — run unconditionally first.
    updateMetrics();

    const needsNetwork = state.analysis !== _prevAnalysis || state.networkView !== _prevNetworkView;
    const needsScatter = state.metrics  !== _prevMetrics;

    if (needsNetwork) {
      _prevAnalysis    = state.analysis;
      _prevNetworkView = state.networkView;
      try { buildNetwork(); } catch (e) { console.error('buildNetwork error:', e); }
    }
    if (needsScatter) {
      _prevMetrics = state.metrics;
      try { buildScatter(); } catch (e) { console.error('buildScatter error:', e); }
    }
  });
}

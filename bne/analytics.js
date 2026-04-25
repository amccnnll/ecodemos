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

  if (view === 'bipartite') {
    const n = anal?.nCommunities ?? 0;
    html = `${n ? commSwatches(n) + ' &thinsp; ' : ''}${swatchNet('#9999aa')} <b>hex</b>
            <span class="leg-note"><b>Left</b> = retained dolphins (coloured by detected community, sorted by community) &nbsp;·&nbsp;
              <b>Right</b> = sea hexes &nbsp;·&nbsp;
              <b>Edges</b>: B*<sub>ih</sub> &gt; 5% of dolphin's peak B*; coloured by dolphin community; width ∝ B* &nbsp;·&nbsp;
              This is the raw dolphin × hex data before projection to the dolphin-dolphin similarity graph.</span>`;

  } else if (view === 'bstar') {
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

  } else if (view === 'full') {
    html = `${swatchNet('#4878CF')} <b>node</b> &thinsp; ${swatchNet('#8090a8')} <b>edge</b>
            <span class="leg-note">All pairs with Jaccard &gt; 0 connected — no kNN pruning &nbsp;·&nbsp;
              Nodes in neutral order (dolphin ID); no community structure implied &nbsp;·&nbsp;
              <b>Edge width</b> ∝ Jaccard similarity &nbsp;·&nbsp;
              Compare with the kNN view to see how pruning removes weak between-guild noise while retaining strong within-guild connections.</span>`;

  } else if (view === 'knn') {
    html = `${swatchNet('#4878CF')} <b>node</b> &thinsp; ${swatchNet('#8090a8')} <b>edge</b>
            <span class="leg-note">Each dolphin (node) connected to its k most-similar neighbours by Jaccard, then symmetrised by taking the max weight &nbsp;·&nbsp;
              Nodes in neutral order (dolphin ID) — community colours not revealed until the Communities view &nbsp;·&nbsp;
              <b>Edge width</b> ∝ Jaccard similarity &nbsp;·&nbsp;
              This is the sparse graph that Louvain partitions.</span>`;

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
    const sim = state.simData;
    const G = sim ? sim.G : 0;
    html = `${G ? guildSwatches(G) + ' &thinsp;' : ''}
            <span class="leg-note"><b>All dolphins shown</b> (residents + transients, retained or not) &nbsp;·&nbsp;
              <b>Node colour = latent cluster</b> (the true generative assignment each dolphin was drawn from) &nbsp;·&nbsp;
              Nodes sorted by latent cluster; labels G1, G2 … &nbsp;·&nbsp;
              Bright outline = retained (≥ 4 sightings and in the analysis); faint = not retained or transient &nbsp;·&nbsp;
              <b>Edges = θ preference similarity</b> (Gaussian kernel; dolphins with similar habitat preferences are connected regardless of guild) &nbsp;·&nbsp;
              Compare with the Communities view: if Louvain recovers the latent structure, detected C labels should align with true G labels.</span>`;
  }

  netLegendEl.innerHTML = html;
}

// ── Rebuild guards ────────────────────────────────────────────────────────────
let _prevAnalysis    = null;
let _prevNetworkView = null;
let _prevMetrics     = null;

// ── Network panel ─────────────────────────────────────────────────────────────
const netContainer = document.getElementById('bne-network-view');

// Place nodes on a circle sorted by sortField (with gaps at group boundaries),
// or in index order with no gaps when sortField is null.
function placeOnCircle(nodes, sortField, cx, cy, radius) {
  const N = nodes.length;
  if (N === 0) return;

  const order = sortField === null
    ? [...Array(N).keys()]
    : [...Array(N).keys()].sort((a, b) => {
        const ka = nodes[a][sortField] >= 0 ? nodes[a][sortField] : 9999;
        const kb = nodes[b][sortField] >= 0 ? nodes[b][sortField] : 9999;
        return ka !== kb ? ka - kb : a - b;
      });

  let nGaps = 0, prevKey = null;
  if (sortField !== null) {
    for (const i of order) {
      const k = nodes[i][sortField] >= 0 ? nodes[i][sortField] : 9999;
      if (prevKey !== null && k !== prevKey) nGaps++;
      prevKey = k;
    }
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

// ── Raw bipartite view ────────────────────────────────────────────────────────
function drawBipartite(cW, cH) {
  const { Bstar, dolphins, communities, N } = state.analysis;
  const seaHexes = state.simData.seaHexes;
  const H = seaHexes.length;

  const xDolph = cW * 0.22;
  const xHex   = cW * 0.78;
  const padV   = 24;

  // Sort dolphins by community (unassigned last)
  const dolphOrder = [...Array(N).keys()].sort((a, b) => {
    const ca = communities[a] >= 0 ? communities[a] : 9999;
    const cb = communities[b] >= 0 ? communities[b] : 9999;
    return ca !== cb ? ca - cb : a - b;
  });

  const dSlotH = (cH - 2 * padV) / N;
  const hSlotH = Math.max(1, (cH - 2 * padV) / H);
  const nodeR  = Math.max(2, Math.min(5, dSlotH * 0.38));

  const svg = d3.select(netContainer).append('svg').attr('width', cW).attr('height', cH);

  // Column headers
  svg.append('text').attr('x', xDolph).attr('y', 14).attr('text-anchor', 'middle')
    .attr('font-size', '10px').attr('fill', '#666').text('Dolphins');
  svg.append('text').attr('x', xHex).attr('y', 14).attr('text-anchor', 'middle')
    .attr('font-size', '10px').attr('fill', '#666').text('Hexes');

  // Pre-compute per-dolphin max B* for threshold
  const dMaxB = new Float64Array(N);
  for (let i = 0; i < N; i++)
    for (let hi = 0; hi < H; hi++)
      if (Bstar[i * H + hi] > dMaxB[i]) dMaxB[i] = Bstar[i * H + hi];

  // Build edge list (ascending weight so heavy edges render on top)
  const edges = [];
  const threshold = 0.05;
  for (let oi = 0; oi < N; oi++) {
    const i = dolphOrder[oi];
    if (dMaxB[i] <= 0) continue;
    for (let hi = 0; hi < H; hi++) {
      const b = Bstar[i * H + hi];
      if (b >= threshold * dMaxB[i]) edges.push({ oi, hi, b });
    }
  }
  edges.sort((a, b) => a.b - b.b);

  // Global max for stroke-width scaling
  const globalMax = d3.max(edges, e => e.b) || 1;

  // Dolphin y positions
  const dolphY = dolphOrder.map((_, slot) => padV + (slot + 0.5) * dSlotH);
  // Map from dolphin index to its slot y
  const dY = new Float64Array(N);
  dolphOrder.forEach((i, slot) => { dY[i] = padV + (slot + 0.5) * dSlotH; });

  // Hex y positions (sorted by seaIdx, which is already sequential)
  const hY = new Float64Array(H);
  for (let hi = 0; hi < H; hi++) hY[hi] = padV + (hi + 0.5) * hSlotH;

  // Edges
  svg.append('g')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('x1', e => xDolph)
    .attr('y1', e => dY[dolphOrder[e.oi]])
    .attr('x2', e => xHex)
    .attr('y2', e => hY[e.hi])
    .attr('stroke', e => {
      const c = communities[dolphOrder[e.oi]];
      return c >= 0 ? GUILD_COLS[c % GUILD_COLS.length] : '#aaa';
    })
    .attr('stroke-opacity', 0.20)
    .attr('stroke-width', e => Math.max(0.3, (e.b / globalMax) * 2.5));

  // Hex nodes (drawn before dolphin nodes so dolphins are on top)
  svg.append('g')
    .selectAll('rect')
    .data(seaHexes)
    .join('rect')
    .attr('x', xHex - 1).attr('y', (_, hi) => hY[hi] - 1)
    .attr('width', 2).attr('height', Math.max(1, hSlotH * 0.6))
    .attr('fill', '#9999aa');

  // Dolphin nodes — datum is the dolphin index i, dY[i] gives its y position
  svg.append('g')
    .selectAll('circle')
    .data(dolphOrder)
    .join('circle')
    .attr('cx', xDolph)
    .attr('cy', i => dY[i])
    .attr('r', nodeR)
    .attr('fill', i => {
      const c = communities[i];
      return c >= 0 ? GUILD_COLS[c % GUILD_COLS.length] : UNASSIGNED;
    })
    .attr('stroke', '#fff').attr('stroke-width', 0.8);

  updateNetworkLegend('bipartite');
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

  if (view === 'bipartite') { drawBipartite(cW, cH); return; }
  if (view === 'bstar')   { drawBstarMatrix(cW, cH);   updateNetworkLegend('bstar');   return; }
  if (view === 'jaccard') { drawJaccardMatrix(cW, cH); updateNetworkLegend('jaccard'); return; }
  if (view === 'truth')   { drawFullTruth(cW, cH); return; }

  // ── Static circular node-link (full / knn / communities / truth) ───────────
  const { dolphins, knnAdj, jaccard, communities, N } = anal;

  const nodes = dolphins.map((d, i) => ({
    id: d.dolphin_id, idx: i,
    guild_true: d.guild_true, community: communities[i],
    isSpecialist: d.isSpecialist,
    x: 0, y: 0,
  }));

  // Full and kNN views show the graph before community assignment: pass null for
  // no sorting or gaps, so the layout doesn't pre-reveal community structure.
  // Communities sorts by community label with group gaps.
  const sortField = (view === 'communities') ? 'community'
                  : null;  // full / knn: neutral index order, no group gaps
  const nodeRadius   = Math.max(3, Math.min(7, 230 / Math.sqrt(N)));
  const layoutRadius = Math.min(cW, cH) * 0.38;

  placeOnCircle(nodes, sortField, cW / 2, cH / 2, layoutRadius);

  const adjMatrix = (view === 'full') ? jaccard : knnAdj;
  const edges = [];
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const w = adjMatrix[i * N + j];
      if (w > 0) edges.push({ i, j, w });
    }

  const svg = d3.select(netContainer).append('svg')
    .attr('width', cW).attr('height', cH)
    .on('click', () => state.selectDolphin(-1));

  // Communities reveals the partition; Full and kNN stay neutral.
  const within = e => nodes[e.i].community >= 0 && nodes[e.i].community === nodes[e.j].community;
  const useComm = view === 'communities';

  // Draw between-community edges first (behind), within second (in front)
  const sortedEdges = useComm
    ? [...edges].sort((a, b) => (within(a) ? 1 : 0) - (within(b) ? 1 : 0))
    : edges;

  const EDGE_NEUTRAL = '#8090a8';  // visible grey-blue for uncoloured views
  svg.append('g')
    .selectAll('line')
    .data(sortedEdges)
    .join('line')
    .attr('x1', e => nodes[e.i].x).attr('y1', e => nodes[e.i].y)
    .attr('x2', e => nodes[e.j].x).attr('y2', e => nodes[e.j].y)
    .attr('stroke', e => {
      if (!useComm) return EDGE_NEUTRAL;
      const c = nodes[e.i].community;
      return within(e) ? GUILD_COLS[c % GUILD_COLS.length] : '#c4ccd8';
    })
    .attr('stroke-opacity', e => {
      if (useComm && within(e)) return 0.60;
      return view === 'full' ? 0.18 : 0.40;
    })
    .attr('stroke-width', e => Math.max(0.3, e.w * 2.5));

  // Nodes
  const COBALT = '#4878CF';
  const colFn = view === 'communities'
    ? d => (d.community >= 0 ? GUILD_COLS[d.community % GUILD_COLS.length] : UNASSIGNED)
    : () => COBALT; // full / knn: neutral cobalt before community detection

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
      return `Dolphin ${d.id} · ${s} · ${c}`;
    });

  // Labels around the ring for communities view
  if (view === 'communities') {
    const groups = d3.group(nodes, d => d.community);
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
        .text(`C${key + 1}`);
    });
  }

  updateNetworkLegend(view);
}

// ── Full Truth network ────────────────────────────────────────────────────────
// Shows ALL dolphins in the generative model (residents + transients,
// retained or not) connected by θ_i similarity edges. This is the ecological
// ground truth: the continuous preference structure that existed before the survey.
// Contrast with the Communities view, which shows only retained dolphins coloured
// by what Louvain could recover from observed sightings alone.
function drawFullTruth(cW, cH) {
  const sim = state.simData;
  if (!sim) return;

  const allDolphins = sim.dolphins;
  const M = allDolphins.length;

  const retainedIds = new Set(
    state.analysis ? state.analysis.dolphins.map(d => d.dolphin_id) : []
  );

  const nodes = allDolphins.map(d => ({
    id: d.dolphin_id, guild_true: d.guild_true,
    isSpecialist: d.isSpecialist, isResident: d.isResident,
    retained: retainedIds.has(d.dolphin_id),
    theta: d.theta, x: 0, y: 0,
  }));

  const nodeRadius   = Math.max(3, Math.min(6, 220 / Math.sqrt(M)));
  const layoutRadius = Math.min(cW, cH) * 0.38;
  placeOnCircle(nodes, 'guild_true', cW / 2, cH / 2, layoutRadius);

  // Gaussian kernel edges on θ_i: w = exp(-‖θ_i − θ_j‖² / 2τ²)
  const TAU2 = 2 * 0.20 * 0.20;
  const THRESH = 0.35;
  const edges = [];
  for (let i = 0; i < M; i++) {
    for (let j = i + 1; j < M; j++) {
      const ti = nodes[i].theta, tj = nodes[j].theta;
      const d2 = (ti[0]-tj[0])**2 + (ti[1]-tj[1])**2 + (ti[2]-tj[2])**2;
      const w = Math.exp(-d2 / TAU2);
      if (w > THRESH) edges.push({ i, j, w });
    }
  }

  const svg = d3.select(netContainer).append('svg')
    .attr('width', cW).attr('height', cH)
    .on('click', () => state.selectDolphin(-1));

  svg.append('g')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('x1', e => nodes[e.i].x).attr('y1', e => nodes[e.i].y)
    .attr('x2', e => nodes[e.j].x).attr('y2', e => nodes[e.j].y)
    .attr('stroke', '#8090a8')
    .attr('stroke-opacity', e => e.w * 0.45)
    .attr('stroke-width', e => Math.max(0.3, e.w * 2));

  // Three visual tiers: retained (solid white outline), non-retained resident
  // (grey outline), transient (faint fill, thin outline)
  svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('cx', d => d.x).attr('cy', d => d.y)
    .attr('r',  nodeRadius)
    .attr('fill', d => d.guild_true >= 0 ? GUILD_COLS[d.guild_true % GUILD_COLS.length] : UNASSIGNED)
    .attr('fill-opacity', d => d.isResident ? (d.retained ? 0.90 : 0.55) : 0.35)
    .attr('stroke',       d => d.retained ? '#fff' : (d.isResident ? '#bbb' : '#999'))
    .attr('stroke-width', d => d.retained ? 1.5 : 0.8)
    .style('cursor', 'pointer')
    .on('click', (event, d) => { event.stopPropagation(); state.selectDolphin(d.id); })
    .append('title')
    .text(d => {
      const g  = d.guild_true >= 0 ? `Cluster ${d.guild_true + 1}` : 'Transient';
      const sp = d.isSpecialist ? 'Specialist' : 'Generalist';
      const rt = d.retained ? 'Retained (≥4 sightings)' : (d.isResident ? 'Not retained' : 'Transient');
      return `Dolphin ${d.id} · ${g} · ${sp} · ${rt}`;
    });

  // Cluster labels
  const groups = d3.group(nodes.filter(n => n.guild_true >= 0), d => d.guild_true);
  groups.forEach((members, key) => {
    const mx  = d3.mean(members, d => d.x);
    const my  = d3.mean(members, d => d.y);
    const ang = Math.atan2(my - cH / 2, mx - cW / 2);
    const lr  = layoutRadius + nodeRadius + 14;
    svg.append('text')
      .attr('x', cW / 2 + lr * Math.cos(ang))
      .attr('y', cH / 2 + lr * Math.sin(ang))
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', '10px').attr('font-weight', '600')
      .attr('fill', GUILD_COLS[key % GUILD_COLS.length])
      .text(`G${key + 1}`);
  });

  updateNetworkLegend('truth');
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
  const { nicheBreadth, evenness } = met;
  const totalSightings = state.simData ? state.simData.totalSightings : null;

  const rect    = scatterContainer.getBoundingClientRect();
  const W       = Math.max(rect.width  || 500, 300);
  const H_chart = 240;
  const margin  = { t: 16, r: 24, b: 44, l: 52 };
  const iW = W - margin.l - margin.r;
  const iH = H_chart - margin.t - margin.b;

  // Residents only — transients have no habitat preference term so they add noise.
  const residentIdx = dolphins.map((d, i) => i).filter(i => dolphins[i].isResident !== false);

  const xMax = d3.max(residentIdx, i => nicheBreadth[i]) || 1;
  const xScale = d3.scaleLinear().domain([0, xMax * 1.06]).nice().range([0, iW]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([iH, 0]);

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
    .text('Niche breadth (hexes with B* > 5% of peak)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -iH / 2).attr('y', -40)
    .attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#555')
    .text("Pielou's J (lower = specialist, higher = even use)");

  // Points — residents only. Radius encodes total sightings so we can see
  // whether unusual scatter positions are driven by real concentration or
  // by data sparsity.
  const points = residentIdx.map(i => ({
    nb: nicheBreadth[i], j: evenness[i],
    community: communities[i], isSpecialist: dolphins[i].isSpecialist,
    guild_true: dolphins[i].guild_true, id: dolphins[i].dolphin_id,
    n: totalSightings ? totalSightings[dolphins[i].dolphin_id] : 0,
  }));

  const maxN = d3.max(points, d => d.n) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxN]).range([2.5, 9]);

  g.selectAll('circle')
    .data(points)
    .join('circle')
    .attr('cx', d => xScale(d.nb))
    .attr('cy', d => yScale(d.j))
    .attr('r', d => rScale(d.n))
    .attr('fill',         d => d.community >= 0 ? GUILD_COLS[d.community % GUILD_COLS.length] : UNASSIGNED)
    .attr('fill-opacity', 0.80)
    .attr('stroke',       d => d.isSpecialist ? '#333' : 'none')
    .attr('stroke-width', 1.5)
    .append('title')
    .text(d => {
      const s = d.isSpecialist ? 'Specialist' : 'Generalist';
      const c = d.community >= 0 ? `Community ${d.community + 1}` : 'Unassigned';
      return `Dolphin ${d.id} · ${s} · ${c} · breadth ${d.nb} hexes · J ${d.j.toFixed(3)} · ${d.n} sightings`;
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

  // Size legend (radius = sqrt sightings)
  const sizeY = symY + 36;
  leg.append('text').attr('x', -100).attr('y', sizeY).attr('font-size', '9px').attr('fill', '#444')
    .text('Size = √(sightings)');
  const sizeMarks = [Math.max(1, Math.round(maxN * 0.1)), Math.max(2, Math.round(maxN * 0.5)), Math.max(3, Math.round(maxN))];
  let sx = -95;
  for (const v of sizeMarks) {
    leg.append('circle').attr('cx', sx).attr('cy', sizeY + 14).attr('r', rScale(v))
      .attr('fill', '#aaa').attr('fill-opacity', 0.45).attr('stroke', '#888').attr('stroke-width', 0.5);
    leg.append('text').attr('x', sx).attr('y', sizeY + 30).attr('text-anchor', 'middle')
      .attr('font-size', '8px').attr('fill', '#666').text(v);
    sx += 22;
  }

  // Legend box background (drawn first — insert before legend content)
  const legH = nComm * 14 + 90;
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
  const sim = state.simData;
  const ntotal = sim ? sim.Ntotal : anal.N;
  set('bne-m-n',     anal.N + ' / ' + ntotal);
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

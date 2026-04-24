import { generateHexGrid } from '../src/bne-hex.js';
import { generateSimulation } from '../src/bne-sim.js';
import { runAnalysis }        from '../src/bne-analysis.js';
import { computeMetrics }     from '../src/bne-metrics.js';

export const params = {
  // Domain
  cols: 18, rows: 14, hexSize: 30, seed: 42,
  // Population
  N: 60, G: 4, guildOverlap: 0.3, specialistFraction: 0.5, nTransients: 15, simSeed: 42,
  // Survey
  T: 6, effortBias: 0.7, detectionProb: 0.3,
  // Analysis
  eMin: 0.5, k: 8, louvainResolution: 1.0, minCommunitySize: 3,
};

export let hexGrid  = null;
export let simData  = null;
export let analysis = null;
export let metrics  = null;

export let hexLayer     = 'environment';   // 'environment'|'effort'|'sightings'|'bstar'|'guild'|'individual'
export let networkView  = 'communities';   // 'bstar'|'jaccard'|'knn'|'communities'|'truth'
export let selectedDolphin = -1;

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); }
function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error('BNE state subscriber error:', e); }
  }
}

export function setHexLayer(layer)   { hexLayer = layer; notify(); }
export function setNetworkView(view) { networkView = view; notify(); }
export function selectDolphin(id)    { selectedDolphin = id; hexLayer = id >= 0 ? 'individual' : hexLayer; notify(); }

export function setParam(key, value) { params[key] = value; }

// Fixed arena dimensions (cols × hexSize = constant). Changing hexSize keeps the
// physical extent the same but alters the spatial grain (MAUP demonstration).
const ARENA_W = 18 * 30; // 540 — reference arena width in grid units
const ARENA_H = 14 * 30; // 420 — reference arena height in grid units

// Population/domain params changed → full regenerate
export function regenerate() {
  const cols = Math.max(10, Math.min(36, Math.round(ARENA_W / params.hexSize)));
  const rows = Math.max(8,  Math.min(28, Math.round(ARENA_H / params.hexSize)));
  hexGrid  = generateHexGrid({ cols, rows, hexSize: params.hexSize, seed: params.seed });
  simData  = generateSimulation({ hexGrid, ...params, seed: params.simSeed });
  analysis = (simData && simData.retainedDolphins.length >= 2)
    ? runAnalysis(simData, params)
    : null;
  metrics  = (analysis) ? computeMetrics(simData, analysis) : null;
  selectedDolphin = -1;
  notify();
}

// Analysis-only params changed (k, eMin, resolution) → skip generative model
export function reanalyse() {
  if (!simData) return;
  analysis = (simData.retainedDolphins.length >= 2)
    ? runAnalysis(simData, params)
    : null;
  metrics  = analysis ? computeMetrics(simData, analysis) : null;
  notify();
}

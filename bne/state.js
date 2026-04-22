import { generateHexGrid } from '../src/bne-hex.js';
import { generateSimulation } from '../src/bne-sim.js';
import { runAnalysis }        from '../src/bne-analysis.js';
import { computeMetrics }     from '../src/bne-metrics.js';

export const params = {
  // Domain
  cols: 18, rows: 14, hexSize: 30, seed: 42,
  // Population
  N: 60, G: 4, guildOverlap: 0.3, specialistFraction: 0.5,
  // Survey
  T: 6, effortBias: 0.7, detectionProb: 0.3,
  // Analysis
  eMin: 5, k: 8, louvainResolution: 1.0, minCommunitySize: 3,
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
function notify() { for (const fn of listeners) fn(); }

export function setHexLayer(layer)   { hexLayer = layer; notify(); }
export function setNetworkView(view) { networkView = view; notify(); }
export function selectDolphin(id)    { selectedDolphin = id; hexLayer = id >= 0 ? 'individual' : hexLayer; notify(); }

export function setParam(key, value) { params[key] = value; }

// Population/domain params changed → full regenerate
export function regenerate() {
  hexGrid  = generateHexGrid({ cols: params.cols, rows: params.rows, hexSize: params.hexSize, seed: params.seed });
  simData  = generateSimulation({ hexGrid, ...params });
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

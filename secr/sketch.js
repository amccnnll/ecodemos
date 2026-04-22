/**
 * secr/sketch.js — SECR p5.js sketch
 *
 * Handles all rendering for the SECR simulation pane.
 * Imports the pure engine from src/secr-engine.js.
 * Pushes capture events to secr/state.js for the analytics layer.
 * p5 and D3 are available as globals (loaded via CDN in index.html).
 */

import { createRng }         from '../src/rng.js';
import {
  placeAnimals,
  placeDetectors,
  stepAnimal,
  tryDetectsOnOccasion,
} from '../src/secr-engine.js';
import {
  resetState,
  updatePositions,
  updateDetectors,
  recordOccasion,
  updateParams,
  notifyAll,
  state,
} from './state.js';

// ─── Config constants ─────────────────────────────────────────────────────────

// Buffer = 2σ at default σ=0.20 (0.40km). Inner = total − 2×buffer = 1.20km.
// Smaller buffer keeps the inner zone visually prominent and ensures most
// animals are close enough to the detector array to be detectable.
const BUFFER_KM   = 0.4;              // buffer zone around inner study area (km)
const INNER_KM    = 1.2;              // inner study area side length (km)
const ARENA_KM    = INNER_KM + 2 * BUFFER_KM; // total arena side (= 2 km)

const G0_DEFAULT       = 0.4;
const SIGMA_DEFAULT    = 0.20;        // km — buffer ≈ 2σ so most animals overlap the detector array
const N_DEFAULT        = 10;          // animals — visual clarity over statistical power
const K_DEFAULT        = 10;
const GRID_N_DEFAULT   = 4;           // 4×4 = 16 detectors
const TAU_DEFAULT      = 5.0;         // home range crossing time (occasions)
const FIDELITY_DEFAULT = 1.0;         // site fidelity multiplier on spring strength
const DISPLAY_LERP     = 0.15;        // display position lerp rate toward true position
const FLASH_FRAMES     = 45;          // detection flash duration
const TRAIL_LENGTH     = 60;          // frames of trail history per animal

const FRAMES_PER_OCC = { slow: 120, normal: 60, fast: 15 };

const MOVEMENT_PRESETS = {
  resident:    { tau: 5.0, fidelity: 1.0 },
  sedentary:   { tau: 6.0, fidelity: 3.0 },
  wideRanging: { tau: 2.0, fidelity: 0.4 },
  nomad:       { tau: 1.0, fidelity: 0.2 },
};

const DETECTOR_PRESETS = {
  default:  { g0: 0.40, sigma: 0.20 },
  camera:   { g0: 0.45, sigma: 0.08 },
  liveTrap: { g0: 0.60, sigma: 0.05 },
  acoustic: { g0: 0.20, sigma: 0.40 },
};

// Effective detection σ = intrinsic σ / √fidelity.
// High fidelity → tighter home range → smaller effective detection range.
function computeSigmaEff() { return sigma / Math.sqrt(fidelity); }

const ANIMAL_FILES = ['crocodile', 'dolphin', 'eagle', 'leopard', 'lobster', 'snake', 't-rex'];

// Per-animal colours (up to 10 animals; last few are never used at default N)
const ANIMAL_COLOURS = [
  [64,  128, 255],  // blue
  [220, 80,  80 ],  // red
  [60,  180, 60 ],  // green
  [200, 80,  200],  // purple
  [240, 160, 40 ],  // orange
  [40,  200, 200],  // teal
  [160, 80,  40 ],  // brown
  [180, 60,  120],  // pink
  [200, 200, 40 ],  // yellow-green
  [100, 100, 200],  // lavender
];

// ─── Module-level state (survives p5 closure; shared by DOM listeners) ────────

let seed          = Math.floor(Math.random() * 100000);
let iconIndex     = Math.floor(Math.random() * ANIMAL_FILES.length);

// Complications params — read from DOM; module-level so listeners can update them
let g0            = G0_DEFAULT;
let sigma         = SIGMA_DEFAULT;
let tau           = TAU_DEFAULT;
let fidelity      = FIDELITY_DEFAULT;
let N             = N_DEFAULT;
let K             = K_DEFAULT;
let gridN         = GRID_N_DEFAULT;
let detectorLayout = 'grid';
let speed         = 'normal';

// Exposed from p5 closure so the detector-layout listener can clear detectors
// without triggering a full reset
let clearDetectorsFn = null;
let showCentroids    = false;  // controlled by toggle-centroids checkbox

// Cached per-frame movement params — recalculated only when inputs change
let _cachedSpringStr  = 0;
let _cachedNoiseScale = 0;
let _cachedParamKey   = '';

function getMovementParams(fpk) {
  const key = `${tau}|${sigma}|${fidelity}|${fpk}`;
  if (key !== _cachedParamKey) {
    const drag       = 0.08;
    _cachedSpringStr  = drag / (tau * fpk);
    _cachedNoiseScale = sigma * drag * Math.sqrt(2 / (fidelity * tau * fpk));
    _cachedParamKey   = key;
  }
  return { springStr: _cachedSpringStr, noiseScale: _cachedNoiseScale };
}

// ─── p5 sketch ────────────────────────────────────────────────────────────────

new p5(function (p) {

  let placementRng;         // seeded — governs animal + detector placement
  let movementRng;          // unseeded — governs per-frame movement
  let detectionRng;         // unseeded — governs occasion detection draws
  let animals     = [];
  let detectors   = [];
  let detectorMap = new Map(); // id → detector, rebuilt when detectors change
  let flashes     = [];        // [{ x, y, col, frame }]
  // Per-animal circular trail buffers: avoid per-frame array allocation and O(n) shift
  let trailBufs   = new Map(); // animalId → { xs: Float32Array, ys: Float32Array, head, count }
  let phase       = 'idle'; // 'idle' | 'running' | 'paused' | 'complete'
  let currentK    = 0;
  let targetK     = K_DEFAULT; // occasions to run before stopping (extends on Run again)
  let framesSinceOcc = 0;
  let PX_PER_KM;

  // Briefly highlight animals that were just captured: Map(animalId → framesLeft)
  const recentCaptures = new Map();

  // Keeps detectors, detectorMap, and state in sync
  function setDetectors(dets) {
    detectors   = dets;
    detectorMap = new Map(dets.map(d => [d.id, d]));
    updateDetectors(dets);
  }

  // All 7 animal SVGs loaded in preload; we render animalImgs[iconIndex]
  const animalImgs = [];

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  p.preload = function () {
    for (const name of ANIMAL_FILES) {
      animalImgs.push(p.loadImage(`../assets/animals/${name}.svg`));
    }
  };

  p.setup = function () {
    const container = document.getElementById('sim-container');
    const cs  = getComputedStyle(container);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    // Square canvas: SECR arena is square
    const size = Math.min(container.clientWidth - pad, container.clientHeight);
    const canvas = p.createCanvas(size, size);
    canvas.parent('sim-container');
    PX_PER_KM = size / ARENA_KM;
    initSim();
    wireControls();
    // Expose detector-clear to module-level listener
    clearDetectorsFn = () => {
      detectors = [];
      setDetectors(detectors);
    };
  };

  p.draw = function () {
    p.background(255);
    drawArena();
    drawDetectors();
    drawFlashes();
    drawTrails();
    drawAnimals();
    drawCentroids();
    drawHUD();

    if (phase === 'running') {
      const fpk = FRAMES_PER_OCC[speed] ?? 120;
      const { springStr, noiseScale } = getMovementParams(fpk);

      // Step all animals in place (mutates x/y/vx/vy), then lerp display positions
      for (const a of animals) {
        const odx = a.dx, ody = a.dy;
        stepAnimal(a, ARENA_KM, ARENA_KM, movementRng, noiseScale, springStr, 0.08);
        a.dx = odx + DISPLAY_LERP * (a.x - odx);
        a.dy = ody + DISPLAY_LERP * (a.y - ody);
      }
      updatePositions(animals);

      // Record smoothed display positions into pre-allocated circular buffers
      for (const a of animals) {
        let tb = trailBufs.get(a.id);
        if (!tb) {
          tb = { xs: new Float32Array(TRAIL_LENGTH), ys: new Float32Array(TRAIL_LENGTH), head: 0, count: 0 };
          trailBufs.set(a.id, tb);
        }
        tb.xs[tb.head] = a.dx;
        tb.ys[tb.head] = a.dy;
        tb.head = (tb.head + 1) % TRAIL_LENGTH;
        if (tb.count < TRAIL_LENGTH) tb.count++;
      }

      // Tick toward next occasion
      framesSinceOcc++;
      if (framesSinceOcc >= fpk) {
        framesSinceOcc = 0;
        runOccasion();
      }
    }

    // Age and expire flashes; age recent-capture highlights
    flashes = flashes.filter(f => f.frame < FLASH_FRAMES);
    flashes.forEach(f => f.frame++);
    for (const [id, framesLeft] of recentCaptures) {
      if (framesLeft <= 0) recentCaptures.delete(id);
      else recentCaptures.set(id, framesLeft - 1);
    }
  };

  // ── Simulation init ─────────────────────────────────────────────────────────

  function initSim() {
    readParams();
    placementRng = createRng(seed);
    movementRng  = new Math.seedrandom();  // unseeded — different movement each run
    detectionRng = new Math.seedrandom();  // unseeded — different luck each run
    phase        = 'idle';
    currentK     = 0;
    targetK      = K;
    framesSinceOcc = 0;
    flashes      = [];
    trailBufs    = new Map();
    recentCaptures.clear();

    const innerX0 = BUFFER_KM;
    const innerY0 = BUFFER_KM;

    animals = placeAnimals(N, ARENA_KM, ARENA_KM, placementRng)
      .map(a => ({ ...a, dx: a.x, dy: a.y }));

    if (detectorLayout === 'custom') {
      // Preserve user-placed detectors; re-index them
      detectors = detectors.map((d, i) => ({ ...d, id: i }));
    } else {
      detectors = placeDetectors(
        detectorLayout, INNER_KM, INNER_KM, innerX0, innerY0,
        placementRng, gridN, 16,
      );
    }

    const trueD = N / (ARENA_KM * ARENA_KM);
    resetState({ N, K, trueD, arenaW: ARENA_KM, arenaH: ARENA_KM,
                 innerW: INNER_KM, innerH: INNER_KM, innerX0, innerY0 });
    updatePositions(animals);
    setDetectors(detectors);
    updateParams({ g0, sigma, sigmaEff: computeSigmaEff() });
    syncPlayBtn();
    syncSeedInput();
  }

  function readParams() {
    g0             = parseFloat(document.getElementById('slider-g0')?.value)          || G0_DEFAULT;
    sigma          = parseFloat(document.getElementById('slider-sigma')?.value)        || SIGMA_DEFAULT;
    tau            = parseFloat(document.getElementById('slider-tau')?.value)          || TAU_DEFAULT;
    fidelity       = parseFloat(document.getElementById('slider-fidelity')?.value)     || FIDELITY_DEFAULT;
    N              = parseInt(document.getElementById('slider-n')?.value, 10)          || N_DEFAULT;
    K              = parseInt(document.getElementById('slider-k')?.value, 10)          || K_DEFAULT;
    gridN          = parseInt(document.getElementById('slider-grid-n')?.value, 10)     || GRID_N_DEFAULT;
    detectorLayout = document.getElementById('select-detector-layout')?.value          || 'grid';
  }

  // ── Occasion loop ───────────────────────────────────────────────────────────

  function runOccasion() {
    currentK++;
    const captures = tryDetectsOnOccasion(animals, detectors, g0, computeSigmaEff(), detectionRng);

    // Spawn detection flashes (one per capture event, at the detector position)
    for (const c of captures) {
      const det = detectorMap.get(c.detectorId);
      const col = ANIMAL_COLOURS[c.animalId % ANIMAL_COLOURS.length];
      if (det) flashes.push({ x: det.x, y: det.y, col, frame: 0 });
      recentCaptures.set(c.animalId, FLASH_FRAMES);
    }

    recordOccasion(currentK, captures);

    if (currentK >= targetK) {
      phase = 'complete';
      syncPlayBtn();
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  function worldToPx(wx, wy) {
    return { px: wx * PX_PER_KM, py: wy * PX_PER_KM };
  }

  function drawArena() {
    const bufPx  = BUFFER_KM * PX_PER_KM;
    const innPx  = INNER_KM  * PX_PER_KM;
    const totPx  = ARENA_KM  * PX_PER_KM;

    // Buffer zone — very light grey wash
    p.noStroke();
    p.fill(240, 242, 248);
    p.rect(0, 0, totPx, totPx);

    // Inner study area — white
    p.fill(255);
    p.rect(bufPx, bufPx, innPx, innPx);

    // Inner study area border — dashed blue
    p.noFill();
    p.stroke(100, 140, 220, 180);
    p.strokeWeight(1);
    _dashedRect(bufPx, bufPx, innPx, innPx, 6, 4);

    // Outer arena border
    p.stroke(160);
    p.strokeWeight(1);
    p.rect(0, 0, totPx - 1, totPx - 1);

    // Buffer label (top-left corner)
    p.noStroke();
    p.fill(140, 160, 200);
    p.textSize(10);
    p.textAlign(p.LEFT, p.TOP);
    p.text('buffer', 4, 4);
  }

  function drawDetectors() {
    const size = 10;
    for (const det of detectors) {
      const { px, py } = worldToPx(det.x, det.y);
      p.strokeWeight(1.2);
      p.stroke(60, 100, 180);
      p.fill(220, 230, 255);
      p.rect(px - size / 2, py - size / 2, size, size, 2);
      // Lens dot
      p.noStroke();
      p.fill(60, 100, 180);
      p.circle(px, py, 4);
    }

    // If in idle + custom layout: show placement hint
    if (phase === 'idle' && detectorLayout === 'custom') {
      p.noStroke();
      p.fill(60, 100, 180, 180);
      p.textSize(11);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.text('Click inner area to place/remove detectors', p.width / 2, p.height - 6);
    }
  }

  function drawAnimals() {
    const img  = animalImgs[iconIndex];
    const size = 28;
    for (const animal of animals) {
      const { px, py }    = worldToPx(animal.dx, animal.dy);
      const framesLeft    = recentCaptures.get(animal.id) ?? 0;
      const col           = ANIMAL_COLOURS[animal.id % ANIMAL_COLOURS.length];

      if (framesLeft > 0) {
        // Briefly show in individual colour on detection
        p.tint(...col, 220);
      } else {
        // Faint grey when not recently detected
        p.tint(160, 160, 160, 90);
      }
      p.imageMode(p.CENTER);
      p.image(img, px, py, size, size);
    }
    p.noTint();
    p.imageMode(p.CORNER);
  }

  // Draw true and estimated activity centres for each animal.
  // True centre:      filled dot in animal colour (always shown).
  // Estimated centre: cross (×) in animal colour (shown once animal has ≥1 capture).
  // Estimated centre = mean position of detectors that caught the animal.
  function drawCentroids() {
    if (!showCentroids) return;

    // Build capture list per animal from shared state
    const capsByAnimal = new Map();
    for (const c of state.captures) {
      if (!capsByAnimal.has(c.animalId)) capsByAnimal.set(c.animalId, []);
      capsByAnimal.get(c.animalId).push(c.detectorId);
    }
    const detMap = new Map(detectors.map(d => [d.id, d]));

    for (const animal of animals) {
      const [r, g, b] = ANIMAL_COLOURS[animal.id % ANIMAL_COLOURS.length];
      const { px: tcx, py: tcy } = worldToPx(animal.cx, animal.cy);

      // True centroid — filled dot
      p.push();
      p.noStroke();
      p.fill(r, g, b, 210);
      p.circle(tcx, tcy, 8);
      p.pop();

      // Estimated centroid — cross (×), only once captured
      const capDets = capsByAnimal.get(animal.id);
      if (capDets && capDets.length > 0) {
        const ex = capDets.reduce((s, did) => s + (detMap.get(did)?.x ?? 0), 0) / capDets.length;
        const ey = capDets.reduce((s, did) => s + (detMap.get(did)?.y ?? 0), 0) / capDets.length;
        const { px: ecx, py: ecy } = worldToPx(ex, ey);
        const cs = 5;
        p.push();
        p.stroke(r, g, b, 230);
        p.strokeWeight(2);
        p.line(ecx - cs, ecy - cs, ecx + cs, ecy + cs);
        p.line(ecx + cs, ecy - cs, ecx - cs, ecy + cs);
        p.pop();
      }
    }
  }

  function drawFlashes() {
    p.noFill();
    for (const f of flashes) {
      const { px, py } = worldToPx(f.x, f.y);
      const progress   = f.frame / FLASH_FRAMES;
      const radius     = 8 + progress * 32;
      const alpha      = 220 * (1 - progress);
      p.stroke(...f.col, alpha);
      p.strokeWeight(2);
      p.circle(px, py, radius * 2);
    }
  }

  // Draw each animal's movement trail as a smooth fading Catmull-Rom curve.
  // Reads from circular Float32Array buffers — no per-frame allocation.
  function drawTrails() {
    const CHUNKS = 5;
    p.noFill();
    for (const animal of animals) {
      const tb = trailBufs.get(animal.id);
      if (!tb || tb.count < 4) continue;
      const col       = ANIMAL_COLOURS[animal.id % ANIMAL_COLOURS.length];
      const n         = tb.count;
      const chunkSize = Math.ceil(n / CHUNKS);

      for (let chunk = 0; chunk < CHUNKS; chunk++) {
        const iStart = chunk * chunkSize;
        const iEnd   = Math.min(iStart + chunkSize + 1, n);
        if (iEnd - iStart < 2) continue;

        p.stroke(col[0], col[1], col[2], ((chunk + 1) / CHUNKS) * 190);
        p.strokeWeight(1.5);
        p.beginShape();
        // Read circular buffer in logical order: oldest (0) → newest (n-1)
        const base = tb.head - n + TRAIL_LENGTH;
        const i0px = (base + iStart)     % TRAIL_LENGTH;
        const iNpx = (base + iEnd - 1)   % TRAIL_LENGTH;
        p.curveVertex(tb.xs[i0px] * PX_PER_KM, tb.ys[i0px] * PX_PER_KM);
        for (let i = iStart; i < iEnd; i++) {
          const bi = (base + i) % TRAIL_LENGTH;
          p.curveVertex(tb.xs[bi] * PX_PER_KM, tb.ys[bi] * PX_PER_KM);
        }
        p.curveVertex(tb.xs[iNpx] * PX_PER_KM, tb.ys[iNpx] * PX_PER_KM);
        p.endShape();
      }
    }
    p.noStroke();
  }

  function drawHUD() {
    p.noStroke();
    p.fill(60);
    p.textSize(12);
    p.textAlign(p.RIGHT, p.TOP);
    const kLabel = currentK === 0 ? 'k = —' : `k = ${currentK} / ${targetK}`;
    p.text(kLabel, p.width - 6, 6);
  }

  // Draw a dashed rectangle (p5 has no built-in)
  function _dashedRect(x, y, w, h, dashLen, gapLen) {
    _dashedLine(x,     y,     x + w, y,     dashLen, gapLen);
    _dashedLine(x + w, y,     x + w, y + h, dashLen, gapLen);
    _dashedLine(x + w, y + h, x,     y + h, dashLen, gapLen);
    _dashedLine(x,     y + h, x,     y,     dashLen, gapLen);
  }

  function _dashedLine(x1, y1, x2, y2, dashLen, gapLen) {
    const dx   = x2 - x1;
    const dy   = y2 - y1;
    const len  = Math.hypot(dx, dy);
    const step = dashLen + gapLen;
    const ux   = dx / len;
    const uy   = dy / len;
    let dist   = 0;
    while (dist < len) {
      const d0 = dist;
      const d1 = Math.min(dist + dashLen, len);
      p.line(x1 + ux * d0, y1 + uy * d0, x1 + ux * d1, y1 + uy * d1);
      dist += step;
    }
  }

  // ── Controls ─────────────────────────────────────────────────────────────────

  function wireControls() {
    document.getElementById('btn-playpause').addEventListener('click', () => {
      if (phase === 'idle' || phase === 'paused') {
        phase = 'running';
      } else if (phase === 'running') {
        phase = 'paused';
      } else if (phase === 'complete') {
        // Run again — K more occasions on the same population
        const kMore = parseInt(document.getElementById('slider-k')?.value, 10) || K_DEFAULT;
        targetK = currentK + kMore;
        phase   = 'running';
        framesSinceOcc = 0;
      }
      syncPlayBtn();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      initSim(); // same seed, same icon
    });

    document.getElementById('btn-new-population').addEventListener('click', () => {
      seed      = Math.floor(Math.random() * 100000);
      iconIndex = Math.floor(Math.random() * animalImgs.length);
      initSim();
    });

    // Speed toggle
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        speed = btn.dataset.speed;
      });
    });

    // Seed input
    const seedInput = document.getElementById('seed-input');
    seedInput.addEventListener('change', () => {
      const v = parseInt(seedInput.value, 10);
      if (!isNaN(v)) { seed = v; initSim(); }
    });
    seedInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') seedInput.dispatchEvent(new Event('change'));
    });
  }

  function syncPlayBtn() {
    const btn = document.getElementById('btn-playpause');
    if (!btn) return;
    if      (phase === 'running')  { btn.textContent = '⏸ Pause'; }
    else if (phase === 'complete') { btn.textContent = '↺ Run again'; }
    else if (phase === 'paused')   { btn.textContent = '▶ Resume'; }
    else                           { btn.textContent = '▶ Run'; }
  }

  function syncSeedInput() {
    const el = document.getElementById('seed-input');
    if (el) el.value = seed;
  }

  // ── Canvas resize ─────────────────────────────────────────────────────────────

  p.windowResized = function () {
    const container = document.getElementById('sim-container');
    const cs  = getComputedStyle(container);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const size = Math.min(container.clientWidth - pad, container.clientHeight);
    if (size > 0) {
      p.resizeCanvas(size, size);
      PX_PER_KM = size / ARENA_KM;
    }
    // Notify analytics so charts can redraw at the new container dimensions
    notifyAll();
  };

  // ── Click-to-place detectors ─────────────────────────────────────────────────

  p.mousePressed = function () {
    if (phase !== 'idle' || detectorLayout !== 'custom') return;
    if (p.mouseX < 0 || p.mouseX > p.width || p.mouseY < 0 || p.mouseY > p.height) return;

    const wx = p.mouseX / PX_PER_KM;
    const wy = p.mouseY / PX_PER_KM;

    // Must be inside inner study area
    if (wx < BUFFER_KM || wx > BUFFER_KM + INNER_KM ||
        wy < BUFFER_KM || wy > BUFFER_KM + INNER_KM) return;

    // Click within 10px of existing detector → remove it
    const hitIdx = detectors.findIndex(d => {
      const { px, py } = worldToPx(d.x, d.y);
      return Math.hypot(px - p.mouseX, py - p.mouseY) < 10;
    });

    if (hitIdx >= 0) {
      detectors.splice(hitIdx, 1);
      detectors = detectors.map((d, i) => ({ ...d, id: i }));
    } else {
      detectors.push({ id: detectors.length, x: wx, y: wy });
    }

    setDetectors(detectors);
  };

}, document.getElementById('sim-container'));

// ─── Module-level DOM listeners (Complications) ───────────────────────────────
// These mirror the DS pattern: sliders with immediate readout; layout/N/K take
// effect on next Reset. g0 and sigma update the detection surface live.

document.getElementById('slider-g0').addEventListener('input', e => {
  g0 = parseFloat(e.target.value);
  document.getElementById('val-g0').textContent = g0.toFixed(2);
  updateParams({ g0 });
});

document.getElementById('slider-sigma').addEventListener('input', e => {
  sigma = parseFloat(e.target.value);
  document.getElementById('val-sigma').textContent = sigma.toFixed(2) + ' km';
  updateParams({ sigma, sigmaEff: computeSigmaEff() });
});

document.getElementById('slider-n').addEventListener('input', e => {
  document.getElementById('val-n').textContent = parseInt(e.target.value, 10);
});

document.getElementById('slider-k').addEventListener('input', e => {
  document.getElementById('val-k').textContent = parseInt(e.target.value, 10);
});

document.getElementById('slider-grid-n').addEventListener('input', e => {
  document.getElementById('val-grid-n').textContent = `${e.target.value}×${e.target.value}`;
});

document.getElementById('slider-tau').addEventListener('input', e => {
  tau = parseFloat(e.target.value);
  document.getElementById('val-tau').textContent = tau.toFixed(1) + ' occ';
});

document.getElementById('slider-fidelity').addEventListener('input', e => {
  fidelity = parseFloat(e.target.value);
  document.getElementById('val-fidelity').textContent = fidelity.toFixed(1) + '×';
  updateParams({ sigmaEff: computeSigmaEff() });
});

document.getElementById('select-movement-preset').addEventListener('change', e => {
  const preset = MOVEMENT_PRESETS[e.target.value];
  if (!preset) return;
  tau      = preset.tau;
  fidelity = preset.fidelity;
  document.getElementById('slider-tau').value          = tau;
  document.getElementById('slider-fidelity').value     = fidelity;
  document.getElementById('val-tau').textContent       = tau.toFixed(1) + ' occ';
  document.getElementById('val-fidelity').textContent  = fidelity.toFixed(1) + '×';
  updateParams({ sigmaEff: computeSigmaEff() });
});

document.getElementById('select-detector-preset').addEventListener('change', e => {
  const preset = DETECTOR_PRESETS[e.target.value];
  if (!preset) return;
  g0    = preset.g0;
  sigma = preset.sigma;
  document.getElementById('slider-g0').value          = g0;
  document.getElementById('slider-sigma').value       = sigma;
  document.getElementById('val-g0').textContent       = g0.toFixed(2);
  document.getElementById('val-sigma').textContent    = sigma.toFixed(2) + ' km';
  updateParams({ g0, sigma, sigmaEff: computeSigmaEff() });
});


function syncDetectorSliders() {
  const show = detectorLayout === 'grid';
  const row  = document.getElementById('row-grid-n');
  if (row) row.style.display = show ? 'flex' : 'none';
  const removeRow = document.getElementById('row-remove-all');
  if (removeRow) removeRow.style.display = detectorLayout === 'custom' ? 'block' : 'none';
}

document.getElementById('select-detector-layout').addEventListener('change', e => {
  detectorLayout = e.target.value;
  syncDetectorSliders();
  // Switching to custom: clear any grid/random detectors so the user starts blank
  if (detectorLayout === 'custom' && clearDetectorsFn) {
    clearDetectorsFn();
  }
});

document.getElementById('btn-remove-all-detectors').addEventListener('click', () => {
  if (clearDetectorsFn) clearDetectorsFn();
});

// Detection surface toggle — shows/hides the overlay in the sim pane
document.getElementById('toggle-surface').addEventListener('change', e => {
  const overlay = document.getElementById('surface-overlay');
  if (!overlay) return;
  overlay.style.display = e.target.checked ? 'flex' : 'none';
  // Defer notifyAll one frame so the browser lays out the overlay before
  // analytics.js reads clientWidth/clientHeight for the surface SVG size
  if (e.target.checked) requestAnimationFrame(() => notifyAll());
});

document.getElementById('toggle-centroids').addEventListener('change', e => {
  showCentroids = e.target.checked;
});

document.getElementById('btn-reset-defaults').addEventListener('click', () => {
  document.getElementById('slider-g0').value     = G0_DEFAULT;
  document.getElementById('slider-sigma').value  = SIGMA_DEFAULT;
  document.getElementById('slider-n').value      = N_DEFAULT;
  document.getElementById('slider-k').value      = K_DEFAULT;
  document.getElementById('slider-grid-n').value = GRID_N_DEFAULT;
  document.getElementById('slider-tau').value      = TAU_DEFAULT;
  document.getElementById('slider-fidelity').value = FIDELITY_DEFAULT;
  document.getElementById('select-detector-layout').value  = 'grid';
  document.getElementById('select-movement-preset').value  = 'resident';
  document.getElementById('select-detector-preset').value  = 'default';
  document.getElementById('val-g0').textContent     = G0_DEFAULT.toFixed(2);
  document.getElementById('val-sigma').textContent  = SIGMA_DEFAULT.toFixed(2) + ' km';
  document.getElementById('val-n').textContent      = N_DEFAULT;
  document.getElementById('val-k').textContent      = K_DEFAULT;
  document.getElementById('val-grid-n').textContent = `${GRID_N_DEFAULT}×${GRID_N_DEFAULT}`;
  document.getElementById('val-tau').textContent      = TAU_DEFAULT.toFixed(1) + ' occ';
  document.getElementById('val-fidelity').textContent = FIDELITY_DEFAULT.toFixed(1) + '×';
  g0           = G0_DEFAULT;
  sigma        = SIGMA_DEFAULT;
  tau          = TAU_DEFAULT;
  N            = N_DEFAULT;
  K            = K_DEFAULT;
  gridN        = GRID_N_DEFAULT;
  fidelity     = FIDELITY_DEFAULT;
  detectorLayout = 'grid';
  showCentroids  = false;
  document.getElementById('toggle-centroids').checked = false;
  syncDetectorSliders();
  updateParams({ g0, sigma, sigmaEff: computeSigmaEff() });
  document.getElementById('btn-reset').click();
});

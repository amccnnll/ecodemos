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
  state,
} from './state.js';

// ─── Config constants ─────────────────────────────────────────────────────────

const BUFFER_KM   = 0.5;              // buffer zone around inner study area (km)
const INNER_KM    = 1.0;              // inner study area side length (km)
const ARENA_KM    = INNER_KM + 2 * BUFFER_KM; // total arena side (= 2 km)

const G0_DEFAULT       = 0.5;
const SIGMA_DEFAULT    = 0.15;        // km
const N_DEFAULT        = 5;
const K_DEFAULT        = 10;
const GRID_N_DEFAULT   = 4;           // 4×4 = 16 detectors
const TAU_DEFAULT      = 2.0;         // home range crossing time (occasions)
const FLASH_FRAMES     = 45;          // detection flash duration
const TRAIL_LENGTH     = 60;          // frames of trail history per animal

const FRAMES_PER_OCC = { slow: 240, normal: 120, fast: 30 };

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
let N             = N_DEFAULT;
let K             = K_DEFAULT;
let gridN         = GRID_N_DEFAULT;
let movementType  = 'brownian';
let detectorLayout = 'grid';
let speed         = 'normal';

// Exposed from p5 closure so the detector-layout listener can clear detectors
// without triggering a full reset
let clearDetectorsFn = null;

// ─── p5 sketch ────────────────────────────────────────────────────────────────

new p5(function (p) {

  let placementRng;         // seeded — governs animal + detector placement
  let movementRng;          // unseeded — governs per-frame movement
  let detectionRng;         // unseeded — governs occasion detection draws
  let animals     = [];
  let detectors   = [];
  let flashes     = [];     // [{ x, y, col, frame }]
  let trails      = new Map();  // animalId → [{x, y}], capped at TRAIL_LENGTH
  let phase       = 'idle'; // 'idle' | 'running' | 'paused' | 'complete'
  let currentK    = 0;
  let targetK     = K_DEFAULT; // occasions to run before stopping (extends on Run again)
  let framesSinceOcc = 0;
  let PX_PER_KM;

  // Briefly highlight animals that were just captured: Map(animalId → framesLeft)
  const recentCaptures = new Map();

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
      updateDetectors(detectors);
    };
  };

  p.draw = function () {
    p.background(255);
    drawArena();
    drawDetectors();
    drawFlashes();
    drawTrails();
    drawAnimals();
    drawHUD();

    if (phase === 'running') {
      const fpk = FRAMES_PER_OCC[speed] ?? 120;

      // Compute per-frame movement params from τ (OU model: σ_eq ≈ sigma stays constant)
      const springStr = 1 / (tau * fpk);
      const stepSz    = sigma * Math.sqrt(2 * springStr);

      // Record current positions into trail before stepping
      for (const animal of animals) {
        let trail = trails.get(animal.id);
        if (!trail) { trail = []; trails.set(animal.id, trail); }
        trail.push({ x: animal.x, y: animal.y });
        if (trail.length > TRAIL_LENGTH) trail.shift();
      }

      // Move all animals one step
      animals = animals.map(a =>
        stepAnimal(a, ARENA_KM, ARENA_KM, movementRng, movementType, stepSz, springStr)
      );
      updatePositions(animals);

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
    trails       = new Map();
    recentCaptures.clear();

    const innerX0 = BUFFER_KM;
    const innerY0 = BUFFER_KM;

    animals = placeAnimals(N, ARENA_KM, ARENA_KM, placementRng);

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
    updateDetectors(detectors);
    syncPlayBtn();
    syncSeedInput();
  }

  function readParams() {
    g0             = parseFloat(document.getElementById('slider-g0')?.value)          || G0_DEFAULT;
    sigma          = parseFloat(document.getElementById('slider-sigma')?.value)        || SIGMA_DEFAULT;
    tau            = parseFloat(document.getElementById('slider-tau')?.value)          || TAU_DEFAULT;
    N              = parseInt(document.getElementById('slider-n')?.value, 10)          || N_DEFAULT;
    K              = parseInt(document.getElementById('slider-k')?.value, 10)          || K_DEFAULT;
    gridN          = parseInt(document.getElementById('slider-grid-n')?.value, 10)     || GRID_N_DEFAULT;
    movementType   = document.getElementById('select-movement')?.value                 || 'brownian';
    detectorLayout = document.getElementById('select-detector-layout')?.value          || 'grid';
  }

  // ── Occasion loop ───────────────────────────────────────────────────────────

  function runOccasion() {
    currentK++;
    const captures = tryDetectsOnOccasion(animals, detectors, g0, sigma, detectionRng);

    // Spawn detection flashes (one per capture event, at the detector position)
    for (const c of captures) {
      const det  = detectors.find(d => d.id === c.detectorId);
      const col  = ANIMAL_COLOURS[c.animalId % ANIMAL_COLOURS.length];
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
      const { px, py }    = worldToPx(animal.x, animal.y);
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

  // Draw each animal's recent movement trail as a fading coloured line
  function drawTrails() {
    for (const animal of animals) {
      const trail = trails.get(animal.id);
      if (!trail || trail.length < 2) continue;
      const col = ANIMAL_COLOURS[animal.id % ANIMAL_COLOURS.length];
      for (let i = 1; i < trail.length; i++) {
        // t runs from 0 (oldest segment) to 1 (most recent segment)
        const t = i / trail.length;
        p.stroke(col[0], col[1], col[2], t * 180);
        p.strokeWeight(1.5);
        const { px: x1, py: y1 } = worldToPx(trail[i - 1].x, trail[i - 1].y);
        const { px: x2, py: y2 } = worldToPx(trail[i].x,     trail[i].y);
        p.line(x1, y1, x2, y2);
      }
    }
    p.noStroke();
  }

  function drawHUD() {
    p.noStroke();
    p.fill(60);
    p.textSize(12);
    p.textAlign(p.LEFT, p.TOP);
    const kLabel = currentK === 0 ? 'k = —' : `k = ${currentK} / ${targetK}`;
    p.text(kLabel, 6, 6);
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

    updateDetectors(detectors);
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
  updateParams({ sigma });
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

document.getElementById('select-movement').addEventListener('change', e => {
  movementType = e.target.value;
  updateParams({ movementType });
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

document.getElementById('btn-reset-defaults').addEventListener('click', () => {
  document.getElementById('slider-g0').value    = G0_DEFAULT;
  document.getElementById('slider-sigma').value = SIGMA_DEFAULT;
  document.getElementById('slider-n').value     = N_DEFAULT;
  document.getElementById('slider-k').value     = K_DEFAULT;
  document.getElementById('slider-grid-n').value = GRID_N_DEFAULT;
  document.getElementById('slider-tau').value   = TAU_DEFAULT;
  document.getElementById('select-movement').value         = 'brownian';
  document.getElementById('select-detector-layout').value  = 'grid';
  document.getElementById('val-g0').textContent    = G0_DEFAULT.toFixed(2);
  document.getElementById('val-sigma').textContent = SIGMA_DEFAULT.toFixed(2) + ' km';
  document.getElementById('val-n').textContent     = N_DEFAULT;
  document.getElementById('val-k').textContent     = K_DEFAULT;
  document.getElementById('val-grid-n').textContent = `${GRID_N_DEFAULT}×${GRID_N_DEFAULT}`;
  document.getElementById('val-tau').textContent   = TAU_DEFAULT.toFixed(1) + ' occ';
  g0           = G0_DEFAULT;
  sigma        = SIGMA_DEFAULT;
  tau          = TAU_DEFAULT;
  N            = N_DEFAULT;
  K            = K_DEFAULT;
  gridN        = GRID_N_DEFAULT;
  movementType = 'brownian';
  detectorLayout = 'grid';
  syncDetectorSliders();
  updateParams({ g0, sigma, movementType });
  document.getElementById('btn-reset').click();
});

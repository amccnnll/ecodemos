/**
 * ds/sketch.js — Distance Sampling p5.js sketch
 *
 * Handles all rendering for the DS simulation pane.
 * Imports the pure engine from src/ds-engine.js and calls it each frame.
 * Pushes detection events to ds/state.js for the analytics layer.
 * p5 and D3 are available as globals (loaded via CDN in index.html).
 */

import { createRng } from '../src/rng.js';
import { placeAnimals, placeAnimalsClumped, placeAnimalsRegular, tryDetect, drawLognormal } from '../src/ds-engine.js';
import { resetState, recordDetection, updateParams, state } from './state.js';

// --- Config constants ---
const ARENA_W_KM   = 4;      // transect length (km)
const W_KM         = 0.5;    // truncation distance (km)
const SIGMA_KM     = 0.25;   // detection scale parameter (km)
const DENSITY      = 50;     // animals per km²
const FLASH_FRAMES = 35;     // detection flash duration (~500ms at 60fps)

const BOAT_SPEEDS  = { slow: 0.0025, normal: 0.005, fast: 0.015 };

// Each session starts with a fresh random seed; placement is deterministic from it,
// but detection draws use a separate unseeded RNG so luck varies each replay.
let seed         = Math.floor(Math.random() * 100000);
let sigma        = SIGMA_KM;
let W            = W_KM;
let truthFn      = 'halfNormal';
let modelFn      = 'halfNormal';
let b            = 2.5;
let distribution = 'uniform';
let clumpScale   = 0.10;
let regularity   = 0.50;
let sigmaHet     = false;
let sigmaCV      = 0.30;

new p5(function (p) {

  let placementRng;   // seeded — governs animal placement only
  let detectionRng;   // unseeded — governs detection draws; changes every run
  let animals  = [];
  let flashes  = [];
  let boatX    = 0;
  let running  = false;

  // Derived in setup() / initSim() from canvas dimensions and slider values
  let PX_PER_KM;
  let transectY;
  let arenaH;
  let arenaWKm;

  p.setup = function () {
    const container = document.getElementById('sim-container');
    const cs = getComputedStyle(container);
    const hPad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const canvas = p.createCanvas(container.clientWidth - hPad, container.clientHeight);
    canvas.parent('sim-container');

    transectY = p.height / 2;  // fixed — depends only on canvas height

    initSim();
    wireControls();
  };

  p.draw = function () {
    p.background(255);
    drawWBoundaries();
    drawTransect();
    drawAnimals();
    drawFlashes();
    drawObserver();
    drawAxes();
    drawCounter();

    if (running) {
      advanceBoat();
      detectAnimals();
    }
  };

  // --- Initialise / reset (same seed = identical animal placement) ---
  function initSim() {
    // Read current slider/select values (fall back to defaults if not yet in DOM)
    arenaWKm     = parseFloat(document.getElementById('slider-transect')?.value)    || ARENA_W_KM;
    sigma        = parseFloat(document.getElementById('slider-sigma')?.value)       || SIGMA_KM;
    W            = parseFloat(document.getElementById('slider-w')?.value)           || W_KM;
    distribution = document.getElementById('select-distribution')?.value            || 'uniform';
    clumpScale   = parseFloat(document.getElementById('slider-clump-scale')?.value) || 0.10;
    regularity   = parseFloat(document.getElementById('slider-regularity')?.value)  || 0.50;
    const density = parseFloat(document.getElementById('slider-density')?.value)    || DENSITY;

    sigmaHet     = document.getElementById('checkbox-sigma-het')?.checked ?? false;
    sigmaCV      = parseFloat(document.getElementById('slider-sigma-cv')?.value) || 0.30;

    // Recalculate scale — depends on transect length
    PX_PER_KM = p.width / arenaWKm;
    arenaH    = p.height / PX_PER_KM;

    placementRng = createRng(seed);
    detectionRng = new Math.seedrandom(); // fresh unseeded RNG — different luck each run
    boatX   = 0;
    running = false;
    flashes = [];

    syncSeedInput();

    const areaN = Math.round(density * arenaWKm * arenaH);
    if (distribution === 'clustered') {
      animals = placeAnimalsClumped(areaN, arenaWKm, arenaH, placementRng, clumpScale);
    } else if (distribution === 'regular') {
      animals = placeAnimalsRegular(areaN, arenaWKm, arenaH, placementRng, regularity);
    } else {
      animals = placeAnimals(areaN, arenaWKm, arenaH, placementRng);
    }

    // Assign per-animal detection scale when heterogeneous sigma is on
    if (sigmaHet) {
      for (const animal of animals) {
        animal.sigmaI = drawLognormal(sigma, sigmaCV, placementRng);
      }
    }

    const trueD = areaN / (arenaWKm * arenaH);
    resetState({ sigma, W, transectLength: arenaWKm, trueD, sigmaHet, sigmaCV });

    syncPlayBtn();
  }

  // --- Button / input wiring ---
  function wireControls() {
    document.getElementById('btn-playpause').addEventListener('click', () => {
      if (boatX >= arenaWKm) {
        // Run complete — "Run again" restarts with same seed immediately
        initSim();
        running = true;
        syncPlayBtn();
        return;
      }
      running = !running;
      syncPlayBtn();
    });

    // Replay: reset to the current seed's population
    document.getElementById('btn-reset').addEventListener('click', () => {
      seed = parseSeedInput();
      initSim();
    });

    // New population: pick a fresh random seed, show it, and reset
    document.getElementById('btn-new-population').addEventListener('click', () => {
      seed = Math.floor(Math.random() * 100000); // intentionally unseeded
      initSim();
    });

    // Typing a seed and pressing Enter (or blurring) instantly resets to that population
    const seedInput = document.getElementById('seed-input');
    seedInput.addEventListener('change', () => {
      seed = parseSeedInput();
      initSim();
    });
    seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') seedInput.blur(); // triggers 'change'
    });

    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        state.speed = btn.dataset.speed;
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function parseSeedInput() {
    // Strip anything that isn't a digit, then parse and clamp to valid range
    const raw = (document.getElementById('seed-input').value || '').replace(/\D/g, '');
    const val = parseInt(raw, 10);
    return Number.isFinite(val) && val >= 0 ? Math.min(99999, val) : seed;
  }

  function syncSeedInput() {
    const el = document.getElementById('seed-input');
    if (el) el.value = seed;
  }

  function syncPlayBtn() {
    const btn = document.getElementById('btn-playpause');
    if (!btn) return;
    if (boatX >= arenaWKm) {
      btn.textContent = '↺ Run again';
    } else {
      btn.textContent = running ? '⏸ Pause' : '▶ Run';
    }
  }

  // --- Drawing ---
  function drawWBoundaries() {
    const wPx = W * PX_PER_KM;
    p.drawingContext.setLineDash([6, 5]);
    p.stroke(210);
    p.strokeWeight(1);
    p.line(0, transectY - wPx, p.width, transectY - wPx);
    p.line(0, transectY + wPx, p.width, transectY + wPx);
    p.drawingContext.setLineDash([]);
    p.noStroke();
    p.fill(180);
    p.textSize(10);
    p.textAlign(p.RIGHT, p.CENTER);
    const wLabel = 'W=' + W.toFixed(2);
    p.text(wLabel, p.width - 4, transectY - wPx);
    p.text(wLabel, p.width - 4, transectY + wPx);
  }

  function drawTransect() {
    p.stroke(200);
    p.strokeWeight(1);
    p.line(0, transectY, p.width, transectY);
  }

  // Colours hoisted — avoids allocating a p5 Color object per animal per frame
  let colDetected, colUndetected;

  function drawAnimals() {
    if (!colDetected) { colDetected = p.color(200, 50, 50); colUndetected = p.color(190); }
    p.noStroke();
    for (const animal of animals) {
      const px = animal.x * PX_PER_KM;
      const py = transectY + (animal.y - arenaH / 2) * PX_PER_KM;
      p.fill(animal.detected ? colDetected : colUndetected);
      p.circle(px, py, 6);
    }
  }

  function drawFlashes() {
    for (const flash of flashes) {
      const t     = flash.age / FLASH_FRAMES;
      const alpha = (1 - t) * 220;

      p.drawingContext.setLineDash([4, 5]);
      p.stroke(p.color(255, 130, 0, alpha));
      p.strokeWeight(1.5);
      p.line(flash.animalPx, transectY, flash.animalPx, flash.animalPy);
      p.drawingContext.setLineDash([]);

      const ringR = 5 + t * 12;
      p.noFill();
      p.stroke(p.color(200, 50, 50, alpha));
      p.strokeWeight(1.5);
      p.circle(flash.animalPx, flash.animalPy, ringR * 2);

      flash.age++;
    }
    flashes = flashes.filter(f => f.age <= FLASH_FRAMES);
  }

  // Eye icon — represents the observer scanning perpendicular to the transect
  function drawObserver() {
    const px = boatX * PX_PER_KM;

    p.push();
    p.translate(px, transectY);

    // Almond eye outline
    p.fill(255);
    p.stroke(55, 90, 200);
    p.strokeWeight(1.5);
    p.beginShape();
    p.vertex(-11, 0);
    p.bezierVertex(-11, -7, 11, -7, 11, 0);
    p.bezierVertex(11,   7, -11,  7, -11, 0);
    p.endShape(p.CLOSE);

    // Iris
    p.noStroke();
    p.fill(55, 90, 200);
    p.circle(0, 0, 8);

    // Pupil
    p.fill(10, 20, 60);
    p.circle(0, 0, 4);

    // Highlight
    p.fill(255, 255, 255, 210);
    p.circle(2.5, -1.5, 2.5);

    p.pop();
  }

  function drawAxes() {
    p.textSize(10);
    p.fill(170);
    const lastKm = Math.floor(arenaWKm);
    for (let km = 0; km <= arenaWKm; km++) {
      const px = km * PX_PER_KM;
      p.stroke(200);
      p.strokeWeight(1);
      p.line(px, transectY - 4, px, transectY + 4);
      p.noStroke();
      if (km === 0)       p.textAlign(p.LEFT,   p.TOP);
      else if (km === lastKm && arenaWKm % 1 === 0) p.textAlign(p.RIGHT, p.TOP);
      else                p.textAlign(p.CENTER, p.TOP);
      p.text(km + ' km', px, transectY + 7);
    }
    // If transect length is non-integer, label the end tick separately
    if (arenaWKm % 1 !== 0) {
      const endPx = arenaWKm * PX_PER_KM;
      p.stroke(200);
      p.strokeWeight(1);
      p.line(endPx, transectY - 4, endPx, transectY + 4);
      p.noStroke();
      p.textAlign(p.RIGHT, p.TOP);
      p.text(arenaWKm.toFixed(1) + ' km', endPx, transectY + 7);
    }
  }

  function drawCounter() {
    const traveled = Math.min(boatX, arenaWKm).toFixed(2);
    p.noStroke();
    p.fill(150);
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
    p.text(`${traveled} / ${arenaWKm.toFixed(1)} km`, 8, 6);
  }

  // --- Simulation step ---
  function advanceBoat() {
    const speed = BOAT_SPEEDS[state.speed] || BOAT_SPEEDS.normal;
    boatX += speed;
    if (boatX >= arenaWKm) {
      boatX   = arenaWKm;
      running = false;
      syncPlayBtn();
    }
  }

  function detectAnimals() {
    const speed = BOAT_SPEEDS[state.speed] || BOAT_SPEEDS.normal;
    for (const animal of animals) {
      const perpDist     = Math.abs(animal.y - arenaH / 2);
      const effectiveSig = sigmaHet ? (animal.sigmaI ?? sigma) : sigma;
      if (tryDetect(animal, boatX, speed, arenaH / 2, effectiveSig, W, detectionRng, truthFn, b)) {
        animal.detected = true;
        flashes.push({
          animalPx: animal.x * PX_PER_KM,
          animalPy: transectY + (animal.y - arenaH / 2) * PX_PER_KM,
          age:      0,
        });
        recordDetection(perpDist, boatX);
      }
    }
  }

  // Keyboard shortcuts (space = play/pause, r = reset)
  p.keyPressed = function () {
    if (p.key === ' ') document.getElementById('btn-playpause').click();
    if (p.key === 'r' || p.key === 'R') document.getElementById('btn-reset').click();
  };

}, document.getElementById('sim-container'));

// --- Slider / select listeners at module level ---
// ES modules execute after DOM is parsed, so all elements are available here.
// Keeping these outside the p5 closure removes any dependency on p5's async setup() timing.

function syncBSlider() {
  const show = truthFn === 'hazardRate' || modelFn === 'hazardRate';
  const row  = document.getElementById('row-b');
  const hint = document.getElementById('hint-b');
  if (row)  row.style.display  = show ? 'flex'  : 'none';
  if (hint) hint.style.display = show ? 'block' : 'none';
}

function syncMismatchWarning() {
  const el = document.getElementById('mismatch-warning');
  if (el) el.style.display = truthFn !== modelFn ? 'block' : 'none';
}

function syncDistributionSliders() {
  const clumpRow  = document.getElementById('row-clump-scale');
  const regRow    = document.getElementById('row-regularity');
  const clumpHint = document.getElementById('hint-clump');
  const regHint   = document.getElementById('hint-regularity');
  if (clumpRow)  clumpRow.style.display  = distribution === 'clustered' ? 'flex'  : 'none';
  if (regRow)    regRow.style.display    = distribution === 'regular'   ? 'flex'  : 'none';
  if (clumpHint) clumpHint.style.display = distribution === 'clustered' ? 'block' : 'none';
  if (regHint)   regHint.style.display   = distribution === 'regular'   ? 'block' : 'none';
}

// Field truth and model selectors — live update
document.getElementById('select-truth-fn').addEventListener('change', (e) => {
  truthFn = e.target.value;
  syncBSlider();
  syncMismatchWarning();
  updateParams({ truthFn });
});
document.getElementById('select-model-fn').addEventListener('change', (e) => {
  modelFn = e.target.value;
  syncBSlider();
  syncMismatchWarning();
  updateParams({ modelFn });
});

// σ and W — live update: redraw detection curve and W boundaries immediately
document.getElementById('slider-sigma').addEventListener('input', (e) => {
  sigma = parseFloat(e.target.value);
  document.getElementById('val-sigma').textContent = sigma.toFixed(2) + ' km';
  updateParams({ sigma, W });
});
document.getElementById('slider-w').addEventListener('input', (e) => {
  W = parseFloat(e.target.value);
  document.getElementById('val-w').textContent = W.toFixed(2) + ' km';
  updateParams({ sigma, W });
});

// Shape (b) — live update when hazard rate is active
document.getElementById('slider-b').addEventListener('input', (e) => {
  b = parseFloat(e.target.value);
  document.getElementById('val-b').textContent = b.toFixed(1);
  updateParams({ b });
});

// Density and transect length — readout only; values take effect on next Reset
document.getElementById('slider-density').addEventListener('input', (e) => {
  document.getElementById('val-density').textContent = parseInt(e.target.value, 10) + ' /km²';
});
document.getElementById('slider-transect').addEventListener('input', (e) => {
  document.getElementById('val-transect').textContent = parseFloat(e.target.value).toFixed(1) + ' km';
});

// Distribution type — readout + slider visibility; takes effect on Reset
document.getElementById('select-distribution').addEventListener('change', (e) => {
  distribution = e.target.value;
  syncDistributionSliders();
});
document.getElementById('slider-clump-scale').addEventListener('input', (e) => {
  clumpScale = parseFloat(e.target.value);
  document.getElementById('val-clump-scale').textContent = clumpScale.toFixed(2);
});
document.getElementById('slider-regularity').addEventListener('input', (e) => {
  regularity = parseFloat(e.target.value);
  document.getElementById('val-regularity').textContent = regularity.toFixed(2);
});

// Heterogeneous sigma toggle and CV slider — update live (analytics re-renders);
// per-animal sigmaI values only change on Reset.
function syncSigmaHetControls() {
  const row  = document.getElementById('row-sigma-cv');
  const hint = document.getElementById('hint-sigma-cv');
  if (row)  row.style.display  = sigmaHet ? 'flex'  : 'none';
  if (hint) hint.style.display = sigmaHet ? 'block' : 'none';
}
document.getElementById('checkbox-sigma-het').addEventListener('change', (e) => {
  sigmaHet = e.target.checked;
  syncSigmaHetControls();
  updateParams({ sigmaHet, sigmaCV });
});
document.getElementById('slider-sigma-cv').addEventListener('input', (e) => {
  sigmaCV = parseFloat(e.target.value);
  document.getElementById('val-sigma-cv').textContent = sigmaCV.toFixed(2);
  updateParams({ sigmaCV });
});
syncSigmaHetControls(); // initial state

// Presets — set sliders to a named scenario and reset
const DS_PRESETS = {
  // ── Cetacean scenarios ──────────────────────────────────────────────────────
  harbourPorpoise: {
    // Dedicated vessel survey (SCANS-style), N. Sea. Highly cryptic — low profile,
    // short dives, steep falloff. Density representative of N. Sea peak areas.
    // W/σ ≈ 2.1 gives g(W) ≈ 0.10 — most animals near the boundary missed.
    sigma: 0.07, W: 0.15, density: 15, transect: 8.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'clustered', clumpScale: 0.08, regularity: 0.50,
  },
  bottlenoseDolphin: {
    // Coastal boat survey (e.g., Moray Firth / Scottish west coast).
    // Good detectability, moderate density, uniform distribution of residents.
    // Clean half-normal; "textbook good conditions" for a medium cetacean.
    sigma: 0.20, W: 0.50, density: 5, transect: 6.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'uniform', clumpScale: 0.10, regularity: 0.50,
  },
  commonDolphin: {
    // Offshore vessel survey (Bay of Biscay / Celtic Sea). Schooling species —
    // detection is near-certain on the transect then drops sharply, giving a
    // pronounced shoulder best captured by the hazard-rate function.
    // Clustered distribution reflects schools rather than individuals.
    sigma: 0.28, W: 0.60, density: 5, transect: 8.0,
    b: 3.5, truthFn: 'hazardRate', modelFn: 'hazardRate',
    distribution: 'clustered', clumpScale: 0.12, regularity: 0.50,
  },
  minkeWhale: {
    // North Atlantic vessel survey. Solitary, conspicuous blow visible at
    // distance — wide detection range relative to typical whale density.
    // Low density means few detections and noisy D̂ despite good g(0).
    sigma: 0.40, W: 1.00, density: 2, transect: 8.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'uniform', clumpScale: 0.10, regularity: 0.50,
  },
  bowheadWhale: {
    // Aerial survey of an aggregation patch (e.g., Bering Sea ice lead/feeding
    // ground). Large body, easy to spot, but very sparse even in aggregations.
    // High clustering mimics the patchy ice-edge distribution.
    // Expect ~8–12 sightings — deliberately noisy D̂ to show sparse-data variance.
    sigma: 0.45, W: 1.00, density: 1, transect: 8.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'clustered', clumpScale: 0.20, regularity: 0.50,
  },
  // ── Terrestrial surveys ─────────────────────────────────────────────────────
  songbird: {
    // Woodland/scrub line transect (BTO-style). Small passerine, cryptic in
    // vegetation — detected mostly by sight at very close range. Clustered
    // distribution reflects territory/flock aggregations.
    // W/σ = 2.4; expect ~55–65 detections for typical run.
    sigma: 0.05, W: 0.12, density: 150, transect: 3.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'clustered', clumpScale: 0.10, regularity: 0.50,
  },
  shorebird: {
    // Open estuary/mudflat wader survey (curlew, oystercatcher).
    // Conspicuous, detectable at moderate distance; clusters around feeding patches.
    // W/σ = 2.5; ~35–40 detections expected.
    sigma: 0.20, W: 0.50, density: 15, transect: 5.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'clustered', clumpScale: 0.15, regularity: 0.50,
  },
  raptor: {
    // Territorial raptor survey (red kite, buzzard) — aerial or vehicle transect
    // across open landscape. Very visible, very sparse; territorial spacing
    // gives a regular spatial pattern. Deliberately few detections (~8–10)
    // to illustrate noisy D̂ under sparse data. W/σ ≈ 2.2.
    sigma: 0.45, W: 1.00, density: 1, transect: 8.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'regular', clumpScale: 0.10, regularity: 0.80,
  },
  birdNest: {
    // Ground or scrub nest survey (lapwing, curlew). Observer walks slowly;
    // nests are cryptic static objects detected only at very close approach.
    // High density, very short detection strip — most nests missed.
    // W/σ = 2.7; ~30 detections expected at density cap.
    sigma: 0.03, W: 0.08, density: 200, transect: 2.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'clustered', clumpScale: 0.08, regularity: 0.50,
  },
  snake: {
    // Road/path transect for adder or grass snake. Near-certain detection
    // within ~1–2 m of path (sharp shoulder), then rapid falloff — hazard-rate
    // with high b captures the "either right there or missed" behaviour.
    // Clustered around basking habitat. W/σ = 2.5; ~18–22 detections expected.
    sigma: 0.04, W: 0.10, density: 80, transect: 3.0,
    b: 6.0, truthFn: 'hazardRate', modelFn: 'hazardRate',
    distribution: 'clustered', clumpScale: 0.12, regularity: 0.50,
  },
  // ── Generic teaching scenarios ──────────────────────────────────────────────
  goodConditions: {
    sigma: 0.25, W: 0.40, density: 50, transect: 4.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'uniform', clumpScale: 0.10, regularity: 0.50,
  },
  poorDetectability: {
    // Very steep half-normal: most animals missed even close to the transect
    sigma: 0.08, W: 0.20, density: 100, transect: 6.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'uniform', clumpScale: 0.10, regularity: 0.50,
  },
  sparsePopulation: {
    // Low density: few detections per run, noisy D̂ convergence
    sigma: 0.30, W: 0.50, density: 10, transect: 6.0,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'uniform', clumpScale: 0.10, regularity: 0.50,
  },
  shortTransect: {
    // Short survey: high variance in D̂ despite good conditions
    sigma: 0.25, W: 0.40, density: 50, transect: 1.5,
    b: 2.5, truthFn: 'halfNormal', modelFn: 'halfNormal',
    distribution: 'uniform', clumpScale: 0.10, regularity: 0.50,
  },
};

function applyDSPreset(name) {
  const p = DS_PRESETS[name];
  if (!p) return;

  document.getElementById('slider-sigma').value        = p.sigma;
  document.getElementById('slider-w').value            = p.W;
  document.getElementById('slider-density').value      = p.density;
  document.getElementById('slider-transect').value     = p.transect;
  document.getElementById('slider-b').value            = p.b;
  document.getElementById('select-truth-fn').value     = p.truthFn;
  document.getElementById('select-model-fn').value     = p.modelFn;
  document.getElementById('select-distribution').value = p.distribution;
  document.getElementById('slider-clump-scale').value  = p.clumpScale;
  document.getElementById('slider-regularity').value   = p.regularity;

  document.getElementById('val-sigma').textContent        = p.sigma.toFixed(2) + ' km';
  document.getElementById('val-w').textContent            = p.W.toFixed(2) + ' km';
  document.getElementById('val-density').textContent      = p.density + ' /km²';
  document.getElementById('val-transect').textContent     = p.transect.toFixed(1) + ' km';
  document.getElementById('val-b').textContent            = p.b.toFixed(1);
  document.getElementById('val-clump-scale').textContent  = p.clumpScale.toFixed(2);
  document.getElementById('val-regularity').textContent   = p.regularity.toFixed(2);

  truthFn      = p.truthFn;
  modelFn      = p.modelFn;
  b            = p.b;
  distribution = p.distribution;
  clumpScale   = p.clumpScale;
  regularity   = p.regularity;

  syncBSlider();
  syncMismatchWarning();
  syncDistributionSliders();
  updateParams({ truthFn, modelFn, b });
  document.getElementById('btn-reset').click();
}

document.getElementById('select-ds-preset').addEventListener('change', (e) => {
  if (e.target.value) applyDSPreset(e.target.value);
});

// Reset all Complications controls to their default values, then trigger a full Reset
document.getElementById('btn-reset-defaults').addEventListener('click', () => {
  document.getElementById('slider-sigma').value       = SIGMA_KM;
  document.getElementById('slider-w').value           = W_KM;
  document.getElementById('slider-density').value     = DENSITY;
  document.getElementById('slider-transect').value    = ARENA_W_KM;
  document.getElementById('slider-b').value           = 2.5;
  document.getElementById('select-truth-fn').value    = 'halfNormal';
  document.getElementById('select-model-fn').value    = 'halfNormal';
  document.getElementById('select-distribution').value = 'uniform';
  document.getElementById('slider-clump-scale').value = 0.10;
  document.getElementById('slider-regularity').value  = 0.50;
  document.getElementById('val-sigma').textContent       = SIGMA_KM.toFixed(2) + ' km';
  document.getElementById('val-w').textContent           = W_KM.toFixed(2) + ' km';
  document.getElementById('val-density').textContent     = DENSITY + ' /km²';
  document.getElementById('val-transect').textContent    = ARENA_W_KM.toFixed(1) + ' km';
  document.getElementById('val-b').textContent           = '2.5';
  document.getElementById('val-clump-scale').textContent = '0.10';
  document.getElementById('val-regularity').textContent  = '0.50';
  truthFn      = 'halfNormal';
  modelFn      = 'halfNormal';
  b            = 2.5;
  distribution = 'uniform';
  clumpScale   = 0.10;
  regularity   = 0.50;
  syncBSlider();
  syncMismatchWarning();
  syncDistributionSliders();
  updateParams({ truthFn, modelFn, b });
  document.getElementById('btn-reset').click();
});

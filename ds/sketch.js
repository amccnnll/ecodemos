/**
 * ds/sketch.js — Distance Sampling p5.js sketch
 *
 * Handles all rendering for the DS simulation pane.
 * Imports the pure engine from src/ds-engine.js and calls it each frame.
 * Pushes detection events to ds/state.js for the analytics layer.
 * p5 and D3 are available as globals (loaded via CDN in index.html).
 */

import { createRng } from '../src/rng.js';
import { placeAnimals, tryDetect } from '../src/ds-engine.js';
import { resetState, recordDetection, updateParams, state } from './state.js';

// --- Config constants ---
const ARENA_W_KM   = 4;      // transect length (km)
const W_KM         = 0.4;    // truncation distance (km)
const SIGMA_KM     = 0.25;   // detection scale parameter (km)
const DENSITY      = 50;     // animals per km²
const FLASH_FRAMES = 35;     // detection flash duration (~500ms at 60fps)

const BOAT_SPEEDS  = { slow: 0.0025, normal: 0.005, fast: 0.015 };

// Each session starts with a fresh random seed; placement is deterministic from it,
// but detection draws use a separate unseeded RNG so luck varies each replay.
let seed  = Math.floor(Math.random() * 100000);
let sigma = SIGMA_KM;
let W     = W_KM;

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
    // Read current slider values (fall back to defaults if sliders not yet in DOM)
    arenaWKm = parseFloat(document.getElementById('slider-transect')?.value) || ARENA_W_KM;
    sigma    = parseFloat(document.getElementById('slider-sigma')?.value)    || SIGMA_KM;
    W        = parseFloat(document.getElementById('slider-w')?.value)        || W_KM;
    const density = parseFloat(document.getElementById('slider-density')?.value) || DENSITY;

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
    animals = placeAnimals(areaN, arenaWKm, arenaH, placementRng);

    const trueD = areaN / (arenaWKm * arenaH);
    resetState({ sigma, W, transectLength: arenaWKm, trueD });

    syncPlayBtn();
  }

  // --- Button / input wiring ---
  function wireControls() {
    document.getElementById('btn-playpause').addEventListener('click', () => {
      if (boatX >= arenaWKm) return; // transect complete — must reset first
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
    btn.textContent = running ? '⏸ Pause' : '▶ Play';
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
    p.text('W', p.width - 4, transectY - wPx);
    p.text('W', p.width - 4, transectY + wPx);
  }

  function drawTransect() {
    p.stroke(200);
    p.strokeWeight(1);
    p.line(0, transectY, p.width, transectY);
  }

  function drawAnimals() {
    for (const animal of animals) {
      const px = animal.x * PX_PER_KM;
      const py = transectY + (animal.y - arenaH / 2) * PX_PER_KM;
      p.noStroke();
      p.fill(animal.detected ? p.color(200, 50, 50) : p.color(190));
      p.circle(px, py, 6);
    }
  }

  function drawFlashes() {
    for (const flash of flashes) {
      const t     = flash.age / FLASH_FRAMES;
      const alpha = (1 - t) * 220;

      p.drawingContext.setLineDash([4, 5]);
      p.stroke(p.color(200, 50, 50, alpha));
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
    for (let km = 0; km <= arenaWKm; km++) {
      const px = km * PX_PER_KM;
      p.stroke(200);
      p.strokeWeight(1);
      p.line(px, transectY - 4, px, transectY + 4);
      p.noStroke();
      // Align end labels to avoid clipping at canvas edges
      if (km === 0)           p.textAlign(p.LEFT,   p.TOP);
      else if (km === arenaWKm) p.textAlign(p.RIGHT, p.TOP);
      else                    p.textAlign(p.CENTER, p.TOP);
      p.text(km + ' km', px, transectY + 7);
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
      const perpDist = Math.abs(animal.y - arenaH / 2);
      if (tryDetect(animal, boatX, speed, arenaH / 2, sigma, W, detectionRng)) {
        animal.detected = true;
        flashes.push({
          animalPx: animal.x * PX_PER_KM,
          animalPy: transectY + (animal.y - arenaH / 2) * PX_PER_KM,
          age:      0,
        });
        recordDetection(perpDist);
      }
    }
  }

  // Keyboard shortcuts (space = play/pause, r = reset)
  p.keyPressed = function () {
    if (p.key === ' ') document.getElementById('btn-playpause').click();
    if (p.key === 'r' || p.key === 'R') document.getElementById('btn-reset').click();
  };

}, document.getElementById('sim-container'));

// --- Slider listeners at module level ---
// ES modules execute after DOM is parsed, so all elements are available here.
// Keeping these outside the p5 closure removes any dependency on p5's async setup() timing.

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

// Density and transect length — readout only; values take effect on next Reset
document.getElementById('slider-density').addEventListener('input', (e) => {
  document.getElementById('val-density').textContent = parseInt(e.target.value, 10) + ' /km²';
});
document.getElementById('slider-transect').addEventListener('input', (e) => {
  document.getElementById('val-transect').textContent = parseFloat(e.target.value).toFixed(1) + ' km';
});

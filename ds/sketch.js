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
import { resetState, recordDetection } from './state.js';

// --- Config constants ---
const ARENA_W_KM   = 4;      // transect length (km)
const W_KM         = 0.4;    // truncation distance (km)
const SIGMA_KM     = 0.25;   // detection scale parameter (km)
const DENSITY      = 50;     // animals per km²
const BOAT_SPEED   = 0.005;  // km per frame
const FLASH_FRAMES = 35;     // detection flash duration (~500ms at 60fps)
const DEFAULT_SEED = 42;

// TODO: wire these up to controls pane inputs
let seed  = DEFAULT_SEED;
let sigma = SIGMA_KM;
let W     = W_KM;

new p5(function (p) {

  let rng;
  let animals  = [];
  let flashes  = [];
  let boatX    = 0;
  let running  = false;

  // Derived in setup() from canvas dimensions
  let PX_PER_KM;
  let transectY;
  let arenaH;   // km — computed so the arena exactly fills the canvas

  p.setup = function () {
    const container = document.getElementById('sim-container');
    const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
    canvas.parent('sim-container');

    PX_PER_KM = p.width / ARENA_W_KM;
    transectY  = p.height / 2;
    arenaH     = p.height / PX_PER_KM;

    initSim();
  };

  p.draw = function () {
    p.background(255);
    drawTransect();
    drawAnimals();
    drawFlashes();
    drawBoat();

    if (running) {
      advanceBoat();
      detectAnimals();
    }
  };

  // --- Initialise / reset ---
  function initSim() {
    rng     = createRng(seed);
    boatX   = 0;
    running = false;
    flashes = [];

    const areaN = Math.round(DENSITY * ARENA_W_KM * arenaH);
    animals = placeAnimals(areaN, ARENA_W_KM, arenaH, rng);

    const trueD = areaN / (ARENA_W_KM * arenaH);
    resetState({ sigma, W, transectLength: ARENA_W_KM, trueD });
  }

  // --- Drawing ---
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

      // Dotted red line from boat position at detection to animal
      p.drawingContext.setLineDash([4, 5]);
      p.stroke(p.color(200, 50, 50, alpha));
      p.strokeWeight(1.5);
      p.line(flash.boatPx, transectY, flash.animalPx, flash.animalPy);
      p.drawingContext.setLineDash([]);

      // Expanding ring at the animal
      const ringR = 5 + t * 12;
      p.noFill();
      p.stroke(p.color(200, 50, 50, alpha));
      p.strokeWeight(1.5);
      p.circle(flash.animalPx, flash.animalPy, ringR * 2);

      flash.age++;
    }
    flashes = flashes.filter(f => f.age <= FLASH_FRAMES);
  }

  function drawBoat() {
    const px = boatX * PX_PER_KM;
    p.fill(50, 100, 200);
    p.noStroke();
    p.rect(px - 8, transectY - 8, 16, 16, 3);
  }

  // --- Simulation step ---
  function advanceBoat() {
    boatX += BOAT_SPEED;
    if (boatX > ARENA_W_KM) running = false;
  }

  function detectAnimals() {
    for (const animal of animals) {
      const perpDist = Math.abs(animal.y - arenaH / 2);
      if (tryDetect(animal, boatX, BOAT_SPEED, arenaH / 2, sigma, W, rng)) {
        animal.detected = true;

        flashes.push({
          animalPx: animal.x * PX_PER_KM,
          animalPy: transectY + (animal.y - arenaH / 2) * PX_PER_KM,
          boatPx:   boatX * PX_PER_KM,
          age:      0,
        });

        recordDetection(perpDist);
      }
    }
  }

  // --- Keyboard shortcuts (space = play/pause, r = reset) ---
  p.keyPressed = function () {
    if (p.key === ' ') running = !running;
    if (p.key === 'r') initSim();
  };

}, document.getElementById('sim-container'));

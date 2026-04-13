/**
 * ds/sketch.js — Distance Sampling p5.js sketch
 *
 * Handles all rendering for the DS simulation pane.
 * Imports the pure engine from src/ds-engine.js and calls it each frame.
 * p5 and D3 are available as globals (loaded via CDN in index.html).
 */

import { createRng } from '../src/rng.js';
import { placeAnimals, tryDetect } from '../src/ds-engine.js';

// --- Config constants ---
const ARENA_W_KM   = 4;      // transect length (km)
const ARENA_H_KM   = 1;      // arena height — 0.5 km either side of transect
const W_KM         = 0.4;    // truncation distance (km)
const SIGMA_KM     = 0.15;   // detection scale parameter (km)
const DENSITY      = 50;     // animals per km²
const BOAT_SPEED   = 0.01;   // km per frame (adjust for animation feel)
const DEFAULT_SEED = 42;

// TODO: wire these up to controls pane inputs
let seed  = DEFAULT_SEED;
let sigma = SIGMA_KM;
let W     = W_KM;

new p5(function (p) {

  let rng;
  let animals = [];
  let boatX   = 0;
  let running = false;

  // Pixel dimensions — set in setup() based on canvas size
  let PX_PER_KM;
  let transectY;

  p.setup = function () {
    const canvas = p.createCanvas(
      document.getElementById('sim-container').clientWidth,
      document.getElementById('sim-container').clientHeight
    );
    canvas.parent('sim-container');

    PX_PER_KM = p.width / ARENA_W_KM;
    transectY  = p.height / 2;

    initSim();
  };

  p.draw = function () {
    p.background(255);
    drawTransect();
    drawAnimals();
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

    const areaN = Math.round(DENSITY * ARENA_W_KM * ARENA_H_KM);
    animals = placeAnimals(areaN, ARENA_W_KM, ARENA_H_KM, rng);
  }

  // --- Drawing ---
  function drawTransect() {
    p.stroke(180);
    p.strokeWeight(1);
    p.line(0, transectY, p.width, transectY);
  }

  function drawAnimals() {
    for (const animal of animals) {
      const px = animal.x * PX_PER_KM;
      const py = transectY + (animal.y - ARENA_H_KM / 2) * PX_PER_KM;

      p.noStroke();
      p.fill(animal.detected ? p.color(200, 50, 50) : p.color(180));
      p.circle(px, py, 6);
    }
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
    if (boatX > ARENA_W_KM) {
      running = false; // transect complete — pause for analytics
    }
  }

  function detectAnimals() {
    for (const animal of animals) {
      if (tryDetect(animal, boatX, BOAT_SPEED, ARENA_H_KM / 2, sigma, W, rng)) {
        animal.detected = true;
        // TODO: record detection distance, trigger analytics update
      }
    }
  }

  // --- Keyboard shortcut for quick testing (space = play/pause) ---
  p.keyPressed = function () {
    if (p.key === ' ') running = !running;
    if (p.key === 'r') initSim();
  };

}, document.getElementById('sim-container'));

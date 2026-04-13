/**
 * secr/sketch.js — SECR p5.js sketch
 *
 * Placeholder — will be built out in v2.
 * p5 and D3 are available as globals (loaded via CDN in index.html).
 */

import { createRng } from '../src/rng.js';

new p5(function (p) {

  p.setup = function () {
    const canvas = p.createCanvas(
      document.getElementById('sim-container').clientWidth,
      document.getElementById('sim-container').clientHeight
    );
    canvas.parent('sim-container');
  };

  p.draw = function () {
    p.background(255);
    p.fill(150);
    p.noStroke();
    p.textSize(16);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('SECR module — coming in v2', p.width / 2, p.height / 2);
  };

}, document.getElementById('sim-container'));

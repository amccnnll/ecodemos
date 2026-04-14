/**
 * lv/state.js — shared reactive state for the LV module.
 */

import { rk4Step } from "../src/lv-engine.js";

const MAX_POINTS = 1600;

export const state = {
  alpha: 1.1,
  beta: 0.06,
  delta: 0.03,
  gamma: 0.7,
  dt: 0.03,

  prey0: 40,
  predator0: 9,

  t: 0,
  prey: 40,
  predator: 9,

  running: false,
  speed: "normal",

  series: [{ t: 0, prey: 40, predator: 9 }],
};

const listeners = new Set();

export function resetState(next = {}) {
  if (next.alpha !== undefined) state.alpha = next.alpha;
  if (next.beta !== undefined) state.beta = next.beta;
  if (next.delta !== undefined) state.delta = next.delta;
  if (next.gamma !== undefined) state.gamma = next.gamma;
  if (next.dt !== undefined) state.dt = next.dt;

  if (next.prey0 !== undefined) state.prey0 = next.prey0;
  if (next.predator0 !== undefined) state.predator0 = next.predator0;

  state.t = 0;
  state.prey = state.prey0;
  state.predator = state.predator0;
  state.series = [{ t: 0, prey: state.prey0, predator: state.predator0 }];
  notify();
}

export function updateParams(next = {}) {
  if (next.alpha !== undefined) state.alpha = next.alpha;
  if (next.beta !== undefined) state.beta = next.beta;
  if (next.delta !== undefined) state.delta = next.delta;
  if (next.gamma !== undefined) state.gamma = next.gamma;
  if (next.dt !== undefined) state.dt = next.dt;

  if (next.prey0 !== undefined) state.prey0 = next.prey0;
  if (next.predator0 !== undefined) state.predator0 = next.predator0;
  notify();
}

export function setRunning(running) {
  state.running = running;
  notify();
}

export function setSpeed(speed) {
  state.speed = speed;
  notify();
}

export function advanceSimulation(steps = 1) {
  const params = {
    alpha: state.alpha,
    beta: state.beta,
    delta: state.delta,
    gamma: state.gamma,
  };

  for (let i = 0; i < steps; i += 1) {
    const next = rk4Step(state.prey, state.predator, state.dt, params);
    state.t += state.dt;
    state.prey = next.prey;
    state.predator = next.predator;
    state.series.push({ t: state.t, prey: state.prey, predator: state.predator });

    if (state.series.length > MAX_POINTS) {
      state.series.shift();
    }
  }

  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
}

/**
 * lv/state.js — shared reactive state for the LV module.
 */

import { rk4Step } from "../src/lv-engine.js";

const MAX_POINTS = 1600;

export const state = {
  modelType: "predatorPrey",

  alpha: 1.1,
  beta: 0.06,
  delta: 0.03,
  gamma: 0.7,

  Kdyn: 120,
  mPred: 0.01,

  r1: 0.9,
  r2: 0.8,
  K1: 75,
  K2: 65,
  alpha12: 0.6,
  alpha21: 0.5,

  dt: 0.03,

  prey0: 40,
  predator0: 9,

  t: 0,
  prey: 40,
  predator: 9,

  running: false,
  speed: "normal",

  pauseInterval: 50,
  nextPauseAt: 50,
  unboundedTime: false,
  autoPausedAt: null,

  series: [{ t: 0, prey: 40, predator: 9 }],
};

const listeners = new Set();

export function resetState(next = {}) {
  if (next.modelType !== undefined) state.modelType = next.modelType;

  if (next.alpha !== undefined) state.alpha = next.alpha;
  if (next.beta !== undefined) state.beta = next.beta;
  if (next.delta !== undefined) state.delta = next.delta;
  if (next.gamma !== undefined) state.gamma = next.gamma;

  if (next.Kdyn !== undefined) state.Kdyn = next.Kdyn;
  if (next.mPred !== undefined) state.mPred = next.mPred;

  if (next.r1 !== undefined) state.r1 = next.r1;
  if (next.r2 !== undefined) state.r2 = next.r2;
  if (next.K1 !== undefined) state.K1 = next.K1;
  if (next.K2 !== undefined) state.K2 = next.K2;
  if (next.alpha12 !== undefined) state.alpha12 = next.alpha12;
  if (next.alpha21 !== undefined) state.alpha21 = next.alpha21;

  if (next.dt !== undefined) state.dt = next.dt;

  if (next.prey0 !== undefined) state.prey0 = next.prey0;
  if (next.predator0 !== undefined) state.predator0 = next.predator0;

  state.t = 0;
  state.prey = state.prey0;
  state.predator = state.predator0;
  state.nextPauseAt = state.pauseInterval;
  state.autoPausedAt = null;
  state.series = [{ t: 0, prey: state.prey0, predator: state.predator0 }];
  notify();
}

export function updateParams(next = {}) {
  if (next.modelType !== undefined) state.modelType = next.modelType;

  if (next.alpha !== undefined) state.alpha = next.alpha;
  if (next.beta !== undefined) state.beta = next.beta;
  if (next.delta !== undefined) state.delta = next.delta;
  if (next.gamma !== undefined) state.gamma = next.gamma;

  if (next.Kdyn !== undefined) state.Kdyn = next.Kdyn;
  if (next.mPred !== undefined) state.mPred = next.mPred;

  if (next.r1 !== undefined) state.r1 = next.r1;
  if (next.r2 !== undefined) state.r2 = next.r2;
  if (next.K1 !== undefined) state.K1 = next.K1;
  if (next.K2 !== undefined) state.K2 = next.K2;
  if (next.alpha12 !== undefined) state.alpha12 = next.alpha12;
  if (next.alpha21 !== undefined) state.alpha21 = next.alpha21;

  if (next.dt !== undefined) state.dt = next.dt;

  if (next.prey0 !== undefined) state.prey0 = next.prey0;
  if (next.predator0 !== undefined) state.predator0 = next.predator0;
  notify();
}

export function setRunning(running) {
  state.running = running;
  if (running) state.autoPausedAt = null;
  notify();
}

export function setSpeed(speed) {
  state.speed = speed;
  notify();
}

export function setUnboundedTime(enabled) {
  state.unboundedTime = enabled;

  if (enabled) {
    state.autoPausedAt = null;
  } else {
    const blocks = Math.floor(state.t / state.pauseInterval);
    state.nextPauseAt = (blocks + 1) * state.pauseInterval;
  }

  notify();
}

export function advanceSimulation(steps = 1) {
  const params = {
    modelType: state.modelType,
    alpha: state.alpha,
    beta: state.beta,
    delta: state.delta,
    gamma: state.gamma,
    Kdyn: state.Kdyn,
    mPred: state.mPred,
    r1: state.r1,
    r2: state.r2,
    K1: state.K1,
    K2: state.K2,
    alpha12: state.alpha12,
    alpha21: state.alpha21,
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

    if (!state.unboundedTime && state.t >= state.nextPauseAt) {
      state.running = false;
      state.autoPausedAt = state.nextPauseAt;
      state.nextPauseAt += state.pauseInterval;
      break;
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

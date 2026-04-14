/**
 * src/lv-engine.js
 * Pure Lotka-Volterra dynamics (no DOM, no p5, no D3).
 */

function derivatives(prey, predator, params) {
  if (params.modelType === "dynamicPredatorPrey") {
    const { alpha, beta, delta, gamma, Kdyn, mPred } = params;
    const kSafe = Math.max(1e-6, Kdyn);
    const mSafe = Math.max(0, mPred);

    return {
      dPrey: alpha * prey * (1 - prey / kSafe) - beta * prey * predator,
      dPred: delta * prey * predator - gamma * predator - mSafe * predator * predator,
    };
  }

  if (params.modelType === "competition") {
    const { r1, r2, K1, K2, alpha12, alpha21 } = params;
    return {
      dPrey: r1 * prey * (1 - (prey + alpha12 * predator) / Math.max(1e-6, K1)),
      dPred: r2 * predator * (1 - (predator + alpha21 * prey) / Math.max(1e-6, K2)),
    };
  }

  const { alpha, beta, delta, gamma } = params;
  return {
    dPrey: alpha * prey - beta * prey * predator,
    dPred: delta * prey * predator - gamma * predator,
  };
}

// One RK4 step for the classic Lotka-Volterra ODE system.
export function rk4Step(prey, predator, dt, params) {
  const k1 = derivatives(prey, predator, params);

  const k2 = derivatives(
    prey + 0.5 * dt * k1.dPrey,
    predator + 0.5 * dt * k1.dPred,
    params
  );

  const k3 = derivatives(
    prey + 0.5 * dt * k2.dPrey,
    predator + 0.5 * dt * k2.dPred,
    params
  );

  const k4 = derivatives(
    prey + dt * k3.dPrey,
    predator + dt * k3.dPred,
    params
  );

  const nextPrey = prey + (dt / 6) * (k1.dPrey + 2 * k2.dPrey + 2 * k3.dPrey + k4.dPrey);
  const nextPred = predator + (dt / 6) * (k1.dPred + 2 * k2.dPred + 2 * k3.dPred + k4.dPred);

  return {
    prey: Math.max(0, nextPrey),
    predator: Math.max(0, nextPred),
  };
}

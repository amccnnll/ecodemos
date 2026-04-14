# Lotka-Volterra (LV)

## What this demo shows

This module compares three two-species dynamical systems in one interface:

- classic predator-prey
- dynamic predator-prey (density dependence)
- competition

The top panel shows time series. The lower panel shows phase-plane trajectories.

## Numerical method

All modes are integrated with RK4.

State update per step:

- input: current populations, dt, model parameters
- output: next populations with non-negativity clamp

## Mode equations

### Classic predator-prey

dPrey/dt = alpha * Prey - beta * Prey * Predator

dPredator/dt = delta * Prey * Predator - gamma * Predator

### Dynamic predator-prey

dPrey/dt = alpha * Prey * (1 - Prey / K) - beta * Prey * Predator

dPredator/dt = delta * Prey * Predator - gamma * Predator - m * Predator^2

where K is prey carrying capacity and m is predator self-limitation.

### Competition

dN1/dt = r1 * N1 * (1 - (N1 + alpha12 * N2) / K1)

dN2/dt = r2 * N2 * (1 - (N2 + alpha21 * N1) / K2)

## Controls and exact meanings

### Playback and runtime

- Run/Pause/Resume.
- Reset: reset to current parameter values.
- Reset default parameters: restore default preset for active mode.
- Speed: Slow, Normal, Fast.
- Unbounded time: disables checkpoint auto-pause.

Checkpoint behaviour:

- default auto-pause every 50 time units
- button label switches to Resume at checkpoint pauses

### Shared controls

- dt slider: 0.005 to 0.080, step 0.001, default 0.030.
- Initial population 1 slider (Prey0 or N1_0): 5 to 120, default 40.
- Initial population 2 slider (Pred0 or N2_0): 1 to 60, default 9.

### Classic predator-prey controls

- alpha slider: 0.2 to 2.0, step 0.01, default 1.10.
- beta slider: 0.01 to 0.20, step 0.001, default 0.06.
- delta slider: 0.005 to 0.10, step 0.001, default 0.03.
- gamma slider: 0.1 to 2.0, step 0.01, default 0.70.
- Presets:
  - Balanced cycles
  - Predator crash
  - Prey crash
  - High-amplitude cycles

### Dynamic predator-prey controls

- uses alpha, beta, delta, gamma controls
- K (prey) slider: 20 to 250, step 1, default 120
- m (pred) slider: 0.000 to 0.200, step 0.001, default 0.010
- Dynamic presets:
  - Damped spiral
  - Slow damping / predator collapse
  - Tight cycle

### Competition controls

- r1 slider: 0.1 to 2.0, step 0.01, default 0.90.
- r2 slider: 0.1 to 2.0, step 0.01, default 0.80.
- K1 slider: 10 to 200, step 1, default 75.
- K2 slider: 10 to 200, step 1, default 65.
- alpha12 slider: 0.00 to 2.00, step 0.01, default 0.60.
- alpha21 slider: 0.00 to 2.00, step 0.01, default 0.50.
- Competition presets:
  - Coexistence
  - Species 1 wins
  - Species 2 wins

## Implementation choices

- One shared state store serves all modes.
- Model type switch in Complications drives:
  - active derivative equations in engine
  - active parameter panes
  - mode-specific presets
  - mode-specific labels and equilibrium calculations in analytics
- Time-series chart uses rolling visible-history domain in long unbounded runs, so traces remain stable on screen.

## Behaviour notes

- In classic LV, trajectories are neutral cycles in the ideal model and do not intrinsically spiral to a fixed point.
- Dynamic mode is included for non-neutral phase behaviour (damping or stronger transients).

## External references

- Lotka-Volterra equations: https://en.wikipedia.org/wiki/Lotka%E2%80%93Volterra_equations
- Logistic growth in ecology: https://en.wikipedia.org/wiki/Logistic_function#In_ecology:_modeling_population_growth

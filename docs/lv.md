---
title: "Lotka-Volterra (LV)"
---

## Glossary

### Controls — all modes

| Control | Description |
|---|---|
| Speed | Playback speed: Slow / Normal / Fast. |
| Preset | Named parameter combinations for the current mode. Applied immediately. |
| $\Delta t$ | RK4 integration time step. Smaller = more accurate but slower; larger = faster but potentially unstable. Default: 0.03. |
| Unbounded time | Disables the auto-pause checkpoints (default every 50 time units). Simulation runs until manually paused. |

### Controls — predator-prey (classic) mode

| Control | Description |
|---|---|
| $\alpha$ | Prey intrinsic growth rate — rate of increase of the prey population in the absence of predators. Default: 1.1. |
| $\beta$ | Predation rate — rate at which each predator removes prey per unit time. Default: 0.06. |
| $\delta$ | Predator conversion efficiency — prey consumed per new predator produced. Default: 0.03. |
| $\gamma$ | Predator death rate — intrinsic rate of decrease of predators in the absence of prey. Default: 0.7. |
| $N_0$ | Initial prey population. Default: 40. |
| $P_0$ | Initial predator population. Default: 9. |

### Controls — dynamic predator-prey mode (additional)

Adds logistic prey growth and predator self-limitation to the classic system.

| Control | Description |
|---|---|
| Dynamic preset | Named presets: Damped spiral, Slow damping / predator collapse, Tight cycle. |
| K (prey) | Prey carrying capacity — logistic ceiling for prey growth in the absence of predators. Default: 120. |
| m (predator) | Predator self-limitation coefficient — intraspecific competition among predators. Default: 0.01. |

### Controls — competition mode

Replaces the predator-prey parameters with two-species competition parameters.

| Control | Description |
|---|---|
| Competition preset | Named presets: Coexistence, Species 1 wins, Species 2 wins. |
| $r_1$ | Intrinsic growth rate of species 1. Default: 0.9. |
| $r_2$ | Intrinsic growth rate of species 2. Default: 0.8. |
| $K_1$ | Carrying capacity of species 1. Default: 75. |
| $K_2$ | Carrying capacity of species 2. Default: 65. |
| $\alpha_{12}$ | Effect of species 2 on species 1 — per-individual competitive impact. Default: 0.60. |
| $\alpha_{21}$ | Effect of species 1 on species 2 — per-individual competitive impact. Default: 0.50. |

### Key symbols

| Symbol | Meaning |
|---|---|
| $N$ | Prey (or species 1) population size. |
| $P$ | Predator (or species 2) population size. |
| $\alpha$ | Prey growth rate (classic / dynamic modes). |
| $\beta$ | Predation rate (classic / dynamic modes). |
| $\delta$ | Predator conversion efficiency (classic / dynamic modes). |
| $\gamma$ | Predator death rate (classic / dynamic modes). |
| $K$ | Carrying capacity. |
| $m$ | Predator self-limitation (dynamic mode). |
| $r_1, r_2$ | Species intrinsic growth rates (competition mode). |
| $K_1, K_2$ | Species carrying capacities (competition mode). |
| $\alpha_{12}, \alpha_{21}$ | Interspecific competition coefficients (competition mode). |
| $\Delta t$ | RK4 integration time step. |

---

## Overview

Three two-species dynamical systems integrated via RK4, displayed as a live time series and phase-plane trajectory. The three modes are:

- **Classic predator-prey** — the standard Lotka-Volterra system with no density dependence.
- **Dynamic predator-prey** — adds logistic prey growth and predator self-limitation.
- **Competition** — two-species Lotka-Volterra competition with carrying capacities and interaction coefficients.

The visualisation shows both how populations change over time and how they trace paths through state space (the phase plane).

---

## Numerical integration

All three modes are integrated using **RK4** (classical fourth-order Runge-Kutta). The integration is in `src/lv-engine.js`.

### RK4 step

For a state vector $(N, P)$ at time $t$ with step size $\Delta t$:

$$
k_1 = f(N, P)
$$

$$
k_2 = f\!\left(N + \tfrac{\Delta t}{2} k_{1,N},\ P + \tfrac{\Delta t}{2} k_{1,P}\right)
$$

$$
k_3 = f\!\left(N + \tfrac{\Delta t}{2} k_{2,N},\ P + \tfrac{\Delta t}{2} k_{2,P}\right)
$$

$$
k_4 = f\!\left(N + \Delta t\, k_{3,N},\ P + \Delta t\, k_{3,P}\right)
$$

$$
N_{t+\Delta t} = N + \frac{\Delta t}{6}(k_{1,N} + 2k_{2,N} + 2k_{3,N} + k_{4,N})
$$

$$
P_{t+\Delta t} = P + \frac{\Delta t}{6}(k_{1,P} + 2k_{2,P} + 2k_{3,P} + k_{4,P})
$$

After each step, both populations are clamped to zero from below:

```js
return {
  prey: Math.max(0, nextPrey),
  predator: Math.max(0, nextPred),
};
```

This prevents negative populations from numerical overshoot. In classic LV with large $\beta$ or small initial populations, trajectories can approach zero and this clamp becomes relevant.

### Time step $\Delta t$

Slider range: 0.005 to 0.080, step 0.001, default 0.030. This is the integration step size in units of model time. Decreasing $\Delta t$ improves numerical accuracy at the cost of more computation per second of real time. Changing $\Delta t$ triggers a Reset.

### Speed and steps per frame

The simulation advances by a fixed number of RK4 steps per animation frame (`requestAnimationFrame`):

| Speed  | Steps per frame |
| ------ | --------------- |
| Slow   | 1               |
| Normal | 2               |
| Fast   | 6               |

At Normal speed and default $\Delta t = 0.030$, the simulation advances by 0.060 model-time units per frame — approximately 3.6 model-time units per second at 60 fps.

---

## Mode equations

### Classic predator-prey

$$
\frac{dN}{dt} = \alpha N - \beta N P
$$

$$
\frac{dP}{dt} = \delta N P - \gamma P
$$

Parameters:

| Symbol   | Role                           | Default | Range      | Step  |
| -------- | ------------------------------ | ------- | ---------- | ----- |
| $\alpha$ | Prey intrinsic growth rate     | 1.10    | 0.2–2.0    | 0.01  |
| $\beta$  | Predation rate coefficient     | 0.06    | 0.01–0.20  | 0.001 |
| $\delta$ | Predator conversion efficiency | 0.03    | 0.005–0.10 | 0.001 |
| $\gamma$ | Predator mortality rate        | 0.70    | 0.1–2.0    | 0.01  |

The system has two equilibria. The trivial one is $(0, 0)$. The non-trivial one is:

$$
N^* = \frac{\gamma}{\delta}, \quad P^* = \frac{\alpha}{\beta}
$$

In the ideal system (no numerical error, no clamping) trajectories are closed neutral cycles around $(N^*, P^*)$. In practice, RK4 at finite $\Delta t$ introduces small orbital drift.

#### Classic presets

| Name                  | $\alpha$ | $\beta$ | $\delta$ | $\gamma$ | $N_0$ | $P_0$ | $\Delta t$ |
| --------------------- | -------- | ------- | -------- | -------- | ----- | ----- | ---------- |
| Balanced cycles       | 1.10     | 0.060   | 0.030    | 0.70     | 40    | 9     | 0.030      |
| Predator crash        | 0.30     | 0.010   | 0.003    | 1.30     | 55    | 22    | 0.020      |
| Prey crash            | 0.45     | 0.160   | 0.060    | 0.40     | 22    | 26    | 0.020      |
| High-amplitude cycles | 1.30     | 0.080   | 0.028    | 0.75     | 55    | 7     | 0.020      |

### Dynamic predator-prey

Adds logistic prey growth and predator self-limitation:

$$
\frac{dN}{dt} = \alpha N\!\left(1 - \frac{N}{K}\right) - \beta N P
$$

$$
\frac{dP}{dt} = \delta N P - \gamma P - m P^2
$$

Additional parameters:

| Symbol | Role                     | Default | Range       | Step  |
| ------ | ------------------------ | ------- | ----------- | ----- |
| $K$    | Prey carrying capacity   | 120     | 20–250      | 1     |
| $m$    | Predator self-limitation | 0.010   | 0.000–0.200 | 0.001 |

In the engine, $K$ is guarded: `kSafe = max(1e-6, Kdyn)` and `mSafe = max(0, mPred)` to prevent division by zero or negative values.

Interior equilibrium (when $m > 0$):

The analytics panel computes this numerically. For $m > 0$:

$$
N^* = \frac{\gamma + m \alpha / \beta}{\delta + m \alpha / (\beta K)}, \quad P^* = \max\!\left(0,\ \frac{\delta N^* - \gamma}{m}\right)
$$

This system can exhibit damped spirals, limit cycles, or collapse depending on parameter choice, unlike the neutral cycles of classic LV.

#### Dynamic presets

| Name                             | $\alpha$ | $\beta$ | $\delta$ | $\gamma$ | $K$ | $m$    | $N_0$ | $P_0$ | $\Delta t$ |
| -------------------------------- | -------- | ------- | -------- | -------- | --- | ------ | ----- | ----- | ---------- |
| Damped spiral                    | 1.00     | 0.035   | 0.020    | 0.80     | 150 | 0.050  | 80    | 18    | 0.030      |
| Slow damping / predator collapse | 0.60     | 0.050   | 0.010    | 1.00     | 80  | 0.0001 | 80    | 12    | 0.030      |
| Tight cycle                      | 0.90     | 0.030   | 0.020    | 0.75     | 120 | 0.020  | 50    | 14    | 0.030      |

### Competition

$$
\frac{dN_1}{dt} = r_1 N_1\!\left(1 - \frac{N_1 + \alpha_{12} N_2}{K_1}\right)
$$

$$
\frac{dN_2}{dt} = r_2 N_2\!\left(1 - \frac{N_2 + \alpha_{21} N_1}{K_2}\right)
$$

Parameters:

| Symbol        | Role                             | Default | Range     | Step |
| ------------- | -------------------------------- | ------- | --------- | ---- |
| $r_1$         | Species 1 growth rate            | 0.90    | 0.1–2.0   | 0.01 |
| $r_2$         | Species 2 growth rate            | 0.80    | 0.1–2.0   | 0.01 |
| $K_1$         | Species 1 carrying capacity      | 75      | 10–200    | 1    |
| $K_2$         | Species 2 carrying capacity      | 65      | 10–200    | 1    |
| $\alpha_{12}$ | Effect of species 2 on species 1 | 0.60    | 0.00–2.00 | 0.01 |
| $\alpha_{21}$ | Effect of species 1 on species 2 | 0.50    | 0.00–2.00 | 0.01 |

In the engine, both $K$ values are guarded: `max(1e-6, K1)` and `max(1e-6, K2)`.

Coexistence equilibrium (when $1 - \alpha_{12}\alpha_{21} \neq 0$):

$$
N_1^* = \frac{K_1 - \alpha_{12} K_2}{1 - \alpha_{12}\alpha_{21}}, \quad N_2^* = \frac{K_2 - \alpha_{21} K_1}{1 - \alpha_{12}\alpha_{21}}
$$

The analytics panel computes and displays these values live. The condition for stable coexistence is $\alpha_{12} < K_1/K_2$ and $\alpha_{21} < K_2/K_1$.

#### Competition presets

| Name           | $r_1$ | $r_2$ | $K_1$ | $K_2$ | $\alpha_{12}$ | $\alpha_{21}$ | $N_{1,0}$ | $N_{2,0}$ | $\Delta t$ |
| -------------- | ----- | ----- | ----- | ----- | ------------- | ------------- | --------- | --------- | ---------- |
| Coexistence    | 0.90  | 0.80  | 75    | 65    | 0.60          | 0.50          | 40        | 35        | 0.030      |
| Species 1 wins | 1.00  | 0.70  | 85    | 60    | 0.45          | 1.35          | 55        | 45        | 0.030      |
| Species 2 wins | 0.70  | 1.00  | 60    | 85    | 1.30          | 0.45          | 45        | 55        | 0.030      |

---

## State and time series

The state singleton (`lv/state.js`) holds current population values, the full integration parameters, and a rolling series buffer.

- `series`: array of `{ t, prey, predator }` records, capped at **1600 points** by `state.series.shift()` when the cap is exceeded. The oldest point is removed first (FIFO). At Normal speed and default $\Delta t$, 1600 points corresponds to approximately 48 model-time units of history.
- `t`: current simulation time. Cumulative across runs until a Reset.
- `running`: boolean.

---

## Checkpoint auto-pause

By default, the simulation pauses automatically every 50 model-time units. This gives users a chance to observe the state before it evolves further.

- `pauseInterval = 50` (fixed).
- `nextPauseAt` is advanced by `pauseInterval` each time a pause triggers.
- When paused by checkpoint, `autoPausedAt` is set and the play button changes to "▶ Resume".
- **Unbounded time** checkbox disables the checkpoint: `setUnboundedTime(true)` clears `autoPausedAt` and prevents the pause check.
- Toggling unbounded time off during a run advances `nextPauseAt` to the next 50-boundary above the current `t`.

The exact pause logic in `advanceSimulation`:

```js
if (!state.unboundedTime && state.t >= state.nextPauseAt) {
  state.running = false;
  state.autoPausedAt = state.nextPauseAt;
  state.nextPauseAt += state.pauseInterval;
  break;  // stop the step loop for this frame
}
```

---

## Controls

### Parameter sliders — behaviour on input vs change

All parameter sliders use a two-event pattern:

- `input` event: updates the parameter value and display label immediately (live preview of the number).
- `change` event (fires when slider drag ends): sets `running = false` and calls `resetState()`.

This means moving a slider **always resets the simulation** when you release it. There is no live-update mode for parameters in LV.

### Model type

Switching model type stops the simulation, applies the default preset for the new mode, and resets. The Complications panel shows only the section relevant to the active mode.

### Reset vs Reset Defaults

- **Reset**: resets simulation time and populations to current initial conditions (`prey0`, `predator0`) without changing any parameters.
- **Reset Defaults**: restores all parameters to the default preset for the active mode, then resets. For classic PP this is the "Balanced" preset; for dynamic PP the "Damped spiral" preset; for competition the "Coexistence" preset.

### Speed buttons

Speed change does not reset the simulation. It changes `SPEED_TO_STEPS` selection for the next animation frame.

---

## Analytics panels

`lv/analytics.js` subscribes to state and re-renders both charts on every notification (which fires after each `advanceSimulation` call, after resets, and after parameter changes).

### Time series chart

Blue line: prey (species 1 in competition mode). Red line: predators (species 2). X-axis: time window over the visible `series` buffer (scrolling). Y-axis: maximum population across both series, with 5% headroom. The chart is rebuilt from scratch each frame (no incremental D3 update).

The series scrolls naturally because old points are dropped from `series` when the cap is hit: the x-axis domain always spans `[min(t), max(t)]` of the current buffer.

### Phase-plane chart

X-axis: prey (or species 1). Y-axis: predators (or species 2). The trajectory is drawn as a single path through all points in the current `series` buffer. A filled black dot marks the current position (last point). The chart is also rebuilt from scratch each frame. Axes expand to fit the current trajectory extent with 5% headroom.

### Estimates strip

Displays current $t$, current $N$ (prey), current $P$ (predators), and analytical equilibrium values ($N^*$, $P^*$). The equilibria are recomputed on every state notification from the current parameter values using the closed-form expressions above.

---

## Assumptions and limitations

- The model is deterministic — there is no demographic stochasticity. Populations can reach fractional values.
- Non-negativity is enforced by clamping, not by the ODEs. In particular, classic LV has no built-in carrying capacity on prey; prey grows without bound if predator density is very low.
- In classic LV, the interior equilibrium is a centre (neutral stability). Integration with finite $\Delta t$ can produce slow orbital drift. Smaller $\Delta t$ reduces but does not eliminate this.
- The 1600-point series cap means long runs lose early history. The phase plane shows only the retained window.
- Parameters update live in the display but always trigger a full reset when the slider is released.

---

## External references

- Lotka-Volterra equations: https://en.wikipedia.org/wiki/Lotka%E2%80%93Volterra_equations
- Logistic growth in ecology: https://en.wikipedia.org/wiki/Logistic_function#In_ecology:_modeling_population_growth

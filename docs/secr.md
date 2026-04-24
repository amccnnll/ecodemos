---
title: "SECR"
---

[→ Open simulation](../secr/) &nbsp;·&nbsp; [GitHub repository](https://github.com/amccnnll/ecodemos)

## Overview

Animals move within a two-dimensional arena and are sampled by a fixed detector array across repeated occasions. Density is estimated from who was caught, at which detectors, and on which occasions, with no assumption of a fixed observable strip.

Detection is spatial and imperfect:

- each individual has a latent activity centre that is never directly observed;
- detectors sample probabilistically around those centres over multiple occasions;
- the estimator infers density from capture histories and detector geometry alone.

---

## Glossary

### Controls

| Control | Description |
|---|---|
| Speed | Playback speed: Slow / Normal / Fast. |
| Seed | RNG seed for animal and detector placement. Reset = same layout. 🎲 New = new population and layout. |
| Detector type | Named preset that adjusts $g_0$ and $\sigma$ to approximate a sensor type: Default, Camera trap, Live trap, Acoustic detector. |
| $g_0$ | Baseline detection probability at zero distance from an animal's activity centre (0.05–1.0). Updates live. Default: 0.20. |
| $\sigma$ | Home range / detection scale (km). Controls how steeply detection probability drops with distance from the activity centre. Updates live. Default: 0.15 km. |
| N | Number of animals in the arena. Takes effect on Reset. Default: 10. |
| K | Number of sampling occasions per run. Takes effect on Reset. Default: 10. |
| Movement | Named movement preset: Typical resident, Sedentary, Wide-ranging, or Nomad. Sets $\tau$ and $f$. |
| τ (mobility) | Home range crossing time in occasions. Low $\tau$ = restless / fast-moving; high $\tau$ = sedentary. Takes effect immediately. Default: 5 occ. |
| f (fidelity) | Site fidelity multiplier: tightens the effective home range around the activity centre. Higher = tighter. Default: 1.0×. |
| Detectors | Detector layout: Grid (regular array), Random (random placement), or Click to place (interactive). Takes effect on Reset. |
| n_grid | Grid dimension ($N \times N$). Visible when Detectors = Grid (3–7, default 4). Takes effect on Reset. |
| Show detection surface | Overlays the spatial detection probability surface $p(x,y)$ on the simulation canvas. Updates live when $g_0$, $\sigma$, or detectors change. |
| Show activity centres | Shows true activity centres (•) and estimated centres (×, mean of capturing detector positions) for each individual. |

### Estimates readout

| Symbol | Meaning |
|---|---|
| Occasion ($k$) | Current occasion index. |
| Individuals ($M$) | Number of distinct animals detected at least once so far. |
| Captures | Total capture events across all individuals and occasions. |
| ESA | Effective sampling area (km²): $\int\!\int p(x,y)\,dx\,dy$ over the arena, given current $g_0$, $\sigma$, and detector layout. |
| $\hat{D}$ | Estimated density: $M / \mathrm{ESA}$. |
| True $D$ | True density = $N / \text{arena area}$. |
| Home range ($\pi\sigma^2$) | Area of a circle with radius $\sigma$: approximate home range size (km²). |
| Recapture rate | Proportion of capture events involving a previously-detected individual. |
| Coverage ($M/N$) | Proportion of the true population detected at least once. |

### Key symbols

| Symbol | Meaning |
|---|---|
| $g_0$ | Baseline detection probability at zero distance (dimensionless, 0–1). |
| $\sigma$ | Detection / home range scale (km). |
| $\tau$ | Mobility parameter: home range crossing time (occasions). |
| $f$ | Site fidelity multiplier (dimensionless). |
| $K$ | Number of occasions. |
| $N$ | True number of animals. |
| $M$ | Number of detected individuals. |
| $\mathrm{ESA}$ | Effective sampling area (km²). |
| $\hat{D}$ | Estimated density (animals per km²). |
| $D$ | True density (animals per km²). |
| Activity centre | Latent centre of an individual's home range; never directly observed. |
| Capture history | Record of which individual was detected at which detector on which occasion. |

---

## Arena geometry

The arena is a square with side length `ARENA_KM = 2.0 km`. It is divided into two zones:

| Zone                    | Variable    | Value           |
| ----------------------- | ----------- | --------------- |
| Inner study area        | `INNER_KM`  | 1.2 km × 1.2 km |
| Buffer zone (each side) | `BUFFER_KM` | 0.4 km          |

The buffer is `≈ 2.7σ` at the default `σ = 0.15 km`. This is a standard SECR convention: animals whose activity centres lie within `~2σ` of the detector array contribute meaningfully to detections. Animals further out are effectively invisible.

The canvas is a square. `PX_PER_KM = canvasSize / ARENA_KM`. All world coordinates are in km; pixel coordinates are computed for display only using `worldToPx(wx, wy)`.

Inner study area corners: `(innerX0, innerY0) = (BUFFER_KM, BUFFER_KM) = (0.4, 0.4)`.

---

## Animal placement

`placeAnimals(N, ARENA_KM, ARENA_KM, placementRng)` in `src/secr-engine.js`.

Each of the $N$ animals is placed by drawing activity-centre coordinates uniformly:

```
cx = rng() * arenaW
cy = rng() * arenaH
```

The animal starts exactly at its activity centre: `x = cx`, `y = cy`. Velocity is initialised to zero: `vx = 0`, `vy = 0`.

Activity centres span the **full** arena (inner + buffer), not just the inner study area. This is correct: real populations extend beyond any detector array, and some of those individuals can still be detected.

The true density is `trueD = N / (ARENA_KM²) = N / 4.0` animals/km².

---

## Detector placement

`placeDetectors(layout, innerW, innerH, innerX0, innerY0, rng, gridN, nRandom)` in `src/secr-engine.js`.

All detectors are placed **within the inner study area** only.

### Grid layout

`gridN × gridN` detectors on a regular grid. Cell size `dx = innerW / gridN`, `dy = innerH / gridN`. Each detector at:

```
x = innerX0 + (col + 0.5) * dx
y = innerY0 + (row + 0.5) * dy
```

Default `gridN = 4` → 16 detectors. Range: 3–7, giving 9–49 detectors.

### Random layout

16 detectors placed by independent uniform draws within the inner study area:

```
x = innerX0 + rng() * innerW
y = innerY0 + rng() * innerH
```

Uses the seeded placement RNG.

### Custom layout

Detectors are managed directly by sketch.js. Clicking within the inner study area places a new detector; clicking an existing detector removes it. Pressing "Remove all" calls `clearDetectorsFn()` which empties the array and notifies analytics. Custom detectors are preserved through Reset (the positions are re-indexed but not regenerated).

---

## Seed and RNG architecture

Three separate RNGs are used:

| RNG                                    | Seeding                         | Purpose                                        |
| -------------------------------------- | ------------------------------- | ---------------------------------------------- |
| `placementRng = createRng(seed)`       | Seeded (Alea PRNG)              | Animal centres, grid/random detector positions |
| `movementRng = new Math.seedrandom()`  | Fresh unseeded each `initSim()` | Per-frame OUV movement steps                   |
| `detectionRng = new Math.seedrandom()` | Fresh unseeded each `initSim()` | Bernoulli detection draws each occasion        |

Same seed → same animal and detector layout. Movement paths and detection outcomes vary on every replay, even with the same seed.

Seed range: 0–99999. Each browser session starts with a random seed. Entering and committing a seed value in the input field immediately calls `initSim()`.

---

## Movement model (OUV)

Each frame during a run, every animal takes one `stepAnimal()` call from `src/secr-engine.js`. The model is Ornstein-Uhlenbeck in velocity space (OUV), also called an Ornstein-Uhlenbeck process in position via second-order Langevin dynamics.

### Frame-level update

```
u1 = max(rng(), 1e-10),   u2 = rng()
r  = sqrt(-2 * log(u1)),  θ = 2π * u2
nx = r * cos(θ) * noiseScale          // Box-Muller N(0, noiseScale²)
ny = r * sin(θ) * noiseScale

vx_new = vx * (1 - drag) + springStr * (cx - x) + nx
vy_new = vy * (1 - drag) + springStr * (cy - y) + ny
x_new  = x + vx_new
y_new  = y + vy_new
```

where `drag = 0.08` is a fixed constant.

### Wall reflection

If an animal would exit the arena, its position is reflected and the outward velocity component is negated:

```
if x < 0:       x = -x,           vx = -vx
if x > arenaW:  x = 2*arenaW - x, vx = -vx
(same for y)
```

### Parameter derivation

`springStr` and `noiseScale` are computed each frame from the slider values:

```js
const fpk = FRAMES_PER_OCC[speed]; // frames per occasion
const drag = 0.08;
const springStr = drag / (tau * fpk);
const noiseScale = sigma * drag * sqrt(2 / (fidelity * tau * fpk));
```

The derivation comes from the overdamped continuous-time Langevin equation:

- Position autocorrelation time $\tau_x = \mathrm{drag} / K_s$, so $K_s = \mathrm{drag}/(\tau \cdot \mathrm{fpk})$.
- Equilibrium variance: $\mathrm{Var}(x) = \mathrm{noiseScale}^2 / (2 K_s \cdot \mathrm{drag}) = \sigma^2 / \mathrm{fidelity}$.

This gives:

- $\tau$ (occasions): controls position autocorrelation time (how long the animal takes to cross its home range).
- fidelity: controls noise amplitude and range tightness. Higher fidelity = smaller effective home range radius = $\sigma / \sqrt{\mathrm{fidelity}}$.

### Speed and frames per occasion

| Label  | Frames per occasion |
| ------ | ------------------- |
| Slow   | 120                 |
| Normal | 60                  |
| Fast   | 15                  |

At 60 fps and Normal speed, each occasion takes 1 second of real time.

### Display smoothing

The physics simulation runs at `true` positions `(x, y)`. A separate display position `(dx, dy)` is lerped toward the true position each frame:

```
dx_new = dx + 0.15 * (x - dx)
dy_new = dy + 0.15 * (y - dy)
```

The `DISPLAY_LERP = 0.15` factor creates smooth animation without affecting the detection computation. Detection uses `(cx, cy)`, not `(dx, dy)`.

---

## Movement presets

Presets set $\tau$ and fidelity simultaneously.

| Preset       | $\tau$ (occasions) | Fidelity | Effect                                                   |
| ------------ | ------------------ | -------- | -------------------------------------------------------- |
| Resident     | 5.0                | 1.0      | Default. Moderate range size, moderate return.           |
| Sedentary    | 6.0                | 3.0      | Tighter home range (radius ÷ √3). Slower crossing time.  |
| Wide-ranging | 2.0                | 0.4      | Larger effective range (radius × √2.5). Faster crossing. |
| Nomad        | 1.0                | 0.2      | Very fast, large range; barely constrained to a centre.  |

---

## Detection function

One occasion = one call to `tryDetectsOnOccasion(animals, detectors, g0, sigmaEff, rng)`.

For every (animal $i$, detector $j$) pair:

1. Distance from the animal's **activity centre** to the detector:
   ```
   d_ij = hypot(animal.cx - detector.x, animal.cy - detector.y)
   ```
2. Detection probability:
   ```
   g_ij = g0 * halfNormal(d_ij, sigmaEff)
        = g0 * exp(-d_ij² / (2 * sigmaEff²))
   ```
3. Bernoulli draw: `detected = detectionRng() < g_ij`.
4. If detected: record `{ animalId, detectorId }`.

Each animal can be detected by **multiple detectors on the same occasion**. Each (animal, detector, occasion) triple produces one capture event. The capture history therefore records the detector index too, not just presence/absence.

Detection is based on `(cx, cy)` (the latent activity centre), not on the display position `(dx, dy)` or the physics position `(x, y)`. This is consistent with the SECR model: the detection function $g(d)$ is a marginalised home-range detection function, integrating over all locations within the home range that a centre at $(c_x, c_y)$ implies.

### Effective detection σ

```
sigmaEff = sigma / sqrt(fidelity)
```

Higher fidelity compresses the home range. `sigmaEff` is passed to `tryDetectsOnOccasion` and to all ESA computations. The UI slider reads `sigma`; the underlying detection range is automatically adjusted.

### Detector type presets

These set `g0` and `sigma` simultaneously.

| Preset      | $g_0$ | $\sigma$ (km) | Interpretation                              |
| ----------- | ----- | ------------- | ------------------------------------------- |
| Default     | 0.20  | 0.15          | Balanced starting point                     |
| Camera trap | 0.25  | 0.08          | High detection within narrow field          |
| Live trap   | 0.40  | 0.05          | Very localised, high if animal passes       |
| Acoustic    | 0.12  | 0.40          | Wide detection radius, moderate probability |

---

## Effective sample area (ESA)

### Single-occasion $p_1(x, y)$

The probability that an animal with activity centre at $(c_x, c_y)$ is detected by at least one detector on a single occasion:

$$
p_1(c_x, c_y) = 1 - \prod_{j=1}^{J} \bigl(1 - g_0 \cdot g(d_j)\bigr)
$$

where $d_j = \|(c_x, c_y) - \text{det}_j\|$ and $g(d) = \exp(-d^2 / 2\sigma_{\rm eff}^2)$.

This is computed as a log-sum for numerical stability:

```js
logNonDetect += log(1 - g0 * halfNormal(d, sigma) + 1e-15);
p1 = 1 - exp(logNonDetect);
```

### $K$-occasion ESA

The probability of being caught **at least once** across $k$ independent occasions:

$$
p_k(c_x, c_y) = 1 - (1 - p_1(c_x, c_y))^k
$$

ESA is then the numerical integral over the full arena:

$$
\mathrm{ESA}(k) = \sum_{\rm cells} \bigl[1 - (1 - p_1)^k\bigr] \cdot \Delta A
$$

The arena is discretised into **60 × 60 = 3600 cells** for ESA computation (both in the analytics D̂ historical series and in the estimates strip). `cellArea = arenaW * arenaH / (60 * 60)`.

For the D̂ convergence chart, the detection surface (`p_1` for each cell) is computed once and reused for all $k = 1, 2, \ldots, k_{\rm current}$, by applying the $k$-exponent formula cell-by-cell. This avoids recomputing the surface $k$ times.

The estimates strip uses `computeESA_K` from `src/secr-engine.js`, which is equivalent: a grid reduction over the surface.

---

## Density estimator

$$
\hat{D}(k) = \frac{M(k)}{\mathrm{ESA}(k)}
$$

where:

- $M(k)$ = number of **unique** animal IDs in captures with occasion $\leq k$.
- $\mathrm{ESA}(k)$ = $K$-occasion ESA using `sigmaEff` and the current detector layout.

$\hat{D}$ is plotted at each completed occasion as a convergence trace. True density is `N / ARENA_KM²`.

This is an educational estimator only: it uses the true $g_0$ and $\sigma$ parameters and does not fit a likelihood model to the capture histories. A full SECR MLE would estimate $g_0$, $\sigma$, and $D$ from the data.

---

## Analytics panels

Four panels rendered by `secr/analytics.js` using D3. They subscribe to the shared state and re-render on every notification (detector change, parameter change, or occasion completion). Position updates do not trigger re-renders.

### 1. Detection surface heatmap

Shows the single-occasion detection probability $p_1(c_x, c_y)$ over the full arena as a 50 × 50 colour grid using the YlOrRd D3 colour scale. A cell is transparent if $p < 0.001$.

The heatmap redraws whenever `g0`, `sigma`/`sigmaEff`, or the detector layout changes. It is skipped entirely when the "Show detection surface" overlay is not visible; this avoids expensive grid computation on every occasion tick.

The inner study area boundary is overlaid as a dashed blue rectangle. Detector positions are overlaid as small blue dots.

### 2. Capture history matrix

One row per captured animal (in order of first capture), one column per completed occasion. Cells show a coloured background and the detector IDs (comma-separated) for all detectors that caught the animal on that occasion. Empty occasions show a grey cell.

Row labels are coloured boxes A–J matching the per-animal colours used in the simulation display.

### 3. D̂ convergence chart

Green line: $\hat{D}(k)$ for $k = 1, \ldots, k_{\rm current}$. Red dashed horizontal line: true $D$. X-axis: occasion index. Y-axis has expand-only tracking as in the DS module.

### 4. Running estimates strip

| Field          | Value                                            |
| -------------- | ------------------------------------------------ |
| $k$            | Current / target occasions                       |
| $M$            | Unique individuals caught                        |
| Total captures | Count of all (animal, detector, occasion) events |
| ESA            | $k$-occasion ESA (km²) at current $k$            |
| $\hat{D}$      | $M / \mathrm{ESA}(k)$                            |
| True $D$       | $N / \mathrm{ARENA\_KM}^2$                       |

Additional derived quantities shown below the table:

- Estimated home-range area: $\pi \sigma_{\rm eff}^2$ (km²).
- Mean recapture rate: total captures / ($M \times k$), computed only when $M > 0$ and $k > 0$.

---

## Phase states

The simulation has four phases, tracked in `phase`:

| State      | Label       | Transition                                |
| ---------- | ----------- | ----------------------------------------- |
| `idle`     | ▶ Run       | After `initSim()`, before first Run press |
| `running`  | ⏸ Pause     | While occasions are ticking               |
| `paused`   | ▶ Resume    | After Pause press                         |
| `complete` | ↺ Run again | After `currentK >= targetK`               |

"Run again" (pressed when complete) adds another `K` occasions to `targetK` and continues on the same population; it does **not** reset the animals or detectors.

---

## Control taxonomy

### Live update (no reset required)

| Control                         | Effect                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| $g_0$ slider                    | Updates detection probability and surface immediately      |
| $\sigma$ slider                 | Updates `sigmaEff`, detection surface, and ESA immediately |
| Fidelity $f$ slider             | Updates `sigmaEff` (via `sigma / √f`) and surface          |
| Detector type preset            | Sets $g_0$ and $\sigma$; same as moving those two sliders  |
| Show detection surface checkbox | Toggles heatmap visibility; triggers redraw                |
| Show activity centres checkbox  | Toggles centroid overlay                                   |

### Reset required

| Control                  | Effect                                        |
| ------------------------ | --------------------------------------------- |
| $N$ slider               | Number of animals (placement regenerated)     |
| $K$ slider               | Occasions per run                             |
| $\tau$ slider            | Movement timescale (affects movement physics) |
| Distribution layout      | Grid / random / custom                        |
| Grid size $n_{\rm grid}$ | Only applicable in grid mode                  |
| Seed                     | Entirely new placement                        |

Add/remove detectors in custom mode is the one exception: detector changes take effect immediately without a full reset, because `updateDetectors()` notifies the analytics and the surface redraws.

---

## Assumptions and limitations

- The density estimator uses known true $g_0$ and $\sigma$. A real SECR analysis would estimate these from the capture histories.
- $g(d)$ is half-normal only. No other detection function is implemented.
- The movement model is the same for all individuals; there is no individual variation in $\tau$ or fidelity.
- The arena has reflecting boundaries. In reality, populations extend beyond any study area.
- Multiple detections of the same individual by the same detector on different occasions are tracked independently. The capture history records every (animal, detector, occasion) event, not just first capture.
- Habitat is uniform; `habitatFn = () => 1` throughout.

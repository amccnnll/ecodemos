# Distance Sampling (DS)

## What this demo shows

This simulation demonstrates line-transect distance sampling. The observer travels along a transect. Animals further from the transect are less likely to be detected. The observed perpendicular distances are then used to estimate detectability and density.

The key teaching point is the separation between:

- truth known to the simulator (all animal positions)
- data seen by the method (detected distances only)

## Core equations

Half-normal detection function:

$$
g(x) = \exp\!\left(-\frac{x^2}{2\sigma^2}\right)
$$

where:

- $x$ is perpendicular distance from transect (km)
- $\sigma$ controls the falloff rate

Effective strip width:

$$
\mathrm{ESW} = \int_0^W g(x)\,dx
$$

Density estimator used in the analytics strip:

$$
\hat{D} = \frac{n}{2L\,\mathrm{ESW}}
$$

where:

- $n$ is number of detections used in analysis
- $L$ is effort (km) at each detection event
- $W$ is truncation distance (km)

## Controls and exact meanings

### Playback

- Run/Pause: starts or pauses traversal.
- Reset: restarts from the same seeded population.
- Speed: Slow, Normal, Fast.

### Seed and stochasticity

- Seed: integer seed used for population placement.
- New: draws a new random seed and resets.

Implementation detail:

- Placement uses a seeded RNG.
- Detection draws use a separate unseeded RNG.
- Result: same seed gives the same population, but repeated resets can still give different detection outcomes.

### Detection and survey design

- $\sigma$ slider: 0.05 to 0.50 km, step 0.01, default 0.25.
- $W$ slider: 0.10 to 0.60 km, step 0.01, default 0.40.
- $D$ (density) slider: 10 to 200 animals/km², step 5, default 50.
- $L$ (transect length) slider: 1.0 to 8.0 km, step 0.5, default 4.0.

### Model options

- Field truth function:
  - Half-normal
  - Hazard-rate
- Model function (fitted/analysed function):
  - Half-normal
  - Hazard-rate
- Shape $b$ (hazard-rate only): 1.0 to 10.0, step 0.1, default 2.5.

### Distribution options

- Distribution:
  - Uniform
  - Clustered
  - Regular
- $s_{\mathrm{clump}}$ (clustered only): 0.02 to 0.30, step 0.01, default 0.10.
- $\rho$ (regularity, regular only): 0.00 to 1.00, step 0.05, default 0.50.

### Run overlays

- Keep previous runs: overlays old fitted curves and convergence traces.
- Clear runs: removes retained overlays.

## Engine implementation notes

- One-shot detection timing:
  detection is attempted once per animal when observer x first crosses animal x.
  This avoids multiple Bernoulli attempts per animal per pass.
- MLE fitting:
  $\hat{\sigma}$ is fitted by numerical optimisation (golden-section search) when enough detections are available.
- Convergence metric:
  running $\hat{D}$ uses effort at detection time, not final transect length.
- W post-hoc filtering:
  when $W$ changes, analytics are rebuilt using only $d \le W$.

## Assumptions and scope

- Classic DS assumption $g(0)=1$ holds in half-normal mode.
- Animals are static in this version.
- Some controls update live ($\sigma$, $W$, model choices), while placement-related controls apply on reset.

## External references

- Distance Sampling project: https://distancesampling.org
- About and resources: https://distancesampling.org/about.html

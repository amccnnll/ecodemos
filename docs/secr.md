# Spatially Explicit Capture-Recapture (SECR)

## What this demo shows

This simulation demonstrates SECR using repeated detector occasions. The method infers density from capture histories and detector geometry, rather than assuming a fixed surveyed strip as in DS.

The key teaching point is that detection is spatial and imperfect:

- each individual has a latent activity centre
- detectors sample around those centres over multiple occasions
- density is estimated from who was detected, where, and when

## Core equations

Detection model used in the demo:

p(d) = g0 * exp(-(d^2) / (2 * sigma_eff^2))

where:

- d is distance from activity centre to detector
- g0 is baseline detection at d = 0
- sigma_eff is effective spatial scale used in detection and ESA

Effective sigma mapping:

sigma_eff = sigma / sqrt(fidelity)

K-occasion effective sampling area:

ESA_K = integral over arena of [1 - (1 - p1(x, y))^K] dA

Estimator shown in the panel:

D_hat = M / ESA_K

where M is number of unique detected individuals.

## Controls and exact meanings

### Playback and seed

- Run/Pause, Reset, Speed.
- Seed and New for reproducible initial states.

### Detection and population

- g0 slider: 0.05 to 1.00, step 0.01, default 0.40.
- sigma slider: 0.05 to 0.50 km, step 0.01, default 0.20.
- N slider: 1 to 50 individuals, step 1, default 10.
- Occasions (K) slider: 5 to 100, step 1, default 10.

### Movement

- Movement preset selector (resident, sedentary, wide-ranging, nomad).
- Mobility tau slider: 0.5 to 20.0 occasions, step 0.5, default 5.0.
- Fidelity slider: 0.2 to 4.0, step 0.1, default 1.0.

### Detector design

- Detector type preset selector.
- Detector layout selector: grid, random, custom click-to-place.
- Grid size slider: 3 to 7 per axis, default 4x4.
- Remove all detectors button for custom mode.

### Visual toggles

- Show detection surface.
- Show activity centres.

## Engine implementation details

### Activity-centre detection

Detection is computed from each animal's activity centre (cx, cy), not instantaneous display position (x, y).

Implementation consequence:

- movement animation can be smooth and realistic
- detection probability remains consistent with the SECR centre-based formulation

For each occasion and detector j:

1. compute distance d_ij from activity centre i to detector j
2. compute p_ij = g0 * exp(-(d_ij^2)/(2 * sigma_eff^2))
3. draw Bernoulli detection using RNG
4. record capture event {animalId, detectorId, k} if detected

### Movement model (OUV)

Movement uses Ornstein-Uhlenbeck dynamics in velocity space, with two user-facing controls:

- tau sets movement timescale
- fidelity scales home-range tightness

Internal calibration ensures:

- tau controls position autocorrelation timescale
- sigma_eff is consistent across detection surface and ESA calculations

### ESA and D_hat

The demo uses K-occasion ESA (not single-occasion ESA), so D_hat reflects cumulative detection opportunity across occasions.

### Analytics robustness

- deferred initial render avoids startup race conditions
- chart creation guards against zero-size containers
- state notifications separate visual updates from computational updates

## Assumptions and scope

- D_hat shown is an educational running estimator, not a full maximum-likelihood SECR fit.
- g0 and sigma update live for visual/analytic response.
- most structural controls apply on reset.

## External references

- Distance Sampling publications: https://distancesampling.org/publications.html
- Borchers and Efford (2008): https://doi.org/10.1111/j.0006-341X.2008.01044.x

# Spatially Explicit Capture-Recapture (SECR)

## What this demo shows

This simulation demonstrates SECR using repeated detector occasions. The method infers density from capture histories and detector geometry, rather than assuming a fixed surveyed strip as in DS.

The key teaching point is that detection is spatial and imperfect:

- each individual has a latent activity centre
- detectors sample around those centres over multiple occasions
- density is estimated from who was detected, where, and when

## Core equations

Detection model used in the demo:

$$
p(d) = g_0\exp\!\left(-\frac{d^2}{2\sigma_{\mathrm{eff}}^2}\right)
$$

where:

- $d$ is distance from activity centre to detector
- $g_0$ is baseline detection at $d=0$
- $\sigma_{\mathrm{eff}}$ is effective spatial scale used in detection and ESA

Effective sigma mapping:

$$
\sigma_{\mathrm{eff}} = \frac{\sigma}{\sqrt{\text{fidelity}}}
$$

K-occasion effective sampling area:

$$
\mathrm{ESA}_K = \iint_{\mathrm{arena}} \left[1 - \left(1-p_1(x,y)\right)^K\right] dA
$$

Estimator shown in the panel:

$$
\hat{D} = \frac{M}{\mathrm{ESA}_K}
$$

where $M$ is number of unique detected individuals.

## Controls and exact meanings

### Playback and seed

- Run/Pause, Reset, Speed.
- Seed and New for reproducible initial states.

### Detection and population

- $g_0$ slider: 0.05 to 1.00, step 0.01, default 0.40.
- $\sigma$ slider: 0.05 to 0.50 km, step 0.01, default 0.20.
- $N$ slider: 1 to 50 individuals, step 1, default 10.
- Occasions ($K$) slider: 5 to 100, step 1, default 10.

### Movement

- Movement preset selector (resident, sedentary, wide-ranging, nomad).
- $\tau$ (mobility) slider: 0.5 to 20.0 occasions, step 0.5, default 5.0.
- $f$ (fidelity) slider: 0.2 to 4.0, step 0.1, default 1.0.

### Detector design

- Detector type preset selector.
- Detector layout selector: grid, random, custom click-to-place.
- $n_{\mathrm{grid}}$ (grid size) slider: 3 to 7 per axis, default 4x4.
- Remove all detectors button for custom mode.

### Visual toggles

- Show detection surface.
- Show activity centres.

## Engine implementation details

### Activity-centre detection

Detection is computed from each animal's activity centre $(c_x, c_y)$, not instantaneous display position $(x, y)$.

Implementation consequence:

- movement animation can be smooth and realistic
- detection probability remains consistent with the SECR centre-based formulation

For each occasion and detector j:

1. compute distance $d_{ij}$ from activity centre $i$ to detector $j$
2. compute $p_{ij} = g_0\exp\!\left(-d_{ij}^2/(2\sigma_{\mathrm{eff}}^2)\right)$
3. draw Bernoulli detection using RNG
4. record capture event {animalId, detectorId, k} if detected

### Movement model (OUV)

Movement uses Ornstein-Uhlenbeck dynamics in velocity space, with two user-facing controls:

- $\tau$ sets movement timescale
- $f$ scales home-range tightness

Internal calibration ensures:

- $\tau$ controls position autocorrelation timescale
- $\sigma_{\mathrm{eff}}$ is consistent across detection surface and ESA calculations

### ESA and $\hat{D}$

The demo uses $K$-occasion ESA (not single-occasion ESA), so $\hat{D}$ reflects cumulative detection opportunity across occasions.

### Analytics robustness

- deferred initial render avoids startup race conditions
- chart creation guards against zero-size containers
- state notifications separate visual updates from computational updates

## Assumptions and scope

- $\hat{D}$ shown is an educational running estimator, not a full maximum-likelihood SECR fit.
- $g_0$ and $\sigma$ update live for visual/analytic response.
- most structural controls apply on reset.

## External references

- Distance Sampling references and citations: https://distancesampling.org/resources/citations.html
- Borchers and Efford (2008), Crossref record (DOI: 10.1111/j.1541-0420.2007.00927.x): https://api.crossref.org/works/10.1111/j.1541-0420.2007.00927.x

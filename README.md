# ecodemos

Interactive, animated simulations of ecological models, built with vanilla JavaScript and hosted on GitHub Pages.

Live site: https://amccnnll.github.io/ecodemos/

Documentation: https://amccnnll.github.io/ecodemos/docs/

## Simulations

**Distance Sampling (DS)**
Line-transect distance sampling. An observer traverses a transect and detects animals with probability that declines with perpendicular distance. Detected distances are used to fit a detection function (half-normal or hazard-rate) via MLE and estimate animal density.

**SECR**
Spatially explicit capture-recapture. Animals move via an Ornstein-Uhlenbeck velocity model and are sampled by a fixed detector array across repeated occasions. Density is estimated from spatial capture histories using the effective sampling area (ESA).

**Lotka-Volterra (LV)**
Two-species dynamical systems integrated via RK4: classic predator-prey, dynamic predator-prey (Rosenzweig-MacArthur model with logistic prey growth), and two-species Lotka-Volterra competition.

## Structure

```
ecodemos/
├── index.html              ← landing page
├── style.css               ← shared styling
├── assets/                 ← icons and animal SVGs
├── docs/                   ← simulation documentation
├── ds/                     ← Distance Sampling
├── secr/                   ← Spatially Explicit Capture-Recapture
├── lv/                     ← Lotka-Volterra
└── src/                    ← shared engines and utilities
```

## Running locally

ES modules require a local server; opening `index.html` directly does not work.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

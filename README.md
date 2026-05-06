# ecodemos

Interactive animated browser-based simulations of ecological models.

Live site: https://amccnnll.github.io/ecodemos/

Documentation: https://amccnnll.github.io/ecodemos/docs/

## Simulations

**Distance Sampling (DS)**
Line-transect distance sampling. An observer traverses a transect and detects animals with probability that declines with perpendicular distance. Detected distances are used to fit a detection function (half-normal or hazard-rate) via MLE and estimate animal density.

**SECR**
Spatially explicit capture-recapture. Animals move via an Ornstein-Uhlenbeck velocity model and are sampled by a fixed detector array across repeated occasions. Density is estimated from spatial capture histories using the effective sampling area (ESA).

**Lotka-Volterra (LV)**
Two-species dynamical systems integrated via RK4: classic predator-prey, dynamic predator-prey (Rosenzweig-MacArthur model with logistic prey growth), and two-species Lotka-Volterra competition.

**Bipartite Network Ecology (BNE)**
A dolphin population inhabits a simulated bay, each individual preferring particular habitat types. Tendril survey routes accumulate photo-ID sightings; an effort-corrected bipartite network (dolphins × hex cells) is projected to a dolphin-similarity graph and partitioned by Louvain community detection to test whether latent habitat guilds can be recovered from sighting records alone.

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
├── bne/                    ← Bipartite Network Ecology
└── src/                    ← shared engines and utilities
```

## Running locally

Simulations in browser at https://amccnnll.github.io/ecodemos/ to run offline it requires a local server; opening `index.html` directly does not work.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tech notes

The simulations are primarily built with [p5.js](https://p5js.org) and [d3.js](https://d3js.org) and the website is built with [Quarto](https://quarto.org) and hosted on [GitHub Pages](https://docs.github.com/en/pages).

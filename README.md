# ecodemos

Interactive, animated simulations of ecological models.

> Work in progress — pls check back soon.

---

## Structure

```
ecodemos/
├── index.html              ← landing page
├── style.css               ← shared styles (navbar, module layout)
├── ds/
│   ├── index.html          ← Distance Sampling module
│   └── sketch.js           ← p5.js simulation sketch
├── secr/
│   ├── index.html          ← SECR module (v2, coming soon)
│   └── sketch.js           ← p5.js simulation sketch
├── src/
│   ├── rng.js              ← seedable RNG wrapper (shared)
│   ├── stats.js            ← statistical utilities (shared)
│   ├── spatial.js          ← spatial utilities (shared)
│   ├── ds-engine.js        ← Distance Sampling engine (pure JS, no UI)
│   └── secr-engine.js      ← SECR engine (pure JS, no UI)
└── assets/icons/           ← SVG icons
```

Simulation logic lives in `src/` as pure JS engines with no UI dependencies. The p5.js sketches in each module folder call the engine each frame and render the result. Analytics panels are handled by D3.

## Running locally

ES modules require a local server — opening `index.html` directly doesn't work.

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ds/
```

# ecodemos

Interactive, animated simulations of ecological models.

> Work in progress — pls check back soon.

---

## Structure

```
ecodemos/
├── index.html              ← landing page
├── style.css               ← shared styles (navbar, module layout)
├── docs/                   ← module documentation
│   ├── index.md
│   ├── ds.md
│   ├── secr.md
│   ├── lv.md
│   └── glossary.md
├── planning/               ← active planning and handoff docs
│   ├── ecodemos.md         ← living project spec
│   ├── todo.md             ← active execution backlog
│   ├── history.md          ← session notes and legacy context
│   ├── future-features.md  ← long-horizon ideas
│   └── ecology-demo-spec.md← original baseline spec (historical)
├── ds/
│   ├── index.html          ← Distance Sampling module
│   ├── sketch.js           ← simulation + controls wiring
│   ├── analytics.js        ← D3 analytics layer
│   └── state.js            ← reactive shared module state
├── secr/
│   ├── index.html          ← SECR module
│   ├── sketch.js           ← simulation + controls wiring
│   ├── analytics.js        ← D3 analytics layer
│   └── state.js            ← reactive shared module state
├── lv/
│   ├── index.html          ← Lotka-Volterra module
│   ├── sketch.js           ← simulation + controls wiring
│   ├── analytics.js        ← D3 analytics layer
│   └── state.js            ← reactive shared module state
├── src/
│   ├── rng.js              ← seedable RNG wrapper (shared)
│   ├── stats.js            ← statistical utilities (shared)
│   ├── spatial.js          ← spatial utilities (shared)
│   ├── ds-engine.js        ← Distance Sampling engine (pure JS, no UI)
│   ├── secr-engine.js      ← SECR engine (pure JS, no UI)
│   └── lv-engine.js        ← LV engine (pure JS, no UI)
└── assets/                 ← icons and animal SVGs
```

Simulation logic lives in `src/` as pure JS engines with no UI dependencies. The p5.js sketches in each module folder call the engine each frame and render the result. Analytics panels are handled by D3.

## Running locally

ES modules require a local server — opening `index.html` directly doesn't work.

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ds/
```

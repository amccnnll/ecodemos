# ecodemos

Interactive, animated simulations of ecological models.

View the demos here: https://amccnnll.github.io/ecodemos/

---

## Structure

```
ecodemos/
├── index.html              ← landing page
├── style.css               ← shared styling
├── assets/                 ← icons and animal SVGs
├── docs/                   ← module documentation and glossary
├── ds/                     ← Distance Sampling demo
├── secr/                   ← Spatially Explicit Capture-Recapture demo
├── lv/                     ← Lotka-Volterra demo
└── src/                    ← shared engines and utilities
```

## Running locally

ES modules require a local server, opening `index.html` directly doesn't work.

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ds/
```

# Ecology Methods Interactive Demo — Architecture Spec

## Project overview

A single-page web application providing interactive, animated demonstrations of quantitative ecology methods, primarily for teaching. Initial scope: distance sampling (DS). Planned expansion: spatially explicit capture–recapture (SECR) and beyond. Primary goal: build statistical intuition for the methods. Secondary: plausible field-planning utility.

**Hosting**: GitHub Pages (static, no server)
**Priority platform**: Desktop browser; iPad acceptable, mobile not required
**Audience**: Ecology students and practising ecologists

---

## Core pedagogical principle

Every simulation has two layers:

- **Known to the simulation, hidden from the method**: true animal locations, true home range centres, true movement paths, true detection probability for every animal–detector pair
- **Known to the method**: only what gets detected — observed distances (DS) or the capture history (SECR)

The teaching moment is watching the method reconstruct hidden truth from incomplete observations. The "show truth" toggle makes this explicit by revealing what the method is trying to estimate. This principle governs all design decisions.

**Stochasticity**: every simulation is stochastic but reproducible. A visible seed input in the controls pane means the same seed always produces the same run. Different seeds give different results. This is itself a teaching point.

---

## Key methodological contrast (surface on landing page)

DS and SECR share a half-normal detection function but differ in a foundational assumption:

| | DS | SECR |
|---|---|---|
| Detection function | g(x) = exp(−x²/2σ²) | g(d) = g₀ · exp(−d²/2σ²) |
| At distance zero | Always 1 (core assumption) | g₀ ≤ 1 (estimated parameter) |
| User sets | σ only | g₀ and σ |
| Distance measured from | Transect line | Detector location |
| Units | km | m |

In DS, certainty of detection on the centreline is a founding assumption — the function is anchored at 1. In SECR, animals roam freely in 2D space and may never pass directly over a detector, so peak detectability g₀ must be estimated rather than assumed. This contrast is the conceptual bridge between the two modules and should be noted briefly on the landing page and as a tooltip on the σ slider in each module.

---

## Application structure

### Pages

1. **Landing page** — description, methodological contrast, external links, launch buttons
2. **Distance Sampling module** (v1)
3. **SECR module** (v2)
4. *(Future modules add new pages without touching existing ones)*

### Navigation

Persistent nav bar at top: logo/title, links to available modules, link back to landing page. Consistent across all pages.

### Visual design language

All modules share identical design conventions: same layout structure, same control components, same animation style (flat illustration icons, no gradients), same colour logic. A user familiar with one module should feel immediately at home in any other.

---

## Landing page

- Brief plain-English description of distance sampling and SECR — what they are, what ecological problem they solve
- The DS/SECR methodological contrast table above, in plain language
- Links to external resources and key papers for each method (e.g. distance-sampling.org, Borchers & Efford 2008)
- Launch buttons for available modules; future modules appear as buttons when released
- No inline tutorials — the demos themselves are the teaching tool

---

## Module layout (all modules)

```
┌─────────────────────────────────────────┐
│  Nav bar                                │
├───────────────────┬─────────────────────┤
│                   │                     │
│  Simulation pane  │  Input / controls   │
│                   │  pane               │
│                   │                     │
├───────────────────┴─────────────────────┤
│  Analytics pane (full width, scrollable)│
└─────────────────────────────────────────┘
```

The simulation and input panes sit side by side above the analytics pane. The analytics pane is full width and scrollable — users scroll down to see all graphs. On first load, defaults are set and the simulation is ready to run immediately with no configuration required.

---

## Shared control conventions

### Playback controls (top of input pane)
- **Play** — starts or resumes simulation
- **Pause** — freezes animation; analytics retain last state
- **Step forward** — advances one meaningful unit (one detection event or a small fixed time increment)
- **Reset** — stops animation, rewinds to beginning, keeps current parameters and animal placement
- **Speed** — simple three-way toggle: Slow / Normal / Fast

### Seed controls
- Numeric input showing current seed
- **Randomise** button — generates new seed, new animal placement, resets simulation
- Same seed always produces identical run

### Presets
- 3–4 named scenario buttons in the input pane
- Selecting a preset loads a full parameter set and resets the simulation
- User can modify any parameter after loading a preset
- All parameter changes take effect at setup only — no mid-simulation changes

---

## Module: Distance Sampling (v1)

### Concept being taught
A boat travels a transect. Animals exist across the landscape but are detected with probability that decreases with perpendicular distance from the transect. A core assumption is that detection at distance zero is certain: g(0) = 1. From the distribution of detected distances, we estimate σ (the detection falloff scale) and recover an unbiased density estimate D̂.

### Detection function (DS)

```
g(x) = exp(−x² / 2σ²)
```

- x = perpendicular distance from transect (km)
- g(0) = 1 always — assumption of the method, not a fitted parameter
- Animals beyond truncation distance W are excluded from both detection and analysis
- The user sets σ; the method estimates σ̂ from observed distances; the teaching moment is watching σ̂ converge on σ

### Simulation pane

**Arena**: landscape orientation, approximately 8:1 aspect ratio (e.g. 4 km long × 1 km wide, 500 m either side of transect). Exact dimensions are config constants, not architecturally significant.

**Layers**:
- Faint grey dots: all true animal locations, always visible. The user sees the full population; the method sees only detections.
- Transect line: runs horizontally through the centre of the arena
- Boat icon: flat illustration SVG, travels left to right along the transect; dotted trail extends behind it as it moves
- Detection animation: when an animal is detected, a brief red dotted line extends from the boat to the animal; the animal glows and turns red, remaining red for the rest of the run; the line fades after ~500ms
- Animals at perpendicular distance zero are detected with probability 1

**After transect completion**: simulation pauses. User inspects analytics, then may hit Play to run again. Each run appends detections to the accumulated dataset — the fitted curve converges over multiple runs. A single sufficiently long run at reasonable density can produce a well-developed curve without requiring reruns.

### DS input pane

**Playback controls** (top)
Play / Pause / Step / Reset / Speed

**Survey design**
| Parameter | Input type | Default |
|---|---|---|
| Transect length (km) | Slider | 4 |
| Max detection distance W (km) | Slider | 0.4 |

**Population**
| Parameter | Input type | Default |
|---|---|---|
| Animal density (animals/km²) | Slider | 50 |

**Detection**
| Parameter | Input type | Default |
|---|---|---|
| Detection function | Dropdown | Half-normal |
| σ — scale parameter (km) | Slider | 0.15 |

*Tooltip on σ: "Controls how quickly detection probability falls off with distance. g(0) = 1 always in distance sampling — detection on the transect line is assumed certain."*

**Display toggles**
| Toggle | Default |
|---|---|
| Show truth (detection probability halos) | Off |
| Show ESW | Off |
| Show true D reference line | Off |

**Presets**
- "Good survey conditions"
- "Poor detectability (small σ)"
- "Sparse population"
- "Short transect" *(illustrates unstable estimate)*

**Seed**
Numeric input + Randomise button

### DS analytics pane

Updates on each new detection event.

**1. Detection function panel**
- Theoretical g(x) curve for current σ — updates live as slider moves, even before simulation runs
- Perpendicular distance histogram builds as detections accumulate
- Fitted curve overlaid once n ≥ ~10 detections; theoretical and fitted curves visibly converge as data grows
- ESW shaded region under curve (shown when toggled)
- X-axis: perpendicular distance (0 to W); Y-axis: detection probability (0 to 1)

**2. Running estimates strip**
- n detected, effort (km), ESW (km), D̂, 95% CI
- Updates on each new detection
- CI narrows visibly as n grows — key teaching moment

**3. D̂ convergence chart**
- D̂ (y-axis) vs cumulative detections (x-axis)
- Shows estimate stabilising as data accumulates
- True D shown as horizontal reference line when toggled

### DS core detection logic

```js
function tryDetect(animal, boat, sigma, W) {
  const d = Math.abs(animal.y - transect.y);       // perpendicular distance
  if (d > W) return;                                // beyond truncation
  const atBeam = Math.abs(boat.x - animal.x) <= boat.speed;
  if (!atBeam) return;
  const p = Math.exp(-(d * d) / (2 * sigma * sigma)); // g(0) = 1 by construction
  if (Math.random() < p) recordDetection(animal, d);
}
```

### DS fitting
Client-side MLE. Truncated half-normal log-likelihood maximised over σ using golden-section search (~50 lines JS). Runs in <10ms at teaching-scale sample sizes.

---

## Module: SECR (v2)

### Concept being taught
Animals have home ranges centred on hidden activity centres. A detector array samples the landscape. By recording *where* an individual is detected across multiple detectors over time, we estimate both home range size and population density — solving the unknown-area problem of classic mark–recapture. Unlike DS, detection probability at distance zero is not assumed to be 1; it is a parameter g₀ that must be estimated.

### Detection function (SECR)

```
g(d) = g₀ · exp(−d² / 2σ²)
```

- d = distance from animal to detector (m), evaluated continuously as animal moves
- g₀ = baseline detection probability at distance zero (≤ 1, estimated)
- σ = spatial scale of home range / detection falloff (m)
- Detection is stochastic — proximity is necessary but not sufficient

*Tooltip on g₀: "Unlike distance sampling, SECR does not assume certain detection at distance zero. g₀ is the probability of detection even when an animal is directly on top of a detector."*

### Simulation pane

**Arena**: square, default 1 × 1 km with configurable buffer zone around the detector array. Buffer boundary shown as dashed line when toggled.

**Animals**: one or multiple (user-selectable: 1 / 3 / 5). Each animal:
- Has 2–4 hidden attraction points, generated from seed; not shown unless "show truth" is toggled
- Moves continuously via Lévy walk biased toward its attraction points
- Represented by a flat illustration snow leopard icon, roving smoothly
- Multiple animals move independently with independent attraction points

**Detectors**:
- *Grid mode*: regular n × n grid at configurable spacing; default on load
- *Custom mode*: click-to-place on arena canvas; click existing detector to remove; switching back to grid resets layout. Custom layout exportable as CSV.
- Detectors visible as small icons; flash briefly on a capture event

**Capture animation**: detector flashes and a brief line connects the detected animal to the detector. Animal icon updates to show it has been captured at least once.

**Simulation end**: user hits Stop, or a configurable time limit is reached.

### SECR input pane

**Playback controls** (top)
Play / Pause / Step / Stop / Speed

**Population**
| Parameter | Input type | Default |
|---|---|---|
| Number of animals | Radio (1 / 3 / 5) | 3 |

**Detector array**
| Parameter | Input type | Default |
|---|---|---|
| Detector layout | Toggle (grid / custom) | Grid |
| Grid size (n × n) | Slider | 5 × 5 |
| Detector spacing (m) | Slider | 100 |
| Detector type | Dropdown (proximity / count) | Proximity |

**Detection**
| Parameter | Input type | Default |
|---|---|---|
| g₀ — baseline detection probability | Slider | 0.5 |
| σ — detection scale (m) | Slider | 80 |

**State space**
| Parameter | Input type | Default |
|---|---|---|
| Buffer width | Slider (multiples of σ) | 2σ |

**Animal movement**
| Parameter | Input type | Default |
|---|---|---|
| Attraction points | Toggle (hidden / user-placed) | Hidden |

**Display toggles**
| Toggle | Default |
|---|---|
| Show truth (attraction points + true activity centres) | Off |
| Show home ranges | Off |
| Show buffer boundary | Off |
| Show recapture trails | Off |

**Presets**
- "Good detector array"
- "Wide-ranging animal (large σ)"
- "Low baseline detectability"
- "Sparse detector grid" *(illustrates information loss)*

**Seed**
Numeric input + Randomise button

### SECR analytics pane

Updates only on capture events — not on a fixed timer. Zero captures = no update regardless of elapsed time.

**1. Detection probability surface**
- Heatmap over the arena showing P(detection) as a function of distance from nearest detector, given current g₀ and σ
- Updates live as g₀/σ sliders move, even before simulation runs
- Primary teaching graphic for SECR; most prominent panel

**2. Capture history matrix**
- Rows = detected individuals (colour-coded); columns = capture events in chronological order
- Fills in as detections accumulate; scrollable if large

**3. Running N̂ and D̂**
- Updates on each new capture event
- v2: theoretical estimate, clearly labelled
- v3: replaced by WebR calling `secr::secr.fit()`

**4. Home range estimate**
- Estimated activity centre (centroid of capture locations) vs true activity centre (shown only if "show truth" on)
- More detections → tighter estimate; convergence is visible

### SECR core detection logic

```js
function tryDetect(animal, detector, g0, sigma, rng) {
  const d = distance(animal.pos, detector.pos);
  const p = g0 * Math.exp(-(d * d) / (2 * sigma * sigma));
  if (rng() < p) recordCapture(animal, detector);
}
```

Evaluated continuously each animation frame for every animal–detector pair.

### SECR movement
Lévy walk with attraction bias: each time step the animal either takes a Lévy-distributed step in a random direction, or moves toward one of its attraction points. The balance between exploration and attraction is a fixed internal parameter, not user-exposed.

---

## v3 scope

- **SECR MLE** via WebR in a Web Worker (`secr::secr.fit()`); keeps UI thread unblocked; GitHub Pages compatible
- **DS hazard-rate detection function** as dropdown option
- **Failure mode presets**: curated named scenarios demonstrating assumption violations (short transect, clustered population, buffer too small, detector spacing too wide)
- **Live diagnostics layer**: amber/red callouts in analytics pane flagging problematic conditions (n < 20, buffer < 2σ, spacing > 3σ, histogram inconsistent with fitted function)
- **Non-uniform animal distribution for DS**: Thomas cluster process; named options: uniform / clustered near transect / clustered away from transect

---

## v4 scope — future demo ideas

Candidate methods for additional modules, roughly in order of pedagogical value and implementation feasibility:

**High priority**
- **Occupancy modelling** (MacKenzie–Nichols): sites surveyed repeatedly; species detected or not; estimate true occupancy correcting for imperfect detection. Sim: grid of sites, surveyor visits each, detection events animate. Natural companion to DS and SECR — same detection-function logic, different question.
- **N-mixture models**: repeated counts at sites; estimate abundance without marking individuals. Sim: observer visits sites, counts visible animals. Good for teaching the distinction between abundance and detectability.
- **Classic mark–recapture** (Lincoln–Petersen, Cormack–Jolly–Seber): foundational methods that SECR improves upon; teaching CJS first makes SECR more meaningful. Sim: animals move, traps capture, tags applied, recaptures recorded.

**Medium priority**
- **Line transect vs point transect comparison**: run both methods on the same simulated population side by side; show when each is appropriate and how estimates compare.
- **Removal sampling**: effort applied until catch rate drops; estimate N from the decline curve. Simple sim, clean analytics.
- **Double-observer / dependent observer models**: two observers on the same transect; estimate detection probability from disagreements. Teaches mark–recapture logic in a DS context.

**Longer term**
- **Acoustic monitoring / autonomous recording units**: detectors record calls; detection probability a function of source level, propagation, and ambient noise. Natural extension of SECR with a different sensor type.
- **Camera trap density estimation** (random encounter model, REST model): no individual ID required; uses time-in-frame and movement speed. Increasingly common in practice.
- **Species distribution modelling**: presence/absence or presence-only data; habitat covariates; MaxEnt or GLM-based. Broader scope but high student interest.
- **Bayesian inference module**: cross-cutting; apply a Bayesian framework to DS or occupancy; show prior → posterior updating live as data accumulate. Conceptually powerful teaching tool.

---

## Computation architecture

### Principle: separate engine from UI

Each module has a pure JS engine with no UI dependencies:

```
ds-engine.js    — animal placement, detection sampling, MLE fitting
secr-engine.js  — animal placement, Lévy movement, detection sampling
stats.js        — shared: erf, normal distribution, MLE utilities
rng.js          — seedable RNG (e.g. seedrandom), shared across modules
spatial.js      — shared: distance calculations, point-in-polygon
```

Engines are pure functions: given parameters and a seed, they return state. The UI layer calls the engine each frame and renders the result. Engines are independently testable and reusable across modules.

---

## Tech stack — TBD

To be decided at the start of the first coding session. Constraints:

- Must run fully client-side (GitHub Pages, no server)
- Needs smooth SVG or canvas animation (boat movement, animal roaming, detection events)
- Needs live-updating statistical graphics (detection curve, heatmap, histogram)
- v3+ needs Web Worker support for WebR (SECR MLE)
- Should be approachable for a developer with moderate JS experience assisted by Claude Code

**Option A: React + D3**
- React manages UI state and controls; D3 handles all graphics and animation
- Most flexible for complex animation requirements
- Largest ecosystem; most Claude Code familiarity
- More boilerplate than alternatives

**Option B: Observable Framework**
- Tight reactive coupling between sliders and plots out of the box
- Less flexible for custom animation (boat movement, roaming animals)
- Markdown-based authoring is fast for analytics panels
- Less suited to the simulation pane requirements

**Option C: Vanilla JS + D3**
- No framework overhead; closest to the existing p5.js codebase
- Full control; no build complexity for v1
- Scales less cleanly as modules multiply
- Easiest entry point if starting from the existing sketch.js logic

**Option D: p5.js + D3 hybrid**
- p5.js handles the simulation canvas (familiar from existing code); D3 handles analytics panels
- Lowest friction for the animation layer given prior experience
- Two rendering paradigms in one app; some awkwardness at the boundary
- Worth considering seriously given existing p5.js codebase as reference

**Recommendation to evaluate at coding start**: Option A (React + D3) for long-term scalability, or Option D (p5.js + D3) for fastest v1 given prior familiarity. Claude Code should weigh in based on the full spec before any scaffolding is generated.

---

## Build and deployment

- Static build → `dist/`
- GitHub Actions deploys on push to `main`
- Hash-based routing (`/#/ds`, `/#/secr`) — avoids 404s on GitHub Pages
- No environment variables, no secrets, no server

---

## Scope summary

| Version | Contents |
|---|---|
| v1 | Landing page + DS module (full simulation, JS MLE, analytics) |
| v2 | SECR module (movement simulation, detection surface, theoretical N̂) |
| v3 | SECR MLE via WebR, DS hazard-rate, failure mode presets, live diagnostics |
| v4 | Additional modules: occupancy → N-mixture → classic mark–recapture and beyond |

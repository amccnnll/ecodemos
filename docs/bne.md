---
title: "Bipartite Network Ecology (BNE)"
---

[→ Open simulation](../bne/)

## Overview

This simulation generates a population of dolphins that each have a preferred habitat type within a shared bay domain, surveys them statistically over multiple years, then runs a community-detection pipeline to see whether the underlying habitat guilds can be recovered from sighting records alone.

The core idea comes from studies of resident bottlenose dolphins: individuals that repeatedly co-occur in the same habitat patches tend to form detectable groups in a bipartite network (dolphins on one side, spatial cells on the other), even when home ranges broadly overlap. Guild signal comes from *which patch types* each dolphin uses, not from geographic separation.

The pipeline runs in three stages:

1. **Generate**: create a bay domain with three independent environmental fields, assign dolphins to guilds with habitat preference profiles, and simulate Poisson sightings under spatially biased survey effort.
2. **Data**: inspect the raw survey products (effort, sightings, effort-corrected B\* index) on the hex map, and the B\* and Jaccard similarity matrices.
3. **Analyse**: view the kNN graph fed to Louvain community detection, then the detected communities overlaid on the map and network, and compare to the true guild structure.

---

## Generative model

### Domain

The domain is a hex grid shaped as a simple bay: a concave coastline with open sea and a land mask. Hex size controls spatial resolution while keeping the arena footprint constant (MAUP demonstration). Three independent environmental fields are assigned to each sea hex:

| Field | Symbol | Description |
|---|---|---|
| Depth proxy | $D_h$ | Increases with distance from coast, perturbed by Perlin noise |
| Productivity | $P_h$ | Pure Perlin noise field, independent of coastline |
| Disturbance | $R_h$ | Independent Perlin noise field (shipping, recreation) |

A composite habitat quality index is computed for display only:

$$Q_h = 0.4\,D_h + 0.4\,P_h - 0.25\,R_h + 0.2$$

### Guild preference profiles

Each of the $G$ guilds has a weight vector $\mathbf{w}_g = (w_{g,D},\, w_{g,P},\, w_{g,R})$ over the three environmental axes, drawn from a fixed set of ecologically motivated archetypes (offshore, productive nearshore, disturbance-tolerant, coastal forager, etc.) and mixed toward the centroid $[0.5, 0.5, 0.5]$ by the **Overlap** parameter.

The raw preference score for guild $g$ in hex $h$ is:

$$\text{raw}_{g,h} = w_{g,D}\,D_h + w_{g,P}\,P_h - w_{g,R}\,R_h$$

This is normalised to $[0,1]$ across all sea hexes to give the guild score $s_{g,h}$.

### Dolphin population

Each dolphin is assigned a guild uniformly at random, then drawn independently of guild membership: home-range centres are placed uniformly across the domain so that guild signal comes entirely from habitat preference rather than spatial clustering.

Dolphins are classified as **specialists** (fraction controlled by the **Specialist** slider) or **generalists**. The distinction is in habitat fidelity, not home-range size: both types share the same home-range scale ($\sigma = 0.4 \times \text{domain diagonal}$), but specialists have a higher guild affinity coefficient ($c_i = 10$) while generalists have a weaker one ($c_i = 5$).

The latent use intensity for dolphin $i$ in hex $h$ is:

$$\log \lambda_{i,h} = \alpha + a_i + c_i\,s_{g_i,h} - \frac{d_{i,h}^2}{2\sigma^2}$$

where $\alpha = -4$ is the log-scale baseline, $a_i \sim \mathcal{N}(0,\,0.25^2)$ is an individual activity level, $c_i$ is the guild affinity coefficient, and $d_{i,h}$ is the Euclidean distance from dolphin $i$'s home-range centre to hex $h$.

Specialists with $c_i = 10$ experience $e^{10} \approx 22{,}000\times$ contrast between their best and worst hexes; generalists with $c_i = 5$ experience $e^5 \approx 150\times$. This produces clearly different core50 distributions without requiring different home-range sizes.

### Survey effort

Effort is generated as $K = 8$ survey routes radiating outward from a single port hex (the nearshore sea hex nearest the domain's x-centroid, fixed by the landscape seed). Each route is a directed hex walk in an evenly-spaced bearing with 20% lateral jitter per step. The **Effort bias** slider controls route length: low bias sends routes across the full domain; high bias keeps them nearshore.

For each hex $h$ and year $t$:

$$E_{h,t} \sim \Gamma\!\left(2,\, r_h\right) + \varepsilon_h$$

where $r_h$ is the number of routes visiting hex $h$ (zero for hexes not on any route, which receive only a small background $\varepsilon$). The port hex, visited by all routes, always has the highest effort.

### Observations

Observed sightings for dolphin $i$ in hex $h$ during year $t$:

$$Y_{i,h,t} \sim \text{Poisson}\!\left(E_{h,t}\cdot p\cdot\lambda_{i,h}\right)$$

where $p$ is the per-visit detection probability (**Detection p** slider). Dolphins with fewer than 4 total sightings across all hexes and years are dropped from the analysis.

---

## Analysis pipeline

### B\* effort correction

The effort-corrected sighting index aggregates over years and applies an effort floor:

$$B^*_{i,h} = \frac{\displaystyle\sum_t Y_{i,h,t}}{\max\!\left(\displaystyle\sum_t E_{h,t},\; E_{\min}\right)}$$

The floor $E_{\min}$ (**E_min** slider) prevents inflation in rarely-visited hexes where a single sighting would otherwise dominate.

### Weighted Jaccard similarity

Before computing similarity, each dolphin's B\* row is normalised to a probability distribution:

$$\tilde{a}_{i,h} = \frac{B^*_{i,h}}{\displaystyle\sum_h B^*_{i,h}}$$

This removes activity-level differences so that two dolphins with the same habitat preference but different total sighting counts appear equally similar.

Pairwise weighted Jaccard similarity:

$$J_{ij} = \frac{\displaystyle\sum_h \min(\tilde{a}_{ih},\, \tilde{a}_{jh})}{\displaystyle\sum_h \max(\tilde{a}_{ih},\, \tilde{a}_{jh})}$$

### kNN graph

Each dolphin retains edges to its $k$ most-similar neighbours (**k** slider). The graph is symmetrised by taking the maximum weight of each pair, giving an undirected weighted graph.

### Louvain community detection

The kNN graph is partitioned by the Louvain algorithm, which iteratively reassigns nodes to maximise modularity $Q$. The **Resolution** parameter $\gamma$ scales the expected-edges null model: lower values favour fewer large communities; higher values favour more small ones. Communities with fewer than `minCommunitySize` (= 3) members are marked as unassigned.

Newman-Girvan modularity:

$$Q = \frac{1}{2m}\sum_{ij}\!\left[A_{ij} - \frac{k_i k_j}{2m}\right]\delta(c_i, c_j)$$

where $A_{ij}$ is the edge weight, $k_i$ is the weighted degree, $m = \frac{1}{2}\sum_{ij} A_{ij}$, and $\delta(c_i, c_j) = 1$ if nodes $i$ and $j$ are in the same community.

---

## Metrics

| Metric | Description |
|---|---|
| Retained | Dolphins with $\geq 4$ total sightings, the minimum for a usable B\* profile. |
| Communities | Number of Louvain communities with $\geq 3$ members. |
| Q | Modularity of the detected partition on the kNN graph. Values above ~0.3 indicate meaningful structure. |
| ARI | Adjusted Rand Index comparing detected communities to true simulated guilds. 0 = random agreement; 1 = perfect recovery. Computed only over dolphins assigned to a community. |
| W/B ratio | Mean within-community Jaccard divided by mean between-community Jaccard. Values above 1 confirm that same-community dolphins are more similar than cross-community ones. |

### Niche breadth and specialist/generalist scatter

Two per-dolphin metrics are plotted in the Specialist/generalist scatter:

**Niche breadth**: number of hexes with $B^*_{i,h} > 0.05 \times \max_h B^*_{i,h}$ (5% relative threshold filters Poisson noise).

**Core50**: the smallest number of hexes (sorted by descending $B^*$) needed to accumulate 50% of dolphin $i$'s total $B^*$. Low core50 indicates concentrated habitat use (specialist); high core50 indicates spread-out use (generalist).

Shannon evenness (computed but not plotted by default):

$$J_i = \frac{-\displaystyle\sum_h p_{ih}\ln p_{ih}}{\ln n_i}$$

where $p_{ih} = B^*_{ih}\,/\,\sum B^*_{ih}$ over hexes above the 5% threshold and $n_i$ is the count of such hexes.

---

## Glossary

### Seeds

| Control | Description |
|---|---|
| Landscape | Seed for the coastline shape and Perlin fields ($D_h$, $P_h$, $R_h$). Changing this regenerates the terrain. |
| Population | Seed for dolphin placement, survey effort, and sightings. Fix the landscape seed and vary this to see how different populations perform on the same terrain. |

### Population

| Control | Description |
|---|---|
| N | Total number of dolphins before retention filtering. Default: 60. |
| G | Number of habitat guilds (2–6). Each guild has a distinct preference profile over depth, productivity, and disturbance. Default: 4. |
| Overlap | Guild profile mixing coefficient (0–0.9). At 0, guilds have maximally distinct preferences; at 0.9, profiles are nearly identical and harder to separate. Default: 0.30. |
| Specialist | Fraction of dolphins with a high guild affinity coefficient ($c_i = 10$ vs $c_i = 5$ for generalists). Specialists show lower core50. Default: 0.50. |

### Survey

| Control | Description |
|---|---|
| Years | Number of survey years $T$. More years accumulate more sightings per dolphin and produce better-resolved B\* profiles. Default: 6. |
| Effort bias | Survey route length: 0 = routes extend to the domain edge; 1 = routes stay close to the port. Default: 0.70. |
| Detection p | Per-visit detection probability $p$, scaled by $\lambda_{i,h}$ and effort. Default: 0.30. |

### Analysis

| Control | Description |
|---|---|
| k (kNN) | Number of nearest neighbours each dolphin retains in the similarity graph fed to Louvain. Default: 8. |
| E_min | Effort floor in $B^* = Y / \max(E, E_{\min})$, preventing inflation in rarely-surveyed hexes. Default: 5.0. |
| Resolution | Louvain resolution $\gamma$. Lower values give fewer large communities; higher values give more small ones. Default: 1.0. |

### Domain

| Control | Description |
|---|---|
| Hex size | Spatial resolution: the arena footprint stays constant while the number of hexes changes. Smaller hexes give finer grain (slower at large N); larger hexes give coarser grain. Default: 30 (18 × 14 grid). |

### Hex map layers

| Layer | Description |
|---|---|
| Environment | Composite habitat quality $Q_h$, shown on the viridis scale. |
| Effort | Cumulative survey effort $\sum_t E_{h,t}$, shown on the yellow-orange-brown scale. The port hex is the brightest point. |
| Sightings | Raw total sightings $\sum_{i,t} Y_{i,h,t}$ over retained dolphins. Not effort-corrected; combines habitat use with survey coverage. |
| B\* | Effort-corrected sighting index $\sum_i B^*_{i,h}$ summed over retained dolphins, on the green scale. |
| Guild | Dominant community by B\* weight. Full colour: community holds more than 50% of hex B\*. Pale tint: plurality only. Neutral grey: insufficient data to assign a community. Warm tan: land. |
| Individual | Per-dolphin B\* profile for the selected dolphin. Click any node in the network panel to select; click a sea hex or empty space to deselect. |

### Network and matrix views

| View | Description |
|---|---|
| B\* | Dolphin × hex heatmap of row-normalised B\*, sorted by detected community. Left colour bar shows community membership. Block patterns in the rows reveal shared habitat preferences. |
| Jaccard | Dolphin × dolphin similarity matrix (weighted Jaccard on row-normalised B\*), on the blue scale. Block structure along the diagonal indicates natural groupings before any community labels are applied. |
| kNN | The sparse graph fed to Louvain, before community assignment. Nodes and edges shown in neutral grey; edge width is proportional to Jaccard similarity. |
| Communities | Same graph coloured by Louvain-detected communities. Within-community edges are coloured; between-community edges are pale grey. |
| Truth | The same graph coloured by the true simulated guilds. Compare with Communities to understand ARI. |

---

## Implementation notes

- **Seeded randomness**: all stochastic operations use mulberry32, a lightweight seeded PRNG. The landscape seed controls terrain; the population seed controls dolphin placement and surveys.
- **Row normalisation before Jaccard**: normalising B\* rows to unit sum before computing similarity removes activity-level variation. Two dolphins with the same habitat preference but different total sighting counts remain equally similar.
- **Louvain, not Leiden**: no vanilla-JS Leiden implementation exists with an appropriate licence. Louvain gives equivalent results at this scale and is fully reproducible given the seeded graph construction.
- **Circular network layout**: nodes are placed on a circle sorted by community or guild, with angular gaps at group boundaries. This avoids force-directed instability and makes block structure immediately visible.
- **Per-dolphin guild affinity**: specialist/generalist distinction is implemented via different guild affinity coefficients ($c_i = 10$ vs $c_i = 5$), not different home-range sizes. This produces separable core50 distributions while keeping ARI high.
- **Hex-resolution MAUP**: changing hex size keeps the arena footprint constant by adjusting the column and row counts. The simulation demonstrates the modifiable areal unit problem: very fine hexes reduce co-occurrence to near zero; very coarse hexes collapse all dolphins into the same cells.

---

## Assumptions and limitations

- Detection probability $p$ is constant within each hex given effort. There is no within-hex distance falloff.
- All survey years are aggregated before analysis. Temporal dynamics in guild membership are not modelled.
- Guild membership is fixed for each dolphin's lifetime. There is no social influence on habitat use.
- The Poisson observation model assumes independent detections across occasions and individuals.
- ARI is computed only over dolphins assigned to a community. Unassigned dolphins (community = -1) are excluded from both true and predicted label vectors.

---

## Further reading

- [Bipartite networks in ecology (Bascompte & Jordano 2007)](https://doi.org/10.1126/science.1133308)
- [Modularity and community structure in networks (Newman 2006)](https://doi.org/10.1073/pnas.0601602103)
- [Louvain method for community detection (Blondel et al. 2008)](https://doi.org/10.1088/1742-5468/2008/10/P10008)
- [Habitat guilds in cetaceans (Bearzi et al.)](https://www.jstor.org/stable/2389362)

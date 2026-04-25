---
title: "Bipartite Network Ecology (BNE)"
---

[→ Open simulation](../bne/) &nbsp;·&nbsp; [GitHub repository](https://github.com/amccnnll/ecodemos)

## Overview

This simulation generates a population of dolphins that each have a preferred habitat type within a shared bay domain, surveys them statistically over multiple years, then runs a community-detection pipeline to see whether the underlying habitat guilds can be recovered from sighting records alone.

The core idea comes from studies of resident bottlenose dolphins: individuals that repeatedly co-occur in the same habitat patches tend to form detectable groups in a bipartite network (dolphins on one side, spatial cells on the other), even when home ranges broadly overlap. Guild signal comes from _which patch types_ each dolphin uses, not from geographic separation.

The pipeline runs in three stages:

1. _Generate_: create a bay domain with three independent environmental fields, assign dolphins to guilds with habitat preference profiles, and simulate Poisson sightings under spatially biased survey effort.
2. _Data_: inspect the raw survey products (effort, sightings, effort-corrected B\* index) on the hex map, and the B\* and Jaccard similarity matrices.
3. _Analyse_: view the kNN graph fed to Louvain community detection, then the detected communities overlaid on the map and network, and compare to the true guild structure.

---

## Generative model

### Domain

The domain is a pointy-top hex grid using offset-r coordinates (odd rows shift right by half a hex, even rows do not), giving a rectangular bounding box with a brick-pattern edge rather than a parallelogram. Hex size controls spatial resolution while keeping the arena footprint constant (MAUP demonstration).

The coastline follows a sine-base bay perturbed by seeded Perlin noise:

$$C(x) = H \left(0.06 + 0.14 \sin(\pi x) + 0.06 \cdot \mathrm{Perlin}(2.5\,x,\, 0)\right)$$

where $x \in [0,1]$ is the normalised horizontal position and $H$ is the domain height. The Perlin component uses a seed derived from the landscape seed, so rolling the landscape dice produces a distinct coastline shape (varying inlet positions and slight headlands) while retaining the overall concave bay. Sea lies below $C(x)$; land above. Three independent environmental fields are assigned to each sea hex:

| Field        | Symbol | Description                                                   |
| ------------ | ------ | ------------------------------------------------------------- |
| Depth proxy  | $D_h$  | Increases with distance from coast, perturbed by Perlin noise |
| Productivity | $P_h$  | Pure Perlin noise field, independent of coastline             |
| Disturbance  | $R_h$  | Independent Perlin noise field (shipping, recreation)         |

A composite habitat quality index is computed for display only:

$$Q_h = 0.4\,D_h + 0.4\,P_h - 0.25\,R_h + 0.2$$

### Guild centroids and per-dolphin preference vectors

Each of the $G$ guilds has a fixed centroid $\boldsymbol{\mu}_g \in [0,1]^3$ in the three-dimensional habitat preference space $(D, P, R)$, drawn from a set of ecologically motivated archetypes (offshore, productive nearshore, disturbance-tolerant, coastal forager, etc.).

Each dolphin is assigned a latent cluster $g_i$ uniformly at random, then draws $K_i$ preferred points (peaks) independently from a Gaussian centred on that cluster:

$$ \boldsymbol{\mu}_{i,k} \sim \mathcal{N}\!\left(\boldsymbol{\mu}_{g*i},\, \sigma*{\text{cluster}}^2\, \mathbf{I}\right), \quad \boldsymbol{\mu}\_{i,k} \in [0,1]^3 $$

where components are clamped to $[0,1]$ after sampling. The dispersion depends on the _Overlap_ slider and on whether the dolphin is a specialist:

$$\sigma_{\text{cluster}} = 0.05 + \text{overlap} \times 0.45$$

At overlap $= 0$, dolphins draw from tight clusters around their centroid ($\sigma_{\text{cluster}} = 0.05$; near-discrete behaviour). At overlap $= 0.9$, Gaussians are wide and heavily overlapping ($\sigma_{\text{cluster}} = 0.455$; fluid guild boundaries). Because peaks are drawn per-dolphin rather than shared, dolphins near cluster boundaries will naturally resemble dolphins in adjacent clusters.

### Dolphin population

Home-range centres are sampled continuously and uniformly over the sea region by rejection sampling (uniform draws in the bounding box rejected if they fall on land). This keeps the underlying population truth independent of the hex grid. Changing hex size re-bins the observations but does not re-draw dolphin positions, giving a clean demonstration of the modifiable areal unit problem. Guild signal comes entirely from habitat preference, not from spatial clustering.

Importantly, two dolphins in the same habitat guild need not share any geographic space. Guild membership is a statement about _which types of habitat_ a dolphin prefers, not about _where_ it forages; the two may be on opposite sides of the bay and still be more similar in B\* profile than either is to a dolphin from a different guild in their neighbourhood.

Dolphins are classified as _specialists_ (fraction controlled by the _Specialist_ slider) or _generalists_. Both share the same home-range scale ($\sigma = 0.4 \times \text{domain diagonal}$): each can range across the bay. The specialist/generalist distinction lies in the multimodality and sharpness of their habitat preferences:

- **Specialists** have a single sharp peak ($K_i = 1$) in habitat space, with a narrow width $\kappa_{\text{spec}}$.
- **Generalists** have multiple peaks ($K_i = K_{\text{gen}}$, default 2), representing disjoint habitat types (e.g. shallow foraging plus deep refuge), with a peak width $\kappa_{\text{gen}}$.

The habitat score for dolphin $i$ in hex $h$ evaluates a Gaussian mixture across their preferred peaks:

$$ \text{score}_i(h) = \sum_{k=1}^{K*i} \frac{1}{K_i} \exp\left( - \frac{\|\mathbf{e}\_h - \boldsymbol{\mu}*{i,k}\|^2}{2\kappa_i^2} \right) $$

where $\mathbf{e}_h = [D_h, P_h, 1 - R_h]$ is the environmental vector of the hex, and $\kappa_i$ is the peak width. Treating disturbance as a flipped axis ($1 - R_h$) means a high coordinate represents avoiding disturbance. The latent use intensity is then:

$$ \lambda*{i,h} = \lambda*{\text{base}} \cdot \exp(a*i) \cdot \text{score}\_i(h) \cdot \exp\left(-\frac{d*{i,h}^2}{2\sigma^2}\right) $$

where $\lambda_{\text{base}}$ calibrates total sightings, $a_i \sim \mathcal{N}(0,\,0.25^2)$ is individual activity, and $d_{i,h}$ is distance from dolphin $i$'s home-range centre to hex $h$.

Because specialists use a single narrow peak, their $\lambda$ is sharply peaked on a small set of preferred hexes, while generalists spread their time more evenly across multiple habitat types.

### Residents vs transients

Real photo-ID catalogues contain two types of sightings: resident dolphins with stable home ranges that accumulate enough records to support a B\* profile, and transient visitors that are seen too rarely to characterise. The _Transients_ slider adds dolphins whose home-range centres lie just outside the arena boundary (random edge, 15–40% of the shorter domain dimension further out). Their Gaussian home range extends only weakly into the domain, so they typically accumulate fewer than 4 total sightings and are filtered out before analysis. They do contribute to the raw Sightings hex-map layer, creating a small amount of edge-region detections that are realistic but uninformative.

Transients have no guild assignment ($\text{guild\_true} = -1$) and contribute no signal to the guild-detection analysis. The Retained metric shows the number of dolphins that pass the ≥ 4 sightings gate out of the total population (residents + transients).

### Survey effort and observations

Effort is generated as $M = 60$ independent sample points per year drawn from a 2D half-normal (Rayleigh) field centred on the port hex (the nearshore sea hex nearest the domain's x-centroid, fixed by the landscape seed). The radial decay scale is:

$$\sigma_{\text{eff}} = \bigl(0.05 + (1 - \text{effortBias}) \times 0.30\bigr) \times \text{domainDiag}$$

High _Effort bias_ gives a tight nearshore cluster ($\sigma_{\text{eff}} \approx 0.05 \cdot \text{domainDiag}$); low bias spreads effort across the domain ($\sigma_{\text{eff}} \approx 0.35 \cdot \text{domainDiag}$). Each point is drawn by sampling a radial distance $r \sim \text{Rayleigh}(\sigma_{\text{eff}})$ and a uniform bearing $\theta \sim \text{Uniform}(0,\, 2\pi)$, rejecting points on land or outside the arena. Because points are redrawn each year, more years accumulate both sightings and spatial coverage.

At each sample point $w$ in year $t$, effort and detections are drawn jointly:

$$E_w \sim \Gamma(2,\,1)$$

$$Y_{i,w,t} \sim \text{Poisson}\!\left(E_w \cdot p \cdot \lambda_{i,w}\right)$$

where $\lambda_{i,w}$ is dolphin $i$'s latent use intensity at the sample point's continuous position (home-range Gaussian plus guild habitat preference), and $p$ is the per-unit-effort detection probability (_Detection p_ slider). Both $E_w$ and $Y_{i,w,t}$ are binned into the hex containing $w$ by inverse pointy-top offset-r formula. Hex size only determines that binning grain, not the observation process itself. Dolphins with fewer than 4 total sightings are dropped from the analysis.

---

## Analysis pipeline

### B\* effort correction

The effort-corrected sighting index aggregates over years and applies an effort floor:

$$B^*_{i,h} = \frac{\displaystyle\sum_t Y_{i,h,t}}{\max\!\left(\displaystyle\sum_t E_{h,t},\; E_{\min}\right)}$$

The floor $E_{\min}$ (_E_min_ slider) prevents inflation in rarely-visited hexes where a single sighting would otherwise dominate.

### Weighted Jaccard similarity

Before computing similarity, each dolphin's B\* row is normalised to a probability distribution:

$$\tilde{a}_{i,h} = \frac{B^*_{i,h}}{\displaystyle\sum_h B^*_{i,h}}$$

This removes activity-level differences so that two dolphins with the same habitat preference but different total sighting counts appear equally similar.

Pairwise weighted Jaccard similarity:

$$J_{ij} = \frac{\displaystyle\sum_h \min(\tilde{a}_{ih},\, \tilde{a}_{jh})}{\displaystyle\sum_h \max(\tilde{a}_{ih},\, \tilde{a}_{jh})}$$

### kNN graph

Each dolphin retains edges to its $k$ most-similar neighbours (_k_ slider). The graph is symmetrised by taking the maximum weight of each pair, giving an undirected weighted graph.

### Louvain community detection

The kNN graph is partitioned by the Louvain algorithm, which iteratively reassigns nodes to maximise modularity $Q$. The _Resolution_ parameter $\gamma$ scales the expected-edges null model: lower values favour fewer large communities; higher values favour more small ones. Communities with fewer than `minCommunitySize` (= 3) members are marked as unassigned.

Newman-Girvan modularity:

$$Q = \frac{1}{2m}\sum_{ij}\!\left[A_{ij} - \frac{k_i k_j}{2m}\right]\delta(c_i, c_j)$$

where $A_{ij}$ is the edge weight, $k_i$ is the weighted degree, $m = \frac{1}{2}\sum_{ij} A_{ij}$, and $\delta(c_i, c_j) = 1$ if nodes $i$ and $j$ are in the same community.

---

## Metrics

| Metric      | Description                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retained    | Dolphins with $\geq 4$ total sightings (usable B\* profile) out of the total population including transients.                                                                 |
| Communities | Number of Louvain communities with $\geq 3$ members.                                                                                                                          |
| Q           | Modularity of the detected partition on the kNN graph. Values above ~0.3 indicate meaningful structure.                                                                       |
| ARI         | Adjusted Rand Index comparing detected communities to true simulated guilds. 0 = random agreement; 1 = perfect recovery. Computed only over dolphins assigned to a community. |
| W/B ratio   | Mean within-community Jaccard divided by mean between-community Jaccard. Values above 1 confirm that same-community dolphins are more similar than cross-community ones.      |

### Niche breadth and specialist/generalist scatter

Two per-dolphin metrics are plotted in the Specialist/generalist scatter. Transient dolphins (no resident home range) are excluded.

_Niche breadth_ (x-axis): number of hexes with $B^*_{i,h} > 0.05 \times \max_h B^*_{i,h}$ (5% relative threshold filters Poisson noise).

_Pielou's J_ (y-axis): the Shannon evenness of dolphin $i$'s normalised B\* distribution across the hexes they use. Let $w_{ih} = B^*_{ih} / \sum_h B^*_{ih}$ and let $H_i$ be the set of hexes with $w_{ih} > 0$:

$$J_i = \frac{-\sum_{h \in H_i} w_{ih} \ln w_{ih}}{\ln |H_i|}$$

$J = 0$ means all B\* concentrates on a single hex; $J = 1$ means B\* is spread evenly. Specialists are expected to sit at low $J$ (concentrated on a few preferred hexes), generalists at high $J$ (even spread).

Each point's radius encodes $\sqrt{\text{total sightings}}$, so small dots mark dolphins whose B\* profile rests on few records and may sit anywhere on the chart by chance. This is the diagnostic for whether an unusual scatter position reflects real concentration or just data sparsity. In real photo-ID work the niche-breadth × $J$ scatter is itself the metric used to _define_ specialist behaviour: the truth-overlay ring shows whether the metric correctly identifies the dolphins the simulation marked as specialists.

`habitatSpread` and `core50` are also computed internally and may be surfaced in future diagnostic views.

---

## Glossary

### Seeds

| Control    | Description                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Landscape  | Seed for the coastline shape and Perlin fields ($D_h$, $P_h$, $R_h$). Changing this regenerates the terrain.                                                 |
| Population | Seed for dolphin placement, survey effort, and sightings. Fix the landscape seed and vary this to see how different populations perform on the same terrain. |

### Population

| Control    | Description                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N          | Total number of dolphins before retention filtering. Range: 20–200. Default: 60.                                                                                                                                                                                                                                             |
| G          | Number of latent habitat clusters (2–6). Each has a centroid in the 3D preference space; each dolphin draws its own $\boldsymbol{\theta}_i$ from a Gaussian around its cluster's centroid. Default: 4.                                                                                                                       |
| Overlap    | Cluster dispersion $\sigma_{\text{cluster}}$ (0–0.9). At 0, dolphins draw from tight Gaussians ($\sigma = 0.05$; near-discrete guild structure); at 0.9, Gaussians are wide and cross-cluster similarity is common ($\sigma = 0.455$). Default: 0.30.                                                                        |
| Specialist | Fraction of dolphins flagged as specialists. Specialists differ from generalists by having a single, typically sharper peak ($K = 1$, $\kappa = \kappa_{\text{spec}}$) in habitat space, concentrating their time on a narrow set of preferred hexes. Generalists have multiple peaks ($K = K_{\text{gen}}$). Default: 0.50. |
| Transients | Number of extra dolphins whose home-range centres are placed just outside the arena. Range: 0–60. They produce occasional edge sightings but mostly fail the ≥ 4 sightings filter. Default: 2.                                                                                                                               |
| K_gen      | Number of peaks in habitat space for generalists (specialists fixed at 1). Range: 1–4. Default: 2.                                                                                                                                                                                                                           |
| κ_spec     | Habitat peak width for specialists. Lower values produce sharper spatial niche breadth. Range: 0.05–0.40. Default: 0.15.                                                                                                                                                                                                     |
| κ_gen      | Habitat peak width for generalists. Range: 0.05–0.40. Default: 0.15.                                                                                                                                                                                                                                                         |

### Survey

| Control     | Description                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Years       | Number of survey years $T$ (1–20). Each year draws $M = 60$ independent sample points from the radial effort field, so more years both accumulate sightings and expand the cumulative spatial footprint. Default: 6. |
| Effort bias | Radial decay scale: 1 = effort tightly clustered near port; 0 = effort spread across the full domain. Default: 0.70.                                                                                                 |
| Detection p | Per-visit detection probability $p$, scaled by $\lambda_{i,h}$ and effort. Default: 0.30.                                                                                                                            |

### Analysis

| Control    | Description                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| k (kNN)    | Number of nearest neighbours each dolphin retains in the similarity graph fed to Louvain. Range: 2–30. Default: 8.        |
| E_min      | Effort floor in $B^* = Y / \max(E, E_{\min})$, preventing inflation in rarely-surveyed hexes. Default: 0.5.               |
| Resolution | Louvain resolution $\gamma$. Lower values give fewer large communities; higher values give more small ones. Default: 1.0. |

### Domain

| Control  | Description                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hex size | Spatial resolution: the arena footprint stays constant while the number of hexes changes. Range: 8–75. Smaller hexes give finer grain; larger hexes give coarser grain and a smaller cell count. Default: 30 (approx. 18 × 14 grid). |

### Hex map layers

| Layer       | Description                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment | Composite habitat quality $Q_h$, shown on the viridis scale.                                                                                                                                                                                                     |
| Effort      | Cumulative survey effort $\sum_t E_{h,t}$, shown on the yellow-orange-brown scale. Shows a smooth radial gradient centred on the port; hexes near the port receive the most effort.                                                                              |
| Sightings   | Raw total sightings $\sum_{i,t} Y_{i,h,t}$ over retained dolphins. Not effort-corrected; combines habitat use with survey coverage.                                                                                                                              |
| B\*         | Effort-corrected sighting index $\sum_i B^*_{i,h}$ summed over retained dolphins, on the green scale.                                                                                                                                                            |
| Guild       | Dominant _latent cluster_ by B\* weight. Full colour: a cluster holds more than 50% of B\* in the hex. Pale tint: plurality only. Neutral grey: insufficient data. Warm tan: land. This layer shows the true generative structure, not the detected communities. |
| Individual  | Per-dolphin B\* profile for the selected dolphin. Click any node in the network panel to select; click a sea hex or empty space to deselect.                                                                                                                     |

### Network and matrix views

| View        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bipartite   | Raw dolphin × hex bipartite graph before projection to dolphin-dolphin similarity. Dolphins (left column, coloured by community) connected to hexes (right column, grey) by edges where $B^*_{i,h} > 5\%$ of dolphin $i$'s peak $B^*$. Edge width ∝ $B^*$. Shows the data that the projection and community detection are based on.                                                                                                                                                                                                                                                                                             |
| B\*         | Dolphin × hex heatmap of row-normalised B\*, sorted by detected community. Left colour bar shows community membership. Block patterns in the rows reveal shared habitat preferences.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Jaccard     | Dolphin × dolphin similarity matrix (weighted Jaccard on row-normalised B\*), on the blue scale. Block structure along the diagonal indicates natural groupings before any community labels are applied.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Full        | The unpruned Jaccard similarity graph: all dolphin pairs with Jaccard > 0 connected. Nodes and edges shown in neutral grey. Compare with kNN to see how pruning removes weak noise connections while retaining the strong within-guild structure.                                                                                                                                                                                                                                                                                                                                                                               |
| kNN         | The kNN-pruned graph fed to Louvain, before community assignment. Nodes and edges shown in neutral grey; edge width is proportional to Jaccard similarity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Communities | Same graph coloured by Louvain-detected communities. Within-community edges are coloured; between-community edges are pale grey.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Truth       | Shows _all_ dolphins in the generative model (residents and transients, retained or not). Nodes are coloured by latent cluster $g_i$; edges evaluate the expected similarity across all pairs of peaks between dolphin $i$ and dolphin $j$ via a mixture-mixture Gaussian kernel with $\tau = 0.20$. Three visual tiers: bright outline = retained ($\geq 4$ sightings, in the analysis); dim outline = resident but not retained; faint = transient. Compare with the Communities view to assess ARI. At high Overlap, cluster boundaries blur and cross-cluster edges appear, reflecting the continuous preference structure. |

---

## Implementation notes

- _Seeded randomness_: all stochastic operations use mulberry32, a lightweight seeded PRNG. The landscape seed controls terrain; the population seed controls dolphin placement and surveys.
- _Row normalisation before Jaccard_: normalising B\* rows to unit sum before computing similarity removes activity-level variation. Two dolphins with the same habitat preference but different total sighting counts remain equally similar.
- _Louvain, not Leiden_: no vanilla-JS Leiden implementation exists with an appropriate licence. Louvain gives equivalent results at this scale and is fully reproducible given the seeded graph construction.
- _Circular network layout_: nodes are placed on a circle sorted by community or guild, with angular gaps at group boundaries. This avoids force-directed instability and makes block structure immediately visible.
- _Specialist mechanism_: implemented via a multimodal Gaussian mixture in habitat space. Specialists have a single sharp peak ($K=1$) whereas generalists have multiple peaks ($K=K_{\text{gen}}$) representing disjoint habitat types. Spatial home range ($\sigma = 0.4 \times \text{domainDiag}$) is identical for both groups: a specialist still ranges across the bay, but their time concentrates on a small set of habitat-matching hexes that may be spatially scattered.
- _Hex-resolution MAUP_: changing hex size keeps the arena footprint constant by adjusting the column and row counts. The simulation demonstrates the modifiable areal unit problem: very fine hexes reduce co-occurrence to near zero; very coarse hexes collapse all dolphins into the same cells.
- _Radial effort model_: $M = 60$ sample points per year are drawn from a 2D half-normal (Rayleigh) field centred on the port, with scale $\sigma_{\text{eff}} = (0.05 + (1 - \text{effortBias}) \times 0.30) \times \text{domainDiag}$. The Rayleigh density peaks at $\sigma_{\text{eff}}$, so this keeps default effort clearly nearshore. Each point contributes $\Gamma(2,1)$ effort and Poisson detections drawn from the continuous-space $\lambda_{i,w}$; hex size only determines the post-hoc binning of effort and sightings. Dolphin home-range centres are sampled continuously over the sea region, so the underlying truth is fully hex-size-invariant.

---

## Assumptions and limitations

- Detection probability $p$ is constant per unit effort at each sample point. There is no distance falloff to individual dolphins.
- All survey years are aggregated before analysis. Temporal dynamics in guild membership are not modelled.
- Guild membership is fixed for each dolphin's lifetime. There is no social influence on habitat use.
- The Poisson observation model assumes independent detections across occasions and individuals.
- ARI is computed only over dolphins assigned to a community. Unassigned dolphins (community = -1) are excluded from both true and predicted label vectors.

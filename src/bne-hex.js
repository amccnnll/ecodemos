// src/bne-hex.js — hex grid, bay coastline, environmental fields.
// Pure engine: no DOM, D3, or p5 dependencies.

const SQRT3 = Math.sqrt(3);

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────
export function mulberry32(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 2D Perlin noise ───────────────────────────────────────────────────────
export function makePerlin(seed) {
  const rand = mulberry32(seed);
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    return ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  }

  return function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    return lerp(
      lerp(grad(p[p[X]     + Y],     xf,     yf    ),
           grad(p[p[X + 1] + Y],     xf - 1, yf    ), u),
      lerp(grad(p[p[X]     + Y + 1], xf,     yf - 1),
           grad(p[p[X + 1] + Y + 1], xf - 1, yf - 1), u),
      v
    );
  };
}

// ── Hex geometry (pointy-top, axial coords) ───────────────────────────────
// Centroid of axial (q, r):
//   x = size * sqrt(3) * (q + r/2)
//   y = size * 1.5 * r

export function hexCentroid(q, r, size) {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r,
  };
}

export function hexVertices(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6; // pointy-top: first vertex points up
    pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
  }
  return pts;
}

export function hexPathString(cx, cy, size) {
  const v = hexVertices(cx, cy, size);
  return `M${v.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`;
}

// ── Bay coastline ─────────────────────────────────────────────────────────
// Smooth concave bay: coastline dips further into the domain at the centre.
// normX ∈ [0,1]; returns distance from top (in domain coords) where coast sits.
// Sea is below this line; land is above.
function coastlineY(normX, domainH) {
  return domainH * (0.16 + 0.14 * Math.sin(Math.PI * normX));
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ── Main export ───────────────────────────────────────────────────────────
export function generateHexGrid({ cols = 18, rows = 14, hexSize = 30, seed = 42 } = {}) {
  const perlinD = makePerlin((seed * 31 + 7)  | 0);
  const perlinP = makePerlin((seed * 17 + 13) | 0);
  const perlinR = makePerlin((seed * 23 + 19) | 0);

  // Bounding box
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const { x, y } = hexCentroid(q, r, hexSize);
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    }
  }
  const domainW = xMax - xMin || 1;
  const domainH = yMax - yMin || 1;
  const domainDiag = Math.sqrt(domainW * domainW + domainH * domainH);

  const hexes = [];
  let seaCount = 0;

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const { x, y } = hexCentroid(q, r, hexSize);
      const normX = (x - xMin) / domainW;
      const relY  = y - yMin;
      const normY = relY / domainH;

      const cY = coastlineY(normX, domainH);
      const isLand = relY < cY;

      if (isLand) {
        hexes.push({ hex_id: hexes.length, q, r, x, y, isLand: true, seaIdx: -1,
                     D_h: 0, P_h: 0, R_h: 0, Q_h: 0, distFromCoast: 0, normX, normY });
        continue;
      }

      const distCoast = clamp01((relY - cY) / (domainH * 0.7));

      // D_h: depth-like (increases away from coast)
      const D_h = clamp01(distCoast * 0.75 + 0.25 * perlinD(normX * 4, normY * 4) + 0.1);
      // P_h: productivity (Perlin, independent of coastline)
      const P_h = clamp01(0.5 + 0.45 * perlinP(normX * 3 + 1, normY * 3 + 1));
      // R_h: disturbance (pure Perlin — patchy like shipping lanes/recreation, not a simple gradient)
      // Kept independent of D_h so all three axes span genuine 3D preference space.
      const R_h = clamp01(0.5 + 0.45 * Math.max(-1, Math.min(1, perlinR(normX * 5, normY * 5))));
      // Q_h: composite habitat quality
      const Q_h = clamp01(0.4 * D_h + 0.4 * P_h - 0.25 * R_h + 0.2);

      hexes.push({
        hex_id: hexes.length, q, r, x, y, isLand: false,
        seaIdx: seaCount++,
        D_h, P_h, R_h, Q_h,
        distFromCoast: distCoast, normX, normY,
      });
    }
  }

  return { hexes, cols, rows, hexSize, xMin, xMax, yMin, yMax, domainW, domainH, domainDiag, nSea: seaCount };
}

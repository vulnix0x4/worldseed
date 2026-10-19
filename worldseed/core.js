/* Worldseed core: seeded noise, color and geometry helpers shared by the engine. */
(() => {
"use strict";
const T = THREE;
const WS = (window.WS = window.WS || {});

/* ---------- seeded randomness ---------- */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- 2D simplex noise (seeded) ---------- */
function makeNoise(seed) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = pm12[ii + perm[jj]] * 2; t0 *= t0; n0 = t0 * t0 * (G[g] * x0 + G[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = pm12[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n1 = t1 * t1 * (G[g] * x1 + G[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = pm12[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n2 = t2 * t2 * (G[g] * x2 + G[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}

/* ---------- math ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

/* ---------- color ---------- */
function col(c, fallback) {
  try {
    if (c instanceof T.Color) return c.clone();
    if (typeof c === "string" && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim())) return new T.Color(c.trim());
  } catch (e) {}
  return new T.Color(fallback || "#888888");
}
function shade(c, k) { return col(c).multiplyScalar(k); }
function mixc(a, b, t) { return col(a).lerp(col(b), t); }
function hex(c) { return "#" + col(c).getHexString(); }

/* ---------- geometry ---------- */
// Every part is converted to non-indexed geometry carrying a flat vertex color,
// so whole objects merge into one draw call and shade as faceted low-poly.
function part(geo, color, m) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const c = col(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new T.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  if (g.attributes.normal) g.deleteAttribute("normal");
  return g;
}
function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), color = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    color.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  g.setAttribute("color", new T.BufferAttribute(color, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new T.Matrix4();
  m.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
  return m;
}
const G = {
  box: (w, h, d) => new T.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 8) => new T.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 8) => new T.ConeGeometry(r, h, s),
  ico: (r, d = 0) => new T.IcosahedronGeometry(r, d),
  dodeca: r => new T.DodecahedronGeometry(r, 0),
  octa: r => new T.OctahedronGeometry(r, 0),
  sph: (r, ws = 8, hs = 6, ts = 0, tl = Math.PI) => new T.SphereGeometry(r, ws, hs, 0, Math.PI * 2, ts, tl),
  torus: (r, t, rs = 6, ts = 16) => new T.TorusGeometry(r, t, rs, ts),
};

// Anything within a few meters of the camera dissolves with a screen-door dither,
// so trees and walls never trap the view.
function nearFade(m) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      { float camD = length(vViewPosition);
        if (camD < 4.2) { float th = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453); if (th > (camD - 1.2) / 3.0) discard; } }`);
  };
  m.customProgramCacheKey = () => "nearfade";
  return m;
}
function flatMat(opts = {}) {
  return nearFade(new T.MeshStandardMaterial(Object.assign({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }, opts)));
}

/* ---------- soft round sprite for particles ---------- */
function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new T.CanvasTexture(c);
  return t;
}

Object.assign(WS, { rng, hashStr, makeNoise, clamp, lerp, smooth, ease, easeOut, col, shade, mixc, hex, part, merge, M, G, flatMat, nearFade, dotTexture });
})();

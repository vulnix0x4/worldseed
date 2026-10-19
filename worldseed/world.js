/* Worldseed engine: renders a world spec as an explorable 3D place.
   Terrain, water, sky, time of day, weather, flora, landmarks, people, the player and the camera. */
(() => {
"use strict";
const T = THREE;
const { clamp, lerp, smooth, ease, easeOut, col, shade, mixc, makeNoise, rng, hashStr } = WS;
const SIZE = 320, HALF = SIZE / 2, N = 144, STEP = SIZE / N, LIMIT = 148;
const PI = Math.PI;

const DEFAULT_PALETTE = {
  skyTop: "#5b8fd6", skyHorizon: "#cfe1ef", sun: "#fff3dc", low: "#6f9a4f", mid: "#557d3f", high: "#8a8a7c",
  peak: "#f2f2ee", sand: "#d8c79a", water: "#2f7ea6", accent: "#ffb547",
};
const SOLID = { tower: 3, cottage: 3.6, house: 3.6, hut: 2.9, lighthouse: 2.6, windmill: 2.8, statue: 2.4, well: 1.8, obelisk: 1.8, monolith: 1.8,
  tent: 2.6, great_tree: 2.8, tree: 2.8, observatory: 4.5, dome: 4.5, hall: 6, pyramid: 8, ziggurat: 8, cave: 5, crystals: 2, crystal: 2, fountain: 4 };

function createWorld(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(55, 1, 0.1, 2600);
  scene.fog = new T.Fog(0xcfe1ef, 80, 340);

  /* ---------------- lights ---------------- */
  const hemi = new T.HemisphereLight(0xffffff, 0x556644, 0.6);
  const sun = new T.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 420 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.35;
  scene.add(hemi, sun, sun.target);
  const pool = [];
  for (let i = 0; i < 4; i++) { const l = new T.PointLight(0xffc477, 0, 26, 2); scene.add(l); pool.push(l); }
  const lantern = new T.PointLight(0xffc98a, 0, 15, 2);
  scene.add(lantern);

  /* ---------------- sky ---------------- */
  const skyU = {
    uTop: { value: col("#5b8fd6") }, uHorizon: { value: col("#cfe1ef") }, uBottom: { value: col("#9fb4c4") },
    uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunColor: { value: col("#fff3dc") }, uNight: { value: 0 }, uTime: { value: 0 },
    uAurora: { value: 0 }, uAccent: { value: col("#7fffd4") },
  };
  const sky = new T.Mesh(new T.SphereGeometry(1800, 32, 16), new T.ShaderMaterial({
    uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uAccent; uniform float uNight, uTime, uAurora; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, y), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, y));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunColor * (pow(s, 900.0) * 2.0 + pow(s, 14.0) * 0.22 + pow(s, 3.0) * 0.06);
        vec3 m = normalize(-uSunDir + vec3(0.0, 0.0, 0.0)); float ms = max(dot(d, normalize(vec3(-uSunDir.x, abs(uSunDir.y) + 0.2, -uSunDir.z))), 0.0);
        c += vec3(0.85, 0.9, 1.0) * pow(ms, 1400.0) * 1.6 * uNight;
        if (uNight > 0.01 && y > 0.0) {
          vec3 q = floor(d * 220.0); float h = hash(q);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h * 60.0);
          c += vec3(step(0.9972, h) * uNight * smoothstep(0.02, 0.3, y) * tw);
        }
        if (uAurora > 0.01 && y > 0.05) {
          float band = sin(d.x * 5.0 + uTime * 0.15 + sin(d.z * 3.0 + uTime * 0.1) * 1.6);
          float a = smoothstep(0.55, 1.0, band) * smoothstep(0.05, 0.35, y) * (1.0 - smoothstep(0.55, 0.9, y));
          float stripes = 0.6 + 0.4 * sin(d.x * 90.0 + d.z * 40.0 + uTime);
          c += mix(uAccent, vec3(0.6, 0.3, 0.9), smoothstep(0.2, 0.6, y)) * a * stripes * uAurora * (0.4 + uNight);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  /* ---------------- clouds ---------------- */
  const cloudMat = new T.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  const clouds = [];
  {
    const r = rng(7);
    for (let i = 0; i < 16; i++) {
      const parts = [];
      const n = 3 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) parts.push(WS.part(WS.G.ico(5 + r() * 6, 0), "#ffffff", WS.M(j * 7 - n * 3.5, r() * 3, (r() - 0.5) * 8, 0, 0, 0, 1, 0.55, 1)));
      const m = new T.Mesh(WS.merge(parts), cloudMat);
      m.position.set((r() - 0.5) * 700, 95 + r() * 40, (r() - 0.5) * 700);
      m.userData.speed = 2 + r() * 3;
      scene.add(m); clouds.push(m);
    }
  }

  /* ---------------- world state ---------------- */
  const W = {
    pal: {}, palTarget: null, palFrom: null, palT: 1,
    terrain: { shape: "islands", height: 0.5, roughness: 0.5, water: 0.3, seed: 1 },
    heights: new Float32Array((N + 1) * (N + 1)), H: 30, waterY: 6, hasWater: true,
    landmarks: [], npcs: [], flora: [], ghosts: new Map(),
    hour: 12, hourTarget: 12, timeFlow: 0.4, weather: "clear", time: 0,
    mode: "orbit", orbitA: 0.6,
  };
  for (const k in DEFAULT_PALETTE) W.pal[k] = col(DEFAULT_PALETTE[k]);

  /* ---------------- terrain ---------------- */
  function genHeights(tp) {
    const nz = makeNoise(tp.seed), nz2 = makeNoise(tp.seed + 101), nz3 = makeNoise(tp.seed + 202);
    const H = 6 + 40 * tp.height, rough = tp.roughness;
    const oct = 3 + Math.round(rough * 3), pers = 0.42 + 0.16 * rough;
    const fbm = (x, y, f = 1.6) => { let a = 1, s = 0, n = 0, fr = f; for (let o = 0; o < oct; o++) { s += a * nz(x * fr, y * fr); n += a; a *= pers; fr *= 2.03; } return s / n; };
    const ridged = (x, y, f = 1.4) => { let a = 1, s = 0, n = 0, fr = f; for (let o = 0; o < oct; o++) { s += a * (1 - Math.abs(nz2(x * fr, y * fr))); n += a; a *= pers; fr *= 2.1; } return s / n; };
    const hasWater = tp.water > 0.03;
    const h = W.heights;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -HALF + i * STEP, z = -HALF + j * STEP, u = x / HALF, v = z / HALF;
      const r = Math.sqrt(u * u + v * v), f = fbm(u, v);
      let b;
      switch (tp.shape) {
        case "archipelago": b = 0.22 + fbm(u * 1.7, v * 1.7, 2.2) * 0.75 - 0.2 * smooth(0.6, 1, r); break;
        case "mountains": b = Math.pow(ridged(u, v), 1.8) * 1.05 + f * 0.1 - 0.1; break;
        case "valley": { const w = Math.abs(u + 0.28 * nz3(v * 1.3, 0.5)); b = 0.12 + 0.85 * smooth(0.06, 0.75, w) * (0.65 + 0.35 * ridged(u, v)) + f * 0.08; break; }
        case "plains": b = 0.32 + f * 0.22 + nz3(u * 0.7, v * 0.7) * 0.1; break;
        case "dunes": { const d = 1 - Math.abs(Math.sin((u * 0.8 + v * 0.45 + nz3(u, v) * 0.35) * 11)); b = 0.28 + d * 0.16 + f * 0.18; break; }
        case "canyon": { const c = Math.abs(nz3(u * 1.2, v * 1.2)); b = 0.78 - 0.62 * (1 - smooth(0.02, 0.17, c)) + f * 0.12; b = Math.round(b * 7) / 7 * 0.7 + b * 0.3; break; }
        case "crater": { const ring = Math.exp(-((r - 0.42) * (r - 0.42)) / 0.012); b = 0.3 + ring * 0.62 - (r < 0.4 ? 0.22 * (1 - r / 0.4) : 0) + f * 0.16; break; }
        case "plateau": { const q = 0.42 + f * 0.75; b = Math.round(q * 4) / 4 * 0.75 + q * 0.25; break; }
        case "islands":
        default: b = f * 0.55 + 0.62 * (1 - smooth(0.12, 0.95, r)) - 0.08;
      }
      const e = smooth(0.8, 1.0, r);
      b = hasWater ? lerp(b, -0.35, e) : lerp(b, b + 0.7 + ridged(u * 2, v * 2) * 0.4, e);
      h[j * (N + 1) + i] = b * H;
    }
    W.H = H;
    W.hasWater = hasWater;
    W.waterY = hasWater ? H * (tp.water * 0.7 - 0.02) : -999;
    W.base = h.slice();
  }

  function heightAt(x, z) {
    const gx = clamp((x + HALF) / STEP, 0, N - 0.0001), gz = clamp((z + HALF) / STEP, 0, N - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, R = N + 1, h = W.heights;
    const h00 = h[j * R + i], h10 = h[j * R + i + 1], h01 = h[(j + 1) * R + i], h11 = h[(j + 1) * R + i + 1];
    return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }
  function slopeAt(x, z) {
    const d = 1.5;
    return Math.hypot(heightAt(x + d, z) - heightAt(x - d, z), heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
  }

  const tGeo = new T.BufferGeometry();
  const tPos = new Float32Array(N * N * 18), tCol = new Float32Array(N * N * 18);
  tGeo.setAttribute("position", new T.BufferAttribute(tPos, 3));
  tGeo.setAttribute("color", new T.BufferAttribute(tCol, 3));
  const terrain = new T.Mesh(tGeo, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  terrain.receiveShadow = true;
  terrain.scale.y = 0.02;
  scene.add(terrain);
  const jitter = new Float32Array(N * N * 2);
  { const r = rng(99); for (let i = 0; i < jitter.length; i++) jitter[i] = (r() - 0.5) * 0.07; }

  const _c = new T.Color(), _rock = new T.Color();
  function faceColor(hAvg, ny, k) {
    const P = W.pal, wy = W.waterY, top = Math.max(W.H * 0.9, wy + 4);
    const t = W.hasWater ? (hAvg - wy) / (top - wy) : hAvg / top;
    if (W.hasWater && hAvg < wy + 0.9) {
      _c.copy(P.sand);
      if (hAvg < wy - 0.5) _c.lerp(P.water, clamp((wy - hAvg) / 6, 0.15, 0.75));
    } else if (t < 0.36) _c.copy(P.low).lerp(P.mid, smooth(0.05, 0.36, t));
    else if (t < 0.72) _c.copy(P.mid).lerp(P.high, smooth(0.36, 0.72, t));
    else _c.copy(P.high).lerp(P.peak, smooth(0.74, 0.86, t + jitter[k] * 2));
    if (ny < 0.78) { _rock.copy(P.high).multiplyScalar(0.72); _c.lerp(_rock, smooth(0.78, 0.55, ny)); }
    return _c.multiplyScalar(1 + jitter[k]);
  }

  function rebuildTerrain(colorsOnly) {
    const h = W.heights, R = N + 1;
    let p = 0, f = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x0 = -HALF + i * STEP, z0 = -HALF + j * STEP, x1 = x0 + STEP, z1 = z0 + STEP;
      const a = h[j * R + i], b = h[(j + 1) * R + i], c = h[j * R + i + 1], d = h[(j + 1) * R + i + 1];
      const tris = [[x0, a, z0, x0, b, z1, x1, c, z0], [x1, c, z0, x0, b, z1, x1, d, z1]];
      for (const tr of tris) {
        if (!colorsOnly) for (let q = 0; q < 9; q++) tPos[p + q] = tr[q];
        const ux = tr[3] - tr[0], uy = tr[4] - tr[1], uz = tr[5] - tr[2], vx = tr[6] - tr[0], vy = tr[7] - tr[1], vz = tr[8] - tr[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const ny1 = ny / Math.hypot(nx, ny, nz);
        const fc = faceColor((tr[1] + tr[4] + tr[7]) / 3, ny1, f++);
        for (let q = 0; q < 3; q++) { tCol[p + q * 3] = fc.r; tCol[p + q * 3 + 1] = fc.g; tCol[p + q * 3 + 2] = fc.b; }
        p += 9;
      }
    }
    tGeo.attributes.color.needsUpdate = true;
    if (!colorsOnly) { tGeo.attributes.position.needsUpdate = true; tGeo.computeVertexNormals(); tGeo.computeBoundingSphere(); }
    mapDirty = true;
  }

  function flatten(x, z, r, y) {
    const R = N + 1, h = W.heights;
    const i0 = Math.max(0, Math.floor((x - r * 1.6 + HALF) / STEP)), i1 = Math.min(N, Math.ceil((x + r * 1.6 + HALF) / STEP));
    const j0 = Math.max(0, Math.floor((z - r * 1.6 + HALF) / STEP)), j1 = Math.min(N, Math.ceil((z + r * 1.6 + HALF) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = -HALF + i * STEP, pz = -HALF + j * STEP, d = Math.hypot(px - x, pz - z);
      const k = 1 - smooth(r, r * 1.6, d);
      if (k > 0) h[j * R + i] = lerp(h[j * R + i], y, k);
    }
  }

  /* ---------------- water ---------------- */
  const waterU = Object.assign(T.UniformsUtils.clone(T.UniformsLib.fog), {
    uTime: { value: 0 }, uColor: { value: col("#2f7ea6") }, uSky: { value: col("#cfe1ef") },
    uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunColor: { value: col("#fff") }, uOpacity: { value: 0.86 },
  });
  const waterMat = new T.ShaderMaterial({
    uniforms: waterU, transparent: true, fog: true, extensions: { derivatives: true },
    vertexShader: `
      uniform float uTime; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.11 + uTime * 1.05) * 0.28 + sin(wp.z * 0.14 + uTime * 0.8) * 0.22 + sin((wp.x + wp.z) * 0.31 + uTime * 1.7) * 0.07;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor, uSky, uSunDir, uSunColor; uniform float uOpacity; varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld))); if (n.y < 0.0) n = -n;
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 L = normalize(uSunDir);
        float diff = max(dot(n, L), 0.0) * 0.45 + 0.55;
        float spec = pow(max(dot(n, normalize(L + v)), 0.0), 90.0) * step(0.0, L.y);
        vec3 c = mix(uColor * diff, uSky, fres * 0.55) + uSunColor * spec * 0.9;
        gl_FragColor = vec4(c, uOpacity);
        #include <fog_fragment>
      }`,
  });
  const water = new T.Mesh(new T.PlaneGeometry(1500, 1500, 110, 110).rotateX(-PI / 2), waterMat);
  water.renderOrder = 1;
  scene.add(water);

  /* ---------------- weather particles ---------------- */
  const PCOUNT = 2200, BOX = { x: 90, y: 44, z: 90 };
  const pPos = new Float32Array(PCOUNT * 3), pSeed = new Float32Array(PCOUNT);
  { const r = rng(5); for (let i = 0; i < PCOUNT; i++) { pPos[i * 3] = (r() - 0.5) * BOX.x; pPos[i * 3 + 1] = r() * BOX.y; pPos[i * 3 + 2] = (r() - 0.5) * BOX.z; pSeed[i] = r(); } }
  const pGeo = new T.BufferGeometry(); pGeo.setAttribute("position", new T.BufferAttribute(pPos, 3));
  const pMat = new T.PointsMaterial({ size: 0.5, map: WS.dotTexture(), transparent: true, depthWrite: false, color: 0xffffff, blending: T.NormalBlending, sizeAttenuation: true });
  const points = new T.Points(pGeo, pMat); points.frustumCulled = false; points.visible = false; scene.add(points);
  const RCOUNT = 1600;
  const rPos = new Float32Array(RCOUNT * 6);
  const rGeo = new T.BufferGeometry(); rGeo.setAttribute("position", new T.BufferAttribute(rPos, 3));
  const rain = new T.LineSegments(rGeo, new T.LineBasicMaterial({ color: 0xbfd2e6, transparent: true, opacity: 0.42 }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  { const r = rng(9); for (let i = 0; i < RCOUNT; i++) { const x = (r() - 0.5) * BOX.x, y = r() * BOX.y, z = (r() - 0.5) * BOX.z; rPos.set([x, y, z, x + 0.08, y + 1.3, z + 0.05], i * 6); } }
  const WEATHER = {
    clear: { fog: 1, light: 1, clouds: 5, grey: 0 }, rain: { fog: 0.65, light: 0.6, clouds: 16, grey: 0.45, rain: 1 },
    storm: { fog: 0.5, light: 0.42, clouds: 16, grey: 0.7, rain: 1.6, lightning: true }, snow: { fog: 0.6, light: 0.8, clouds: 12, grey: 0.35, pts: "snow" },
    fog: { fog: 0.28, light: 0.75, clouds: 0, grey: 0.3 }, fireflies: { fog: 1, light: 1, clouds: 4, grey: 0, pts: "fireflies" },
    petals: { fog: 0.95, light: 1, clouds: 6, grey: 0, pts: "petals" }, embers: { fog: 0.8, light: 0.9, clouds: 3, grey: 0.1, pts: "embers" },
    ash: { fog: 0.55, light: 0.7, clouds: 10, grey: 0.5, pts: "ash" }, aurora: { fog: 1, light: 1, clouds: 0, grey: 0, aurora: true },
  };
  let wx = WEATHER.clear, wxMix = { fog: 1, light: 1, grey: 0, aurora: 0 }, flash = 0;

  /* ---------------- flora ---------------- */
  function addFlora(f) {
    const type = WS.FLORA_TYPES.includes(f.type) ? f.type : "bush";
    const count = Math.round(clamp(f.density ?? 0.5, 0, 1) * WS.FLORA_MAX[type]);
    if (!count) return null;
    const r = rng(hashStr(type + (f.color || "") + W.terrain.seed));
    const geo = WS.floraGeo(type, f.color || "#5b8a46", r);
    const glow = type === "crystal" || (type === "mushroom" && f.glow);
    const mat = glow ? WS.glowMat(f.color || "#8fe3ff") : WS.flatMat();
    const mesh = new T.InstancedMesh(geo, mat, count);
    mesh.castShadow = type !== "flower" && type !== "reed";
    mesh.receiveShadow = true;
    const zone = f.zone || "all", wy = W.waterY, top = Math.max(W.H * 0.9, wy + 4);
    const inst = [];
    let tries = 0;
    while (inst.length < count && tries++ < count * 16) {
      const a = r() * PI * 2, d = Math.sqrt(r()) * LIMIT;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = heightAt(x, z);
      const t = W.hasWater ? (y - wy) / (top - wy) : y / top;
      if (W.hasWater && y < wy + (zone === "shore" ? 0.15 : 0.7)) continue;
      const ok = zone === "shore" ? t < 0.2 : zone === "low" ? t < 0.42 : zone === "mid" ? t > 0.18 && t < 0.72 : zone === "high" ? t > 0.5 : t < 0.88;
      if (!ok) continue;
      if (type !== "rock" && slopeAt(x, z) > 0.95) continue;
      if (Math.hypot(x, z) < 6) continue;
      inst.push({ x, z, s: (0.7 + r() * 0.7) * (type === "flower" ? 1 : clamp(f.size ?? 1, 0.5, 2.2)), ry: r() * PI * 2, delay: r() * 1.6, g: 0, hidden: false });
    }
    mesh.count = inst.length;
    const c = new T.Color();
    for (let i = 0; i < inst.length; i++) { c.setScalar(0.85 + r() * 0.3); mesh.setColorAt(i, c); }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const rec = { type, mesh, inst, born: W.time, growing: true, spec: f };
    W.flora.push(rec);
    writeFlora(rec, true);
    scene.add(mesh);
    return rec;
  }
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3(), _e = new T.Euler();
  function writeFlora(rec, initial) {
    let growing = false;
    const age = W.time - rec.born;
    for (let i = 0; i < rec.inst.length; i++) {
      const o = rec.inst[i];
      const g = o.hidden ? 0 : easeOut(clamp((age - o.delay) / 0.9, 0, 1));
      if (g < 1 && !o.hidden) growing = true;
      o.g = g;
      _v.set(o.x, heightAt(o.x, o.z) - 0.05, o.z);
      _q.setFromEuler(_e.set(0, o.ry, 0));
      _s.setScalar(Math.max(0.0001, o.s * g));
      rec.mesh.setMatrixAt(i, _m.compose(_v, _q, _s));
    }
    rec.mesh.instanceMatrix.needsUpdate = true;
    rec.growing = growing;
  }
  function clearFloraNear(x, z, r) {
    for (const rec of W.flora) { let ch = false; for (const o of rec.inst) if (!o.hidden && Math.hypot(o.x - x, o.z - z) < r) { o.hidden = true; ch = true; } if (ch) writeFlora(rec); }
  }

  /* ---------------- landmarks ---------------- */
  function findSpot(spec, radius) {
    const r = rng(hashStr(spec.name || spec.type || "x") + W.terrain.seed);
    const hint = spec.near || "random";
    const shore = ["dock", "pier", "shipwreck"].includes(spec.type);
    const wy = W.waterY;
    let best = null, bestScore = -1e9;
    let peakY = -1e9;
    for (let i = 0; i < 400; i++) { const a = r() * PI * 2, d = Math.sqrt(r()) * 120; peakY = Math.max(peakY, heightAt(Math.cos(a) * d, Math.sin(a) * d)); }
    for (let i = 0; i < 160; i++) {
      const a = r() * PI * 2, d = 8 + Math.sqrt(r()) * 125;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = heightAt(x, z);
      let s = 0;
      if (shore) {
        if (!W.hasWater) { s -= 50; } else {
          if (y < wy - 1.2 || y > wy + 2) continue;
          let deep = false;
          for (let k = 0; k < 8; k++) { const b = k / 8 * PI * 2; if (heightAt(x + Math.cos(b) * 9, z + Math.sin(b) * 9) < wy - 1.5) deep = true; }
          if (!deep) continue;
        }
      } else {
        if (W.hasWater && y < wy + 1.4) continue;
        s -= slopeAt(x, z) * 30;
      }
      for (const L of W.landmarks) { const dd = Math.hypot(L.pos.x - x, L.pos.z - z); if (dd < L.radius + radius + 10) s -= 80; else s -= Math.max(0, 40 - dd) * 0.6; }
      if (hint === "center") s -= d * 0.8;
      else if (hint === "north") s += -z * 0.5;
      else if (hint === "south") s += z * 0.5;
      else if (hint === "east") s += x * 0.5;
      else if (hint === "west") s += -x * 0.5;
      else if (hint === "peak") s += (y - peakY) * 3 + 20;
      else if (hint === "valley") s -= (y - wy) * 2;
      else if (hint === "shore" && W.hasWater) s -= Math.abs(y - (wy + 2)) * 8;
      else s += r() * 20;
      if (d < 14 && hint !== "center") s -= 30;
      if (s > bestScore) { bestScore = s; best = { x, z, y }; }
    }
    return best || { x: (r() - 0.5) * 60, z: (r() - 0.5) * 60, y: 0 };
  }

  function addLandmark(spec) {
    const built = WS.buildLandmark(spec);
    const p = findSpot(spec, built.radius);
    const shore = built.shore;
    let baseY = p.y;
    if (!shore) {
      const samples = [0, 1, 2, 3, 4, 5].map(k => heightAt(p.x + Math.cos(k) * built.radius * 0.6, p.z + Math.sin(k) * built.radius * 0.6));
      baseY = (Math.max(...samples) + Math.min(...samples)) / 2;
      if (W.hasWater) baseY = Math.max(baseY, W.waterY + 1.2);
      flatten(p.x, p.z, built.radius * 1.05, baseY);
      rebuildTerrain();
      relevel();
    } else baseY = Math.max(p.y, W.waterY - 0.9);
    clearFloraNear(p.x, p.z, built.radius * 1.15);
    const g = built.group;
    g.position.set(p.x, baseY, p.z);
    let face = Math.atan2(-p.x, -p.z);
    if (shore && W.hasWater) {
      let bestA = 0, low = 1e9;
      for (let k = 0; k < 16; k++) { const b = k / 16 * PI * 2, hh = heightAt(p.x + Math.sin(b) * 10, p.z + Math.cos(b) * 10); if (hh < low) { low = hh; bestA = b; } }
      face = bestA;
    }
    g.rotation.y = face;
    scene.add(g);
    const rec = Object.assign(built, {
      name: spec.name || "Unnamed place", about: spec.about || "", spec, pos: new T.Vector3(p.x, baseY, p.z), baseY, born: W.time,
      solid: (SOLID[built.type] || 0) * (Number(spec.scale) || 1), glowColor: built.light ? col(spec.glow || "#ffc477") : null, fire: !!built.fire,
    });
    g.position.y = baseY - built.height - 2;
    W.landmarks.push(rec);
    return rec;
  }
  function relevel() {
    for (const rec of W.flora) writeFlora(rec);
    for (const L of W.landmarks) if (!L.shore) { /* landmarks own their flattened pad */ }
    for (const n of W.npcs) n.group.position.y = groundY(n.group.position.x, n.group.position.z);
    if (player.placed) player.pos.y = Math.max(player.pos.y, groundY(player.pos.x, player.pos.z));
  }

  /* ---------------- characters ---------------- */
  function groundY(x, z) { const h = heightAt(x, z); return W.hasWater ? Math.max(h, W.waterY - 0.95) : h; }
  function addNpc(spec) {
    const g = WS.buildCharacter(spec.look || {});
    const home = W.landmarks.find(l => l.name && spec.home && l.name.toLowerCase() === String(spec.home).toLowerCase())
      || W.landmarks[hashStr(spec.name || "") % Math.max(1, W.landmarks.length)];
    const r = rng(hashStr(spec.name || "npc"));
    let hx = 0, hz = 0;
    if (home) { const a = r() * PI * 2, d = home.radius + 2.5; hx = home.pos.x + Math.cos(a) * d; hz = home.pos.z + Math.sin(a) * d; }
    else { hx = (r() - 0.5) * 40; hz = (r() - 0.5) * 40; }
    if (W.hasWater && heightAt(hx, hz) < W.waterY + 0.5 && home) { hx = home.pos.x; hz = home.pos.z + home.radius + 1.5; }
    g.position.set(hx, groundY(hx, hz), hz);
    g.scale.multiplyScalar(0.001);
    scene.add(g);
    const n = { name: spec.name || "Stranger", role: spec.role || "", spec, group: g, home: { x: hx, z: hz }, target: null, wait: r() * 4, speed: 1.6 + r() * 0.8,
      talking: false, follow: false, born: W.time, fullScale: WS.clamp(Number(spec.look && spec.look.height) || 1, 0.8, 1.3) };
    W.npcs.push(n);
    return n;
  }
  function removeEntity(name) {
    const key = String(name || "").toLowerCase();
    const li = W.landmarks.findIndex(l => l.name.toLowerCase() === key);
    if (li >= 0) { const L = W.landmarks[li]; W.landmarks.splice(li, 1); sinking.push({ obj: L.group, t0: W.time, from: L.group.position.y, by: L.height + 3 }); return "landmark"; }
    const ni = W.npcs.findIndex(n => n.name.toLowerCase() === key);
    if (ni >= 0) { const n = W.npcs[ni]; W.npcs.splice(ni, 1); sinking.push({ obj: n.group, t0: W.time, from: n.group.position.y, by: 3 }); return "npc"; }
    return null;
  }
  const sinking = [];

  /* ---------------- player ---------------- */
  const playerG = WS.buildCharacter({ robe: "#5b7290", skin: "#e2b998", hat: "hood" });
  const lanternMesh = new T.Mesh(new T.BoxGeometry(0.22, 0.3, 0.22), WS.glowMat("#ffc98a"));
  lanternMesh.position.set(0, -0.78, 0.18);
  playerG.userData.parts.armR.add(lanternMesh);
  playerG.visible = false;
  scene.add(playerG);
  const player = { pos: new T.Vector3(), vy: 0, yaw: 0, placed: false, swimming: false, moving: false };
  const input = { x: 0, y: 0, run: false, jump: false };
  const cam = { yaw: 0.6, pitch: 0.32, dist: 11, target: new T.Vector3(), pos: new T.Vector3(40, 40, 40) };
  const ghostMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });

  function spawnPlayer() {
    let best = null, bestS = -1e9;
    const first = W.landmarks.find(l => !l.shore) || W.landmarks[0];
    const cx = first ? first.pos.x : 0, cz = first ? first.pos.z : 0;
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * PI * 18, d = (first ? first.radius + 6 : 0) + i * 0.4;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.hypot(x, z) > LIMIT - 5) continue;
      const y = heightAt(x, z);
      if (W.hasWater && y < W.waterY + 0.8) continue;
      const s = -slopeAt(x, z) * 20 - i * 0.05;
      if (s > bestS) { bestS = s; best = { x, z }; }
    }
    best = best || { x: 0, z: 0 };
    player.pos.set(best.x, groundY(best.x, best.z), best.z);
    player.vy = 0; player.placed = true;
    const look = first ? Math.atan2(first.pos.x - best.x, first.pos.z - best.z) : 0;
    player.yaw = look; cam.yaw = look + PI; cam.pitch = 0.28; cam.dist = 11;
    playerG.visible = true;
  }

  function stepPlayer(dt) {
    const f = { x: -Math.sin(cam.yaw), z: -Math.cos(cam.yaw) }, rt = { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) };
    let mx = f.x * input.y + rt.x * input.x, mz = f.z * input.y + rt.z * input.x;
    const len = Math.hypot(mx, mz);
    player.moving = len > 0.05;
    const ground = heightAt(player.pos.x, player.pos.z);
    player.swimming = W.hasWater && ground < W.waterY - 0.9;
    if (player.moving) {
      mx /= Math.max(1, len); mz /= Math.max(1, len);
      const sp = player.swimming ? 3.6 : input.run ? 11 : 5.8;
      let nx = player.pos.x + mx * sp * dt, nz = player.pos.z + mz * sp * dt;
      for (const L of W.landmarks) {
        if (!L.solid) continue;
        const dx = nx - L.pos.x, dz = nz - L.pos.z, d = Math.hypot(dx, dz), min = L.solid + 0.5;
        if (d < min && d > 0.001) { nx = L.pos.x + dx / d * min; nz = L.pos.z + dz / d * min; }
      }
      for (const n of W.npcs) {
        const dx = nx - n.group.position.x, dz = nz - n.group.position.z, d = Math.hypot(dx, dz);
        if (d < 0.9 && d > 0.001) { nx = n.group.position.x + dx / d * 0.9; nz = n.group.position.z + dz / d * 0.9; }
      }
      const rr = Math.hypot(nx, nz);
      if (rr > LIMIT) { nx *= LIMIT / rr; nz *= LIMIT / rr; }
      player.pos.x = nx; player.pos.z = nz;
      const want = Math.atan2(mx, mz);
      let dy = want - player.yaw; while (dy > PI) dy -= 2 * PI; while (dy < -PI) dy += 2 * PI;
      player.yaw += dy * Math.min(1, dt * 12);
    }
    const gy = groundY(player.pos.x, player.pos.z);
    if (input.jump && player.pos.y <= gy + 0.05 && !player.swimming) player.vy = 7.5;
    input.jump = false;
    player.vy -= 22 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y < gy) { player.pos.y = gy; player.vy = 0; }
    playerG.position.copy(player.pos);
    playerG.rotation.y = player.yaw;
    WS.animateCharacter(playerG, W.time, player.moving, input.run ? 1.35 : 1);
  }

  function stepNpcs(dt) {
    for (const n of W.npcs) {
      const g = n.group, age = W.time - n.born;
      if (age < 1.2) g.scale.setScalar(n.fullScale * easeOut(clamp(age / 0.9, 0.001, 1)));
      let moving = false;
      if (n.talking) {
        const want = Math.atan2(player.pos.x - g.position.x, player.pos.z - g.position.z);
        let d = want - g.rotation.y; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
        g.rotation.y += d * Math.min(1, dt * 6);
      } else {
        let tx, tz;
        if (n.follow) {
          const d = Math.hypot(player.pos.x - g.position.x, player.pos.z - g.position.z);
          if (d > 3.2) { tx = player.pos.x; tz = player.pos.z; }
        } else {
          if (!n.target) {
            n.wait -= dt;
            if (n.wait <= 0) {
              const a = Math.random() * PI * 2, d = 2 + Math.random() * 9;
              const x = n.home.x + Math.cos(a) * d, z = n.home.z + Math.sin(a) * d;
              if (!W.hasWater || heightAt(x, z) > W.waterY + 0.4) n.target = { x, z };
              n.wait = 2 + Math.random() * 6;
            }
          }
          if (n.target) { tx = n.target.x; tz = n.target.z; }
        }
        if (tx !== undefined) {
          const dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
          if (d < 0.4) n.target = null;
          else {
            const sp = (n.follow ? (d > 8 ? 9 : 5.5) : n.speed) * dt;
            g.position.x += dx / d * Math.min(sp, d); g.position.z += dz / d * Math.min(sp, d);
            const want = Math.atan2(dx, dz);
            let dd = want - g.rotation.y; while (dd > PI) dd -= 2 * PI; while (dd < -PI) dd += 2 * PI;
            g.rotation.y += dd * Math.min(1, dt * 5);
            moving = true;
          }
        }
      }
      g.position.y = groundY(g.position.x, g.position.z);
      WS.animateCharacter(g, W.time + n.speed * 10, moving, n.follow ? 1.3 : 0.8);
    }
  }

  /* ---------------- palette, time and weather ---------------- */
  function setPalette(p, dur = 1.4) {
    W.palFrom = {}; W.palTarget = {};
    for (const k in DEFAULT_PALETTE) {
      W.palFrom[k] = W.pal[k].clone();
      W.palTarget[k] = p && p[k] ? col(p[k], DEFAULT_PALETTE[k]) : W.pal[k].clone();
    }
    W.palT = dur > 0 ? 0 : 1; W.palDur = dur;
    if (!dur) { for (const k in W.palTarget) W.pal[k].copy(W.palTarget[k]); rebuildTerrain(true); }
  }
  function setHour(h, instant) { h = ((Number(h) % 24) + 24) % 24; W.hourTarget = h; if (instant) W.hour = h; }
  function setWeather(w) { W.weather = WEATHER[w] ? w : "clear"; wx = WEATHER[W.weather]; }

  const nightTop = col("#0a1330"), nightHor = col("#2a3556"), golden = col("#ff8f4f"), greyC = col("#6c737d");
  const tmpA = new T.Color(), tmpB = new T.Color();
  let night = 0;
  function applySky(dt) {
    const a = (W.hour - 5.6) / 13 * PI;
    const sd = new T.Vector3(Math.cos(a), Math.sin(a), -0.38).normalize();
    const dayF = smooth(-0.14, 0.22, sd.y);
    const gold = (1 - smooth(0.0, 0.32, Math.abs(sd.y))) * smooth(-0.2, 0.02, sd.y);
    night = 1 - dayF;
    const k = Math.min(1, dt * 1.5);
    wxMix.fog = lerp(wxMix.fog, wx.fog, k); wxMix.light = lerp(wxMix.light, wx.light, k); wxMix.grey = lerp(wxMix.grey, wx.grey, k);
    wxMix.aurora = lerp(wxMix.aurora, wx.aurora ? 1 : 0, k * 0.5);
    const P = W.pal;
    const top = tmpA.copy(nightTop).lerp(P.skyTop, dayF).lerp(greyC, wxMix.grey * 0.6 * dayF);
    const hor = tmpB.copy(nightHor).lerp(P.skyHorizon, dayF).lerp(golden, gold * 0.62).lerp(greyC, wxMix.grey * 0.55 * dayF);
    if (flash > 0) { top.lerp(col("#dfe6ff"), flash); hor.lerp(col("#dfe6ff"), flash); }
    skyU.uTop.value.copy(top); skyU.uHorizon.value.copy(hor);
    skyU.uBottom.value.copy(hor).multiplyScalar(0.8);
    skyU.uSunDir.value.copy(sd);
    skyU.uSunColor.value.copy(P.sun).lerp(golden, gold * 0.7).multiplyScalar(dayF * (1 - wxMix.grey * 0.8));
    skyU.uNight.value = night * (1 - wxMix.grey * 0.8);
    skyU.uAurora.value = wxMix.aurora;
    skyU.uAccent.value.copy(P.accent);
    scene.fog.color.copy(hor);
    const far = 340 * wxMix.fog;
    scene.fog.near = 40 + 50 * wxMix.fog; scene.fog.far = Math.max(90, far);
    const moon = sd.y < -0.05;
    const ld = moon ? new T.Vector3(-sd.x, Math.max(0.25, -sd.y), -sd.z).normalize() : new T.Vector3(sd.x, Math.max(0.08, sd.y), sd.z).normalize();
    sun.position.copy(player.placed ? player.pos : cam.target).addScaledVector(ld, 160);
    sun.target.position.copy(player.placed ? player.pos : cam.target);
    sun.intensity = (moon ? 0.4 : 0.22 + 0.72 * dayF) * wxMix.light + flash * 2;
    sun.color.copy(moon ? col("#8ea5ff") : tmpA.copy(P.sun).lerp(golden, gold * 0.75));
    hemi.color.copy(top).lerp(col("#ffffff"), 0.35);
    hemi.groundColor.copy(P.mid).multiplyScalar(0.45);
    hemi.intensity = (0.34 + 0.26 * dayF) * (0.6 + 0.4 * wxMix.light) + flash;
    waterU.uColor.value.copy(P.water).multiplyScalar(0.35 + 0.65 * dayF);
    waterU.uSky.value.copy(hor); waterU.uSunDir.value.copy(ld); waterU.uSunColor.value.copy(moon ? col("#8ea5ff").multiplyScalar(0.5) : skyU.uSunColor.value);
    cloudMat.color.copy(hor).lerp(col("#ffffff"), 0.55 * dayF).lerp(greyC, wxMix.grey * 0.7);
    const glowK = 0.35 + 1.5 * night;
    for (const m of WS.glowMats) m.emissiveIntensity = (m.userData.glowBase || 0.6) * glowK;
  }

  function stepWeather(dt) {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const kind = W.mode === "play" ? wx.pts : null;
    points.visible = !!kind;
    if (kind) {
      const P = W.pal;
      const conf = {
        snow: { c: "#ffffff", s: 0.3, op: 0.9, add: false }, fireflies: { c: "#fff27a", s: 0.2, op: 0.95, add: true },
        petals: { c: "#ffc3d6", s: 0.26, op: 0.95, add: false }, embers: { c: "#ff9a3c", s: 0.3, op: 0.95, add: true }, ash: { c: "#9c9c9c", s: 0.3, op: 0.7, add: false },
      }[kind];
      pMat.color.copy(col(kind === "fireflies" || kind === "petals" ? (W.palTarget ? P.accent : conf.c) : conf.c));
      if (kind === "snow" || kind === "ash" || kind === "embers") pMat.color.set(conf.c);
      pMat.size = conf.s; pMat.opacity = conf.op * (kind === "fireflies" ? 0.25 + night : 1);
      pMat.blending = conf.add ? T.AdditiveBlending : T.NormalBlending;
      const t = W.time;
      for (let i = 0; i < PCOUNT; i++) {
        const s = pSeed[i]; let x = pPos[i * 3], y = pPos[i * 3 + 1], z = pPos[i * 3 + 2];
        if (kind === "snow") { y -= dt * (1.4 + s); x += Math.sin(t * 0.7 + s * 20) * dt * 0.6; }
        else if (kind === "ash") { y -= dt * (0.6 + s * 0.6); x += dt * 0.4; }
        else if (kind === "petals") { y -= dt * (0.8 + s * 0.5); x += Math.sin(t + s * 30) * dt * 1.4 + dt * 0.8; z += Math.cos(t * 0.8 + s * 10) * dt * 0.6; }
        else if (kind === "embers") { y += dt * (1.2 + s * 1.5); x += Math.sin(t * 2 + s * 40) * dt * 0.5; }
        else if (kind === "fireflies") { x += Math.sin(t * 0.6 + s * 50) * dt * 0.9; z += Math.cos(t * 0.5 + s * 30) * dt * 0.9; y += Math.sin(t * 1.3 + s * 20) * dt * 0.4; }
        pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
        const wxp = ((x - cx + BOX.x / 2) % BOX.x + BOX.x) % BOX.x - BOX.x / 2;
        const wzp = ((z - cz + BOX.z / 2) % BOX.z + BOX.z) % BOX.z - BOX.z / 2;
        pPos[i * 3] = cx + wxp; pPos[i * 3 + 2] = cz + wzp;
        const base = kind === "fireflies" ? groundY(pPos[i * 3], pPos[i * 3 + 2]) + 0.5 : cy - 16;
        const span = kind === "fireflies" ? 5 : BOX.y;
        if (pPos[i * 3 + 1] < base) pPos[i * 3 + 1] = base + span;
        if (pPos[i * 3 + 1] > base + span) pPos[i * 3 + 1] = base;
      }
      pGeo.attributes.position.needsUpdate = true;
    }
    const rk = W.mode === "play" ? wx.rain || 0 : 0;
    rain.visible = rk > 0;
    if (rk) {
      for (let i = 0; i < RCOUNT; i++) {
        let x = rPos[i * 6], y = rPos[i * 6 + 1] - dt * 38 * rk, z = rPos[i * 6 + 2];
        x = cx + (((x - cx + BOX.x / 2) % BOX.x) + BOX.x) % BOX.x - BOX.x / 2;
        z = cz + (((z - cz + BOX.z / 2) % BOX.z) + BOX.z) % BOX.z - BOX.z / 2;
        if (y < cy - 18) y = cy + 22 + Math.random() * 8;
        rPos[i * 6] = x; rPos[i * 6 + 1] = y; rPos[i * 6 + 2] = z;
        rPos[i * 6 + 3] = x + 0.08 * rk; rPos[i * 6 + 4] = y + 1.4; rPos[i * 6 + 5] = z + 0.04;
      }
      rGeo.attributes.position.needsUpdate = true;
    }
    flash = Math.max(0, flash - dt * 3.5);
    if (wx.lightning && Math.random() < dt * 0.12) { flash = 0.9; api.onThunder && api.onThunder(); }
    let vis = 0;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt; if (c.position.x > 380) c.position.x = -380;
      c.visible = vis++ < wx.clouds;
    }
  }

  /* ---------------- glow light pool ---------------- */
  let poolTimer = 0;
  const _lp = new T.Vector3();
  function assignLights(dt) {
    poolTimer -= dt;
    const focus = player.placed ? player.pos : cam.target;
    if (poolTimer <= 0) {
      poolTimer = 0.6;
      const cand = [];
      for (const L of W.landmarks) if (L.light) {
        _lp.copy(L.light).applyMatrix4(L.group.matrixWorld);
        cand.push({ p: _lp.clone(), c: L.glowColor || col("#ffc477"), fire: L.fire, d: _lp.distanceTo(focus) });
      }
      cand.sort((a, b) => a.d - b.d);
      for (let i = 0; i < pool.length; i++) { pool[i].userData.c = cand[i] || null; }
    }
    for (const l of pool) {
      const c = l.userData.c;
      if (!c) { l.intensity = 0; continue; }
      l.position.copy(c.p); l.color.copy(c.c);
      l.intensity = (c.fire ? 0.9 + 1.4 * night : 2.0 * night) * (c.fire ? 0.9 + Math.sin(W.time * 17) * 0.1 : 1);
    }
    lantern.position.copy(player.pos).add(_lp.set(Math.sin(player.yaw) * 0.4, 1.1, Math.cos(player.yaw) * 0.4));
    lantern.intensity = player.placed ? 1.6 * night : 0;
  }

  /* ---------------- camera ---------------- */
  function stepCamera(dt) {
    if (W.mode === "orbit") {
      W.orbitA += dt * 0.045;
      const r = 150, h = 62 + W.H * 0.5;
      cam.pos.set(Math.cos(W.orbitA) * r, h, Math.sin(W.orbitA) * r);
      cam.target.set(0, W.H * 0.25, 0);
      camera.position.lerp(cam.pos, Math.min(1, dt * 1.5));
      camera.lookAt(cam.target);
      return;
    }
    const head = _v.copy(player.pos).add(new T.Vector3(0, 1.7, 0));
    cam.pitch = clamp(cam.pitch, -0.25, 1.25);
    cam.dist = clamp(cam.dist, 3.5, 26);
    // When a hill hides the player, lift the camera over it; pull in only as a last resort.
    const offAt = p => new T.Vector3(Math.sin(cam.yaw) * Math.cos(p), Math.sin(p), Math.cos(cam.yaw) * Math.cos(p)).multiplyScalar(cam.dist);
    const blockedAt = o => { for (let k = 2; k <= 14; k++) { const f = k / 14; if (heightAt(head.x + o.x * f, head.z + o.z * f) + 0.5 > head.y + o.y * f) return (k - 1.5) / 14; } return 1; };
    let pitch = cam.pitch, reach = blockedAt(offAt(pitch));
    while (reach < 1 && pitch < 1.15) { pitch += 0.08; reach = blockedAt(offAt(pitch)); }
    if (reach < 1) { pitch = cam.pitch; reach = Math.max(0.4, blockedAt(offAt(pitch))); }
    cam.effPitch = lerp(cam.effPitch ?? cam.pitch, pitch, Math.min(1, dt * 5));
    cam.reach = lerp(cam.reach || 1, reach, Math.min(1, dt * (reach < (cam.reach || 1) ? 12 : 3)));
    const want = head.clone().addScaledVector(offAt(cam.effPitch), cam.reach);
    const floor = Math.max(heightAt(want.x, want.z) + 0.7, W.hasWater ? W.waterY + 0.5 : -1e9);
    if (want.y < floor) want.y = floor;
    cam.pos.lerp(want, Math.min(1, dt * 9));
    camera.position.copy(cam.pos);
    cam.target.lerp(head, Math.min(1, dt * 12));
    camera.lookAt(cam.target);
  }

  /* ---------------- task queue: paces how a world assembles ---------------- */
  const queue = [];
  let queueBusyUntil = 0;
  function enqueue(fn, hold = 0.4) { queue.push({ fn, hold }); }
  function stepQueue() {
    if (!queue.length || W.time < queueBusyUntil) return;
    const job = queue.shift();
    try { job.fn(); } catch (e) { console.warn("world op failed", e); }
    queueBusyUntil = W.time + job.hold;
  }

  /* ---------------- big operations ---------------- */
  let riseFrom = 1, riseT = 1, riseDur = 2.4;
  function setTerrain(tp, animate = true) {
    W.terrain = Object.assign({}, W.terrain, tp);
    genHeights(W.terrain);
    for (const L of W.landmarks) if (!L.shore) { flatten(L.pos.x, L.pos.z, L.radius * 1.05, L.baseY); }
    rebuildTerrain();
    if (animate) { riseFrom = W.landmarks.length ? 0.6 : 0.02; riseT = 0; terrain.scale.y = riseFrom; }
    else { riseT = 1; terrain.scale.y = 1; }
    water.position.y = W.hasWater ? W.waterY : -999;
    water.visible = W.hasWater;
    relevel();
    for (const L of W.landmarks) {
      if (L.shore) { L.baseY = Math.max(heightAt(L.pos.x, L.pos.z), W.waterY - 0.9); }
      L.pos.y = L.baseY; L.group.position.y = L.baseY;
    }
  }
  function clearWorld() {
    for (const L of W.landmarks) sinking.push({ obj: L.group, t0: W.time, from: L.group.position.y, by: L.height + 3 });
    for (const n of W.npcs) sinking.push({ obj: n.group, t0: W.time, from: n.group.position.y, by: 3 });
    for (const f of W.flora) sinking.push({ obj: f.mesh, t0: W.time, from: 0, by: 6, dispose: true });
    W.landmarks = []; W.npcs = []; W.flora = [];
    riseFrom = terrain.scale.y; riseT = -1;
    player.placed = false; playerG.visible = false;
    queue.length = 0;
  }

  /* ---------------- minimap image ---------------- */
  let mapDirty = true;
  const mapCanvas = document.createElement("canvas"); mapCanvas.width = mapCanvas.height = 256;
  function drawMap() {
    if (!mapDirty) return;
    mapDirty = false;
    const MS = mapCanvas.width, x = mapCanvas.getContext("2d"), img = x.createImageData(MS, MS), P = W.pal;
    for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
      const wxp = -HALF + (i + 0.5) * (SIZE / MS), wzp = -HALF + (j + 0.5) * (SIZE / MS);
      const h = heightAt(wxp, wzp);
      let c;
      if (W.hasWater && h < W.waterY) c = tmpA.copy(P.water).multiplyScalar(0.75 + 0.25 * clamp(1 - (W.waterY - h) / 10, 0, 1));
      else { const sx = heightAt(wxp + 2, wzp) - heightAt(wxp - 2, wzp); c = faceColor(h, 0.9, (i * 7 + j * 13) % 1000).multiplyScalar(1 - clamp(sx * 0.08, -0.25, 0.25)); }
      const o = (j * MS + i) * 4;
      img.data[o] = clamp(c.r * 255, 0, 255); img.data[o + 1] = clamp(c.g * 255, 0, 255); img.data[o + 2] = clamp(c.b * 255, 0, 255); img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }

  /* ---------------- loop ---------------- */
  let last = performance.now(), frameCbs = [], running = true;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function frame(now, manual) {
    if (!running && !manual) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    W.time += dt;
    stepQueue();
    if (W.palT < 1) {
      W.palT = Math.min(1, W.palT + dt / (W.palDur || 1));
      const k = ease(W.palT);
      for (const key in W.palTarget) W.pal[key].copy(W.palFrom[key]).lerp(W.palTarget[key], k);
      if (Math.floor(W.palT * 30) !== Math.floor((W.palT - dt / (W.palDur || 1)) * 30) || W.palT === 1) rebuildTerrain(true);
    }
    if (riseT < 1 && riseT >= 0) { riseT = Math.min(1, riseT + dt / riseDur); terrain.scale.y = lerp(riseFrom, 1, easeOut(riseT)); }
    else if (riseT < 0) { terrain.scale.y = Math.max(0.02, terrain.scale.y - dt * 0.9); }
    let dh = W.hourTarget - W.hour; if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
    if (Math.abs(dh) > 0.01) W.hour = (W.hour + dh * Math.min(1, dt * 0.8) + 24) % 24;
    else if (W.timeFlow) { W.hour = (W.hour + dt * W.timeFlow / 60) % 24; W.hourTarget = W.hour; }
    for (const L of W.landmarks) {
      const age = W.time - L.born;
      if (age < 1.6) L.group.position.y = lerp(L.baseY - L.height - 2, L.baseY, easeOut(clamp(age / 1.4, 0, 1)));
      if (L.update) L.update(W.time, dt);
      if (L.beam) L.beam.opacity = 0.03 + 0.2 * night;
    }
    for (let i = sinking.length - 1; i >= 0; i--) {
      const s = sinking[i], k = clamp((W.time - s.t0) / 1.2, 0, 1);
      if (s.obj.isInstancedMesh) s.obj.scale.setScalar(Math.max(0.001, 1 - k)); else s.obj.position.y = s.from - s.by * ease(k);
      if (k >= 1) { scene.remove(s.obj); s.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); sinking.splice(i, 1); }
    }
    for (const rec of W.flora) if (rec.growing) writeFlora(rec);
    if (player.placed && W.mode === "play") stepPlayer(dt);
    stepNpcs(dt);
    for (const gh of W.ghosts.values()) {
      gh.group.position.x = lerp(gh.group.position.x, gh.tx, Math.min(1, dt * 8));
      gh.group.position.z = lerp(gh.group.position.z, gh.tz, Math.min(1, dt * 8));
      gh.group.position.y = groundY(gh.group.position.x, gh.group.position.z);
      let d = gh.ry - gh.group.rotation.y; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
      gh.group.rotation.y += d * Math.min(1, dt * 8);
      WS.animateCharacter(gh.group, W.time, gh.moving, 1);
    }
    stepCamera(dt);
    applySky(dt);
    stepWeather(dt);
    assignLights(dt);
    sky.position.copy(camera.position);
    skyU.uTime.value = W.time; waterU.uTime.value = W.time;
    water.position.x = Math.round(camera.position.x / 14) * 14; water.position.z = Math.round(camera.position.z / 14) * 14;
    drawMap();
    for (const cb of frameCbs) cb(dt);
    renderer.render(scene, camera);
    if (!manual) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------------- public API ---------------- */
  const _pv = new T.Vector3();
  const api = {
    W, scene, camera, renderer, player, cam, input, mapCanvas, LIMIT, HALF,
    enqueue, queueLength: () => queue.length + (W.time < queueBusyUntil ? 1 : 0),
    setPalette, setTerrain, addFlora, addLandmark, addNpc, removeEntity, setWeather, setHour, clearWorld, spawnPlayer, heightAt, groundY,
    setMode(m) { W.mode = m; if (m === "play" && !player.placed) spawnPlayer(); },
    setTimeFlow(v) { W.timeFlow = v; },
    look(dx, dy) { cam.yaw -= dx * 0.0055; cam.pitch += dy * 0.0045; },
    zoom(d) { cam.dist = clamp(cam.dist * (1 + d * 0.0012), 3.5, 26); },
    onFrame(cb) { frameCbs.push(cb); },
    project(v) {
      _pv.copy(v).project(camera);
      return { x: (_pv.x * 0.5 + 0.5) * canvas.clientWidth, y: (-_pv.y * 0.5 + 0.5) * canvas.clientHeight, on: _pv.z < 1 && Math.abs(_pv.x) < 1.1 && Math.abs(_pv.y) < 1.1 };
    },
    nightness: () => night,
    flashSky() { flash = 1; },
    capture() { renderer.render(scene, camera); return canvas.toDataURL("image/jpeg", 0.92); },
    setGhost(id, d) {
      let gh = W.ghosts.get(id);
      if (!gh) {
        const g = WS.buildCharacter({ robe: d.color || "#88a", hat: "hood" });
        g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; } });
        scene.add(g);
        gh = { group: g, tx: d.x, tz: d.z, ry: d.ry || 0, moving: false };
        g.position.set(d.x, groundY(d.x, d.z), d.z);
        W.ghosts.set(id, gh);
      }
      gh.moving = Math.hypot(gh.tx - d.x, gh.tz - d.z) > 0.05;
      gh.tx = d.x; gh.tz = d.z; gh.ry = d.ry || 0; gh.name = d.name;
      return gh;
    },
    removeGhost(id) { const gh = W.ghosts.get(id); if (gh) { scene.remove(gh.group); W.ghosts.delete(id); } },
    debugStep(n = 1, ms = 33) { for (let i = 0; i < n; i++) { last = performance.now() - ms; frame(performance.now(), true); } },
    pause(v) { running = !v; if (!v) { last = performance.now(); requestAnimationFrame(frame); } },
  };
  return api;
}

WS.createWorld = createWorld;
WS.DEFAULT_PALETTE = DEFAULT_PALETTE;
})();

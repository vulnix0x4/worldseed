/* Worldseed builders: procedural landmarks, flora templates and characters.
   Everything is assembled from primitives so any world Claude describes can be drawn. */
(() => {
"use strict";
const T = THREE;
const { part, merge, M, G, col, shade, mixc, flatMat, rng } = WS;
const PI = Math.PI;

const glowMats = [];          // emissive materials, brightened by the engine at night
function glowMat(c) {
  const m = WS.nearFade(new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: col(c), emissiveIntensity: 0.6, roughness: 0.6 }));
  m.userData.glowBase = 0.6;
  glowMats.push(m);
  return m;
}
function solidMesh(parts, opts) {
  const m = new T.Mesh(merge(parts), flatMat(opts));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* A small kit so each builder reads like a recipe. */
function kit(o) {
  const solid = [], glow = [], group = new T.Group();
  const main = col(o.color, "#b8ab96");
  const k = {
    main, glowC: o.glow ? col(o.glow) : null,
    stone: mixc(main, "#9b978f", 0.55), wood: col("#7a5638"), dark: shade(main, 0.45), trim: shade(main, 0.72),
    add(geo, c, m) { solid.push(part(geo, c, m)); },
    glow(geo, c, m) { glow.push(part(geo, c || "#ffffff", m)); },
    group,
    finish(extra = {}) {
      if (solid.length) group.add(solidMesh(solid));
      if (glow.length) { const gm = new T.Mesh(merge(glow), glowMat(k.glowC || "#ffd27a")); group.add(gm); }
      return Object.assign({ group, radius: 6, height: 8, light: null, update: null }, extra);
    },
  };
  return k;
}

/* ---------------------------------------------------------------- landmarks */
const L = {};

L.tower = (o, r) => {
  const k = kit(o);
  k.add(G.cyl(2.3, 2.7, 14, 9), k.stone, M(0, 7));
  for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; k.add(G.box(1, 1.2, 1), k.stone, M(Math.cos(a) * 2.4, 14.5, Math.sin(a) * 2.4, 0, -a)); }
  k.add(G.cone(3, 5, 9), k.main, M(0, 17.6));
  k.add(G.box(1.2, 2.2, 0.4), k.dark, M(0, 1.1, 2.6));
  for (const y of [6, 10]) k.glow(G.box(0.6, 1.1, 0.3), "#fff", M(0, y, 2.45));
  return k.finish({ radius: 4, height: 20, light: new T.Vector3(0, 10, 3) });
};

L.cottage = (o, r) => {
  const k = kit(o);
  k.add(G.box(6, 3.6, 5), mixc(k.main, "#efe6d6", 0.5), M(0, 1.8));
  k.add(G.cyl(3.6, 3.6, 7, 3), k.main, M(0, 4.9, 0, 0, 0, PI / 2, 1, 1, 1));
  k.add(G.box(0.9, 2.5, 0.9), k.stone, M(1.8, 6, -1));
  k.add(G.box(1.2, 2.1, 0.2), k.wood, M(0, 1.05, 2.55));
  k.glow(G.box(1, 0.9, 0.15), "#fff", M(-1.8, 2, 2.55)); k.glow(G.box(1, 0.9, 0.15), "#fff", M(1.8, 2, 2.55));
  return k.finish({ radius: 5, height: 7, light: new T.Vector3(0, 2, 3.5) });
};

L.hut = (o, r) => {
  const k = kit(o);
  k.add(G.cyl(2.6, 2.8, 2.6, 10), mixc(k.main, "#cdb48c", 0.6), M(0, 1.3));
  k.add(G.cone(3.8, 3.6, 10), k.main, M(0, 4.3));
  k.add(G.box(1, 1.8, 0.4), k.dark, M(0, 0.9, 2.6));
  k.glow(G.box(0.6, 0.6, 0.2), "#fff", M(2.2, 1.6, 1.2, 0, PI / 3));
  return k.finish({ radius: 4, height: 6, light: new T.Vector3(0, 1.5, 3) });
};

L.temple = (o, r) => {
  const k = kit(o), s = k.stone;
  k.add(G.box(14, 0.8, 10), shade(s, 0.9), M(0, 0.4)); k.add(G.box(12.4, 0.8, 8.4), s, M(0, 1.2));
  for (let i = 0; i < 6; i++) for (const z of [-3.4, 3.4]) k.add(G.cyl(0.55, 0.62, 6, 8), mixc(s, "#ffffff", 0.2), M(-5 + i * 2, 4.6, z));
  k.add(G.box(13, 0.8, 9), s, M(0, 8)); k.add(G.cyl(5.2, 5.2, 13, 3), k.main, M(0, 9.6, 0, 0, 0, PI / 2, 1, 0.35, 1));
  k.glow(G.box(1.2, 1.4, 1.2), "#fff", M(0, 2.3, 0));
  return k.finish({ radius: 8, height: 11, light: new T.Vector3(0, 3, 0) });
};

L.ruins = (o, r) => {
  const k = kit(o), s = k.stone;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * PI * 2, rr = 5 + r() * 1.5, h = 1.5 + r() * 6;
    k.add(G.cyl(0.6, 0.7, h, 7), s, M(Math.cos(a) * rr, h / 2, Math.sin(a) * rr, (r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15));
  }
  k.add(G.cyl(0.6, 0.6, 6, 7), shade(s, 0.9), M(1, 0.6, 1.5, 0, 0.6, PI / 2));
  k.add(G.box(7, 3, 0.9), shade(s, 0.85), M(-1, 1.5, -4, 0, 0.2));
  for (let i = 0; i < 6; i++) k.add(G.box(1, 0.7, 1.3), s, M((r() - 0.5) * 9, 0.35, (r() - 0.5) * 9, 0, r() * 3));
  k.add(G.box(10, 0.3, 10), shade(s, 0.75), M(0, 0.15));
  return k.finish({ radius: 7, height: 8 });
};

L.lighthouse = (o, r) => {
  const k = kit(o), white = col("#f2efe8");
  for (let i = 0; i < 6; i++) k.add(G.cyl(2.3 - (i + 1) * 0.18, 2.3 - i * 0.18, 2.6, 12), i % 2 ? k.main : white, M(0, 1.3 + i * 2.6));
  k.add(G.cyl(1.9, 1.9, 0.4, 12), k.dark, M(0, 15.8));
  k.glow(G.cyl(0.9, 0.9, 1.6, 8), "#fff", M(0, 16.8));
  k.add(G.cone(1.4, 1.6, 8), k.dark, M(0, 18.4));
  k.add(G.box(1, 1.9, 0.3), k.dark, M(0, 0.95, 2.3));
  const beamMat = new T.MeshBasicMaterial({ color: k.glowC || col("#fff3c4"), transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  const beam = new T.Mesh(new T.ConeGeometry(3.4, 40, 16, 1, true), beamMat);
  beam.geometry.translate(0, -20, 0); beam.rotation.z = PI / 2;
  const pivot = new T.Group(); pivot.position.y = 16.8; pivot.add(beam); k.group.add(pivot);
  beamMat.userData.night = true;
  return k.finish({ radius: 4, height: 19, light: new T.Vector3(0, 16.8, 0), beam: beamMat, update: (t) => { pivot.rotation.y = t * 0.6; } });
};

L.windmill = (o, r) => {
  const k = kit(o);
  k.add(G.cyl(1.7, 2.6, 9, 8), mixc(k.main, "#e9e0cf", 0.5), M(0, 4.5));
  k.add(G.cone(2.2, 2.6, 8), k.main, M(0, 10.3));
  k.add(G.box(1.1, 2, 0.3), k.wood, M(0, 1, 2.45));
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * PI * 2;
    blades.push(part(G.box(0.25, 7, 0.1), k.wood, M(Math.cos(a) * 3.6, Math.sin(a) * 3.6, 0, 0, 0, a - PI / 2)));
    blades.push(part(G.box(1.4, 5.5, 0.05), "#efe9dc", M(Math.cos(a) * 3.9 + Math.cos(a + PI / 2) * 0.8, Math.sin(a) * 3.9 + Math.sin(a + PI / 2) * 0.8, 0.05, 0, 0, a - PI / 2)));
  }
  blades.push(part(G.cyl(0.4, 0.4, 0.8, 8), k.dark, M(0, 0, 0, PI / 2)));
  const rotor = new T.Mesh(merge(blades), flatMat()); rotor.castShadow = true;
  const hub = new T.Group(); hub.position.set(0, 8.2, 2.2); hub.add(rotor); k.group.add(hub);
  return k.finish({ radius: 5, height: 13, update: (t, dt) => { rotor.rotation.z -= dt * 0.7; } });
};

L.stones = (o, r) => {
  const k = kit(o), s = mixc(k.main, "#8d8a83", 0.6), n = 9;
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2, h = 3.6 + r() * 1.8;
    k.add(G.box(1.3, h, 0.8), shade(s, 0.85 + r() * 0.3), M(Math.cos(a) * 7, h / 2, Math.sin(a) * 7, (r() - 0.5) * 0.12, -a, (r() - 0.5) * 0.1));
    if (i % 3 === 0) { const b = a + PI / n; k.add(G.box(3.6, 0.7, 0.9), s, M(Math.cos(b) * 7, 5.4, Math.sin(b) * 7, 0, -b + PI / 2)); }
  }
  k.add(G.box(2.6, 0.9, 1.4), shade(s, 0.8), M(0, 0.45));
  k.glow(G.octa(0.5), "#fff", M(0, 1.6, 0));
  return k.finish({ radius: 9, height: 6, light: new T.Vector3(0, 2, 0) });
};

L.statue = (o, r) => {
  const k = kit(o), s = k.stone;
  k.add(G.box(4.4, 2, 4.4), shade(s, 0.85), M(0, 1)); k.add(G.box(3.6, 0.6, 3.6), s, M(0, 2.3));
  k.add(G.cone(1.7, 6.5, 7), k.main, M(0, 5.8)); k.add(G.ico(0.95, 0), k.main, M(0, 9.6));
  k.add(G.cyl(0.3, 0.35, 3.6, 6), k.main, M(1.1, 9.4, 0, 0, 0, -0.5));
  k.glow(G.octa(0.55), "#fff", M(2.1, 11.3, 0));
  return k.finish({ radius: 4, height: 12, light: new T.Vector3(2, 11, 0) });
};

L.campfire = (o, r) => {
  const k = kit(o);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.add(G.dodeca(0.45), "#7d7a74", M(Math.cos(a) * 1.3, 0.25, Math.sin(a) * 1.3)); }
  k.add(G.cyl(0.2, 0.2, 2, 6), k.wood, M(0, 0.3, 0, 0, 0.4, PI / 2)); k.add(G.cyl(0.2, 0.2, 2, 6), k.wood, M(0, 0.4, 0, 0, -0.6, PI / 2));
  for (const a of [0.3, 2.4, 4.4]) k.add(G.cyl(0.35, 0.35, 3, 7), k.wood, M(Math.cos(a) * 3.6, 0.35, Math.sin(a) * 3.6, 0, -a, PI / 2));
  const fm = glowMat(k.glowC || "#ff8a2a");
  fm.userData.glowBase = 1.4;
  const flame = new T.Mesh(merge([part(G.cone(0.7, 1.8, 6), "#ffb347", M(0, 1.1)), part(G.cone(0.45, 1.3, 6), "#ffe08a", M(0.2, 1.0, 0.1))]), fm);
  k.group.add(flame);
  return k.finish({ radius: 4.5, height: 2, light: new T.Vector3(0, 1.6, 0), fire: true,
    update: (t) => { const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07; flame.scale.set(1, f, 1); flame.rotation.y = t * 0.5; } });
};

L.well = (o, r) => {
  const k = kit(o);
  k.add(G.cyl(1.6, 1.7, 1.4, 10), k.stone, M(0, 0.7)); k.add(G.cyl(1.2, 1.2, 0.2, 10), "#24384a", M(0, 1.2));
  for (const x of [-1.5, 1.5]) k.add(G.box(0.25, 3.2, 0.25), k.wood, M(x, 2.1, 0));
  k.add(G.cyl(2.1, 2.1, 3.6, 3), k.main, M(0, 4, 0, 0, 0, PI / 2, 1, 0.45, 1));
  k.add(G.cyl(0.35, 0.3, 0.5, 7), k.wood, M(0, 2.3, 0));
  return k.finish({ radius: 3, height: 5 });
};

L.obelisk = (o, r) => {
  const k = kit(o);
  k.add(G.box(3, 1, 3), shade(k.stone, 0.85), M(0, 0.5));
  k.add(G.cyl(0.7, 1.2, 14, 4), k.main, M(0, 8, 0, 0, PI / 4));
  k.glow(G.cone(0.75, 1.6, 4), "#fff", M(0, 15.8, 0, 0, PI / 4));
  return k.finish({ radius: 3, height: 17, light: new T.Vector3(0, 15.5, 0) });
};

L.gate = (o, r) => {
  const k = kit(o);
  for (const x of [-3.2, 3.2]) { k.add(G.box(1.6, 9, 1.6), k.stone, M(x, 4.5)); k.add(G.box(2, 0.6, 2), k.trim, M(x, 9.2)); }
  k.add(G.box(9, 1.4, 1.8), k.main, M(0, 10.1));
  k.glow(G.box(0.8, 0.8, 0.3), "#fff", M(0, 10.1, 0.95));
  return k.finish({ radius: 5, height: 11, light: new T.Vector3(0, 9, 1.5) });
};

L.tent = (o, r) => {
  const k = kit(o);
  k.add(G.cone(3.2, 4.4, 6), k.main, M(0, 2.2));
  k.add(G.box(1.2, 1.8, 0.3), k.dark, M(0, 0.9, 2.55, -0.25));
  k.add(G.cyl(0.08, 0.08, 1.4, 4), k.wood, M(0, 4.8));
  k.glow(G.box(0.4, 0.5, 0.4), "#fff", M(2.6, 0.6, 1.8));
  return k.finish({ radius: 4, height: 5, light: new T.Vector3(2.6, 1, 1.8) });
};

L.shrine = (o, r) => {
  const k = kit(o), red = col(o.color || "#c4402f");
  for (const x of [-2.6, 2.6]) k.add(G.cyl(0.32, 0.38, 6, 8), red, M(x, 3));
  k.add(G.box(7.6, 0.5, 0.7), shade(red, 0.4), M(0, 6.3)); k.add(G.box(6.4, 0.35, 0.5), red, M(0, 5.3));
  k.add(G.box(1.6, 1.2, 1.2), k.wood, M(0, 0.6, -3)); k.add(G.box(2, 0.25, 1.6), shade(k.wood, 0.7), M(0, 1.3, -3));
  for (const x of [-1.8, 1.8]) { k.add(G.box(0.3, 1.2, 0.3), k.stone, M(x, 0.6, 1.5)); k.glow(G.box(0.55, 0.55, 0.55), "#fff", M(x, 1.45, 1.5)); }
  return k.finish({ radius: 5, height: 7, light: new T.Vector3(0, 1.6, 1.5) });
};

L.great_tree = (o, r) => {
  const k = kit(o), bark = col("#5f4631"), leaf = col(o.color || "#4f8f4a");
  k.add(G.cyl(1.6, 2.6, 15, 8), bark, M(0, 7.5));
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; k.add(G.cyl(0.4, 0.9, 4, 6), bark, M(Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1)); }
  for (let i = 0; i < 7; i++) { const a = r() * PI * 2, d = 2 + r() * 4.5; k.add(G.ico(3.5 + r() * 2.2, 0), shade(leaf, 0.85 + r() * 0.3), M(Math.cos(a) * d, 15 + r() * 4, Math.sin(a) * d)); }
  if (o.glow) for (let i = 0; i < 14; i++) { const a = r() * PI * 2, d = 3 + r() * 5; k.glow(G.octa(0.3), "#fff", M(Math.cos(a) * d, 12 + r() * 6, Math.sin(a) * d)); }
  return k.finish({ radius: 7, height: 22, light: o.glow ? new T.Vector3(0, 13, 0) : null });
};

L.crystals = (o, r) => {
  const k = kit(o), c = o.glow || o.color || "#8fe3ff";
  k.glowC = col(c);
  for (let i = 0; i < 9; i++) {
    const a = r() * PI * 2, d = i === 0 ? 0 : 1.5 + r() * 3, h = i === 0 ? 9 : 2.5 + r() * 5;
    k.glow(G.octa(1), mixc(c, "#ffffff", r() * 0.4), M(Math.cos(a) * d, h * 0.45, Math.sin(a) * d, (r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7, 0.9 + r() * 0.6, h / 2, 0.9 + r() * 0.6));
  }
  for (let i = 0; i < 5; i++) k.add(G.dodeca(0.9 + r()), "#56524c", M((r() - 0.5) * 7, 0.3, (r() - 0.5) * 7));
  return k.finish({ radius: 5, height: 10, light: new T.Vector3(0, 4, 0) });
};

L.pyramid = (o, r) => {
  const k = kit(o);
  for (let i = 0; i < 5; i++) { const w = 16 - i * 3; k.add(G.box(w, 2.2, w), shade(k.main, 0.85 + i * 0.05), M(0, 1.1 + i * 2.2)); }
  k.add(G.box(3, 2.6, 3), k.trim, M(0, 12.3));
  k.add(G.box(3, 11, 0.6), shade(k.main, 0.75), M(0, 5.5, 7.2, -0.62));
  k.glow(G.box(1.2, 1.4, 0.3), "#fff", M(0, 12.2, 1.55));
  return k.finish({ radius: 9, height: 14, light: new T.Vector3(0, 12, 2) });
};

L.observatory = (o, r) => {
  const k = kit(o);
  k.add(G.cyl(4, 4.3, 5, 14), k.stone, M(0, 2.5));
  k.add(G.sph(4, 14, 8, 0, PI / 2), k.main, M(0, 5));
  k.add(G.box(1.2, 4.2, 4.6), k.dark, M(0, 6.6, 0.4, -0.5));
  k.add(G.cyl(0.5, 0.7, 5, 8), "#3b3f46", M(0, 8.4, 1.6, -0.9));
  k.add(G.box(1.4, 2.3, 0.3), k.dark, M(0, 1.15, 4.2));
  k.glow(G.box(0.8, 0.8, 0.2), "#fff", M(-2.6, 3, 3.3, 0, -0.6));
  return k.finish({ radius: 6, height: 10, light: new T.Vector3(0, 2, 4.5) });
};

L.shipwreck = (o, r) => {
  const k = kit(o), w = mixc(k.main, "#6b4b33", 0.7);
  const hull = [];
  hull.push(part(G.cyl(2.6, 1.4, 12, 8, 1, false), w, M(0, 0, 0, PI / 2, 0, 0, 1, 1, 0.7)));
  const g = new T.Group();
  g.add(solidMesh(hull));
  const deck = solidMesh([part(G.box(4, 0.3, 11), shade(w, 1.15), M(0, 1.4)), part(G.cyl(0.2, 0.25, 9, 6), k.wood, M(0, 5, -1, 0.25)),
    part(G.box(3.4, 3.2, 0.06), "#d9cfb9", M(0.6, 6, -0.4, 0.2, 0.4, 0.1))]);
  g.add(deck);
  g.rotation.set(0.12, 0.6, 0.35); g.position.y = 0.6;
  k.group.add(g);
  return k.finish({ radius: 7, height: 8, shore: true });
};

L.portal = (o, r) => {
  const k = kit(o), c = o.glow || "#a77bff";
  k.add(G.box(9, 1, 3), k.stone, M(0, 0.5));
  const ring = new T.Mesh(merge([part(G.torus(4, 0.6, 6, 20), k.stone)]), flatMat()); ring.position.y = 5.2; ring.castShadow = true;
  k.group.add(ring);
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; k.glow(G.octa(0.35), "#fff", M(Math.cos(a) * 4, 5.2 + Math.sin(a) * 4, 0.7)); }
  k.glowC = col(c);
  const disc = new T.Mesh(new T.CircleGeometry(3.5, 32), new T.MeshBasicMaterial({ color: col(c), transparent: true, opacity: 0.55, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  disc.position.y = 5.2; k.group.add(disc);
  return k.finish({ radius: 5, height: 10, light: new T.Vector3(0, 5, 1),
    update: (t) => { disc.material.opacity = 0.4 + Math.sin(t * 2.2) * 0.15; disc.scale.setScalar(1 + Math.sin(t * 3.1) * 0.03); } });
};

L.dock = (o, r) => {
  const k = kit(o), w = mixc(k.main, "#8a6a49", 0.7);
  k.add(G.box(3, 0.3, 14), w, M(0, 1.1, 5));
  for (let i = 0; i < 5; i++) for (const x of [-1.3, 1.3]) k.add(G.cyl(0.18, 0.18, 4, 6), shade(w, 0.7), M(x, -0.6, i * 3.2 - 0.5));
  k.add(G.cyl(1.1, 0.7, 4.5, 6), shade(w, 0.9), M(3.2, 0.35, 9, PI / 2, 0, 0, 1, 1, 0.55));
  k.glow(G.box(0.4, 0.6, 0.4), "#fff", M(1.3, 2.1, 11.6));
  k.add(G.box(0.15, 1.6, 0.15), shade(w, 0.6), M(1.3, 1.3, 11.6));
  return k.finish({ radius: 5, height: 3, shore: true, light: new T.Vector3(1.3, 2.2, 11.6) });
};

L.market = (o, r) => {
  const k = kit(o);
  const awn = [k.main, col("#efe6d4"), mixc(k.main, "#3c6e8f", 0.6)];
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.9, x = Math.sin(a) * 7, z = -Math.cos(a) * 7 + 5;
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = -a;
    const p = [part(G.box(3.6, 1.1, 1.6), "#8a6a49", M(0, 0.55)), part(G.box(3.8, 0.12, 2.4), awn[i], M(0, 3, 0.2, 0.25))];
    for (const xx of [-1.7, 1.7]) p.push(part(G.box(0.15, 3, 0.15), "#5d4530", M(xx, 1.5, 1.1)));
    p.push(part(G.box(0.8, 0.6, 0.8), "#c79a52", M(-1, 1.4, 0)), part(G.ico(0.35), "#d9573a", M(0.6, 1.35, 0)), part(G.ico(0.3), "#e8c14d", M(1.1, 1.3, 0.2)));
    g.add(solidMesh(p)); k.group.add(g);
  }
  k.glow(G.box(0.4, 0.5, 0.4), "#fff", M(0, 3.2, 4.5));
  return k.finish({ radius: 8, height: 4, light: new T.Vector3(0, 3, 4) });
};

L.fountain = (o, r) => {
  const k = kit(o);
  k.add(G.cyl(4, 4.2, 1, 14), k.stone, M(0, 0.5)); k.add(G.cyl(3.5, 3.5, 0.2, 14), "#4c8fb0", M(0, 0.95));
  k.add(G.cyl(0.6, 0.8, 3, 8), k.stone, M(0, 2)); k.add(G.cyl(1.8, 0.8, 0.6, 10), k.main, M(0, 3.6));
  k.glow(G.cone(0.5, 1.3, 6), "#fff", M(0, 4.5));
  return k.finish({ radius: 5, height: 5, light: new T.Vector3(0, 4.5, 0) });
};

L.cave = (o, r) => {
  const k = kit(o), s = mixc(k.main, "#77736b", 0.6);
  for (let i = 0; i < 8; i++) { const a = PI + (i / 7) * PI, d = 5 + r(); k.add(G.dodeca(2.4 + r() * 1.6), shade(s, 0.8 + r() * 0.3), M(Math.cos(a) * d * 0.8, 1.6 + r() * 2.5, Math.sin(a) * d * 0.6 - 1)); }
  k.add(G.dodeca(5.5), s, M(0, 3, -3.5, 0, 0, 0, 1.3, 0.9, 1));
  k.add(G.sph(2.6, 10, 6, 0, PI / 2), "#151515", M(0, 0, 1.6, -PI / 2 + 0.2, 0, 0, 1, 1, 0.3));
  k.glow(G.octa(0.4), "#fff", M(1.6, 0.8, 2.6));
  return k.finish({ radius: 7, height: 8, light: new T.Vector3(0, 1.5, 3) });
};

L.hall = (o, r) => {
  const k = kit(o);
  k.add(G.box(14, 6, 9), mixc(k.main, "#e6dccb", 0.45), M(0, 3));
  k.add(G.cyl(5.4, 5.4, 15, 3), k.main, M(0, 7.7, 0, 0, 0, PI / 2, 1, 0.55, 1));
  k.add(G.box(2.4, 3.6, 0.3), k.dark, M(0, 1.8, 4.6));
  for (const x of [-4.5, -2.2, 2.2, 4.5]) k.glow(G.box(1.1, 1.8, 0.2), "#fff", M(x, 3.4, 4.55));
  k.add(G.box(1.6, 3, 1.6), k.stone, M(5, 10, -2));
  return k.finish({ radius: 8.5, height: 11, light: new T.Vector3(0, 3, 5.5) });
};

L.bridge = (o, r) => {
  const k = kit(o);
  for (let i = 0; i < 9; i++) { const a = (i - 4) / 4 * 0.7; k.add(G.box(3, 0.4, 1.6), k.wood, M(0, 1.6 + Math.cos(a) * 1.4, Math.sin(a) * 7.5, -a * 0.9)); }
  for (const z of [-6.5, 6.5]) for (const x of [-1.6, 1.6]) k.add(G.box(0.3, 2.6, 0.3), shade(k.wood, 0.7), M(x, 1.3, z));
  return k.finish({ radius: 7, height: 4 });
};

L.dome = L.observatory;
L.house = L.cottage;
L.ziggurat = L.pyramid;
L.arch = L.gate;
L.torii = L.shrine;
L.tree = L.great_tree;
L.crystal = L.crystals;
L.pier = L.dock;
L.monolith = L.obelisk;
L.circle = L.stones;

const LANDMARK_TYPES = ["tower", "cottage", "hut", "temple", "ruins", "lighthouse", "windmill", "stones", "statue", "campfire", "well", "obelisk", "gate", "tent", "shrine", "great_tree", "crystals", "pyramid", "observatory", "shipwreck", "portal", "dock", "market", "fountain", "cave", "hall", "bridge"];

function buildLandmark(o) {
  const type = L[o.type] ? o.type : "ruins";
  const r = rng(WS.hashStr(o.name || type));
  const res = L[type](o, r);
  const s = WS.clamp(Number(o.scale) || 1, 0.5, 2.2);
  res.group.scale.setScalar(s);
  res.radius *= s; res.height *= s;
  if (res.light) res.light.multiplyScalar(s);
  res.type = type;
  return res;
}

/* ---------------------------------------------------------------- flora */
// Each template is one merged geometry, drawn as an InstancedMesh.
function floraGeo(type, c, r) {
  const bark = col("#6a4c34"), leaf = col(c);
  const p = [];
  switch (type) {
    case "pine":
      p.push(part(G.cyl(0.18, 0.28, 1.6, 5), bark, M(0, 0.8)));
      for (let i = 0; i < 3; i++) p.push(part(G.cone(1.6 - i * 0.38, 2.2, 7), shade(leaf, 0.9 + i * 0.08), M(0, 1.9 + i * 1.15)));
      break;
    case "broadleaf":
      p.push(part(G.cyl(0.2, 0.32, 2.4, 5), bark, M(0, 1.2)));
      p.push(part(G.ico(1.7, 0), leaf, M(0, 3.4, 0, 0, 0, 0, 1, 0.9, 1)), part(G.ico(1.1, 0), shade(leaf, 1.12), M(0.8, 3.0, 0.4)));
      break;
    case "birch":
      p.push(part(G.cyl(0.12, 0.16, 4, 5), "#e8e4da", M(0, 2)));
      p.push(part(G.ico(1, 0), leaf, M(0, 4.2, 0, 0, 0, 0, 0.9, 1.4, 0.9)), part(G.ico(0.7, 0), shade(leaf, 1.1), M(0.3, 3.3, 0.3)));
      break;
    case "palm": {
      const segs = 5;
      for (let i = 0; i < segs; i++) p.push(part(G.cyl(0.17, 0.22, 1, 5), bark, M(i * i * 0.04, 0.5 + i * 0.95, 0, 0, 0, -i * 0.05)));
      const top = [segs * segs * 0.04, segs * 0.95 + 0.1];
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; p.push(part(G.box(0.5, 0.06, 2.4), shade(leaf, 0.9 + (i % 2) * 0.15), M(top[0] + Math.cos(a) * 1.1, top[1] - 0.25, Math.sin(a) * 1.1, 0.35, -a + PI / 2, 0))); }
      break;
    }
    case "cactus":
      p.push(part(G.cyl(0.35, 0.4, 3, 7), leaf, M(0, 1.5)), part(G.cyl(0.22, 0.22, 1.2, 6), leaf, M(0.6, 1.6, 0, 0, 0, PI / 2)),
        part(G.cyl(0.22, 0.22, 1, 6), leaf, M(1.05, 2.1)), part(G.cyl(0.2, 0.2, 0.8, 6), leaf, M(-0.5, 2.2, 0, 0, 0, -PI / 2)), part(G.cyl(0.2, 0.2, 0.8, 6), leaf, M(-0.85, 2.6)));
      break;
    case "mushroom":
      p.push(part(G.cyl(0.25, 0.35, 1.6, 6), "#efe8da", M(0, 0.8)), part(G.sph(1.2, 9, 5, 0, PI / 2), leaf, M(0, 1.5, 0, 0, 0, 0, 1, 0.75, 1)));
      break;
    case "crystal":
      for (let i = 0; i < 3; i++) p.push(part(G.octa(0.5), mixc(leaf, "#ffffff", i * 0.15), M((i - 1) * 0.45, 0.9 + i * 0.2, (i % 2) * 0.3, 0, i, (i - 1) * 0.3, 0.6, 1.8 + i * 0.4, 0.6)));
      break;
    case "dead":
      p.push(part(G.cyl(0.12, 0.25, 3.4, 5), shade(bark, 0.8), M(0, 1.7)), part(G.cyl(0.05, 0.1, 1.6, 4), shade(bark, 0.8), M(0.5, 2.8, 0, 0, 0, -0.8)),
        part(G.cyl(0.05, 0.1, 1.2, 4), shade(bark, 0.8), M(-0.4, 2.3, 0.2, 0.2, 0, 0.9)));
      break;
    case "bush":
      p.push(part(G.ico(0.8, 0), leaf, M(0, 0.5, 0, 0, 0, 0, 1.2, 0.8, 1)), part(G.ico(0.6, 0), shade(leaf, 1.1), M(0.6, 0.4, 0.3)), part(G.ico(0.5, 0), shade(leaf, 0.9), M(-0.5, 0.35, -0.2)));
      break;
    case "flower":
      p.push(part(G.cyl(0.03, 0.03, 0.6, 3), "#4f7a3a", M(0, 0.3)), part(G.ico(0.17, 0), leaf, M(0, 0.65)));
      p.push(part(G.cyl(0.03, 0.03, 0.45, 3), "#4f7a3a", M(0.25, 0.22, 0.1)), part(G.ico(0.13, 0), shade(leaf, 1.15), M(0.25, 0.48, 0.1)));
      break;
    case "reed":
      for (let i = 0; i < 5; i++) p.push(part(G.cone(0.06, 1.6 + (i % 3) * 0.4, 3), leaf, M((i - 2) * 0.15, 0.85, ((i * 7) % 5 - 2) * 0.12, (i - 2) * 0.08)));
      break;
    case "rock":
    default:
      p.push(part(G.dodeca(0.9), leaf, M(0, 0.35, 0, 0, 0, 0, 1.3, 0.75, 1)), part(G.dodeca(0.5), shade(leaf, 0.9), M(0.8, 0.2, 0.3)));
  }
  return merge(p);
}
const FLORA_TYPES = ["pine", "broadleaf", "birch", "palm", "cactus", "mushroom", "crystal", "dead", "bush", "flower", "reed", "rock"];
const FLORA_MAX = { pine: 900, broadleaf: 650, birch: 500, palm: 220, cactus: 260, mushroom: 380, crystal: 240, dead: 240, bush: 650, flower: 1600, reed: 500, rock: 360 };

/* ---------------------------------------------------------------- characters */
const HATS = ["none", "hood", "wizard", "crown", "wide", "halo", "horns", "helmet", "flower"];
function buildCharacter(look = {}) {
  const robe = col(look.robe, "#6d5a8a"), skin = col(look.skin, "#d9b18f"), h = WS.clamp(Number(look.height) || 1, 0.8, 1.3);
  const g = new T.Group();
  const body = [part(G.cyl(0.32, 0.62, 1.5, 7), robe, M(0, 0.75)), part(G.cyl(0.36, 0.36, 0.14, 7), shade(robe, 0.7), M(0, 1.05))];
  const bodyMesh = solidMesh(body);
  const headG = new T.Group(); headG.position.y = 1.78;
  const head = [part(G.ico(0.34, 1), skin), part(G.box(0.07, 0.07, 0.04), "#1d1a1a", M(-0.12, 0.04, 0.31)), part(G.box(0.07, 0.07, 0.04), "#1d1a1a", M(0.12, 0.04, 0.31))];
  const hat = look.hat || "none", hc = col(look.hatColor || look.robe, "#3d3550");
  if (hat === "hood") head.push(part(G.sph(0.42, 8, 6, 0, PI * 0.55), shade(robe, 0.85), M(0, 0.06, -0.14, -0.35)));
  if (hat === "wizard") head.push(part(G.cyl(0.62, 0.62, 0.06, 10), hc, M(0, 0.24)), part(G.cone(0.34, 1.1, 8), hc, M(0, 0.8, 0, -0.15)));
  if (hat === "crown") { head.push(part(G.cyl(0.3, 0.3, 0.16, 8), "#e3b341", M(0, 0.36))); for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; head.push(part(G.cone(0.07, 0.2, 4), "#e3b341", M(Math.cos(a) * 0.26, 0.52, Math.sin(a) * 0.26))); } }
  if (hat === "wide") head.push(part(G.cyl(0.75, 0.75, 0.05, 12), hc, M(0, 0.24)), part(G.cyl(0.3, 0.34, 0.3, 10), hc, M(0, 0.4)));
  if (hat === "horns") head.push(part(G.cone(0.08, 0.4, 5), "#efe5d0", M(-0.24, 0.36, 0, 0, 0, 0.5)), part(G.cone(0.08, 0.4, 5), "#efe5d0", M(0.24, 0.36, 0, 0, 0, -0.5)));
  if (hat === "helmet") head.push(part(G.sph(0.38, 8, 5, 0, PI / 2), "#9aa3ad", M(0, 0.04)), part(G.box(0.06, 0.25, 0.6), hc, M(0, 0.45)));
  if (hat === "flower") head.push(part(G.ico(0.11, 0), "#f27fa6", M(-0.22, 0.28, 0.12)), part(G.ico(0.09, 0), "#ffd25e", M(-0.1, 0.33, 0.2)));
  const headMesh = solidMesh(head); headG.add(headMesh);
  if (hat === "halo") { const halo = new T.Mesh(new T.TorusGeometry(0.3, 0.035, 5, 18), glowMat("#ffe9a3")); halo.rotation.x = PI / 2; halo.position.y = 0.55; headG.add(halo); }
  const arm = side => { const a = new T.Group(); a.position.set(side * 0.36, 1.38, 0); a.add(solidMesh([part(G.cyl(0.08, 0.1, 0.75, 5), robe, M(0, -0.36)), part(G.ico(0.1, 0), skin, M(0, -0.78))])); return a; };
  const armL = arm(-1), armR = arm(1);
  g.add(bodyMesh, headG, armL, armR);
  g.scale.setScalar(h);
  g.userData.parts = { headG, armL, armR, bodyMesh };
  return g;
}
function animateCharacter(g, t, moving, speed = 1) {
  const p = g.userData.parts; if (!p) return;
  const sw = moving ? Math.sin(t * 9 * speed) * 0.55 : Math.sin(t * 1.6) * 0.05;
  p.armL.rotation.x = sw; p.armR.rotation.x = -sw;
  p.bodyMesh.position.y = moving ? Math.abs(Math.sin(t * 9 * speed)) * 0.06 : 0;
  p.headG.position.y = 1.78 + p.bodyMesh.position.y + (moving ? 0 : Math.sin(t * 1.6) * 0.015);
}

Object.assign(WS, { buildLandmark, LANDMARK_TYPES, floraGeo, FLORA_TYPES, FLORA_MAX, buildCharacter, animateCharacter, HATS, glowMats, glowMat });
})();

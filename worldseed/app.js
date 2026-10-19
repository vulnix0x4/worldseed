/* Worldseed app: the title screen, genesis, conversations, journal, map, reshaping,
   the shared atlas, live explorers, postcards and controls. */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const { clamp, smooth } = WS;
const Mind = WS.Mind;

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem("ws." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ws." + k, JSON.stringify(v)); } catch {} },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + "m ago" : s < 86400 ? Math.floor(s / 3600) + "h ago" : Math.floor(s / 86400) + "d ago"; };
const fmtHour = h => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); };
const timeWords = h => h < 5 ? "deep night" : h < 7.5 ? "dawn" : h < 11 ? "morning" : h < 14 ? "midday" : h < 17 ? "afternoon" : h < 20 ? "dusk" : "night";
const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

function toast(kicker, text, ms = 4200) {
  const t = el("div", { class: "toast glass" }, el("span", { class: "mono", text: kicker }), el("span", { text }));
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}
let capTimer;
function caption(text, ms = 6500) {
  const c = $("#caption");
  c.textContent = text; c.classList.add("on");
  clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.remove("on"), ms);
}

/* ---------------------------------------------------------------- state */
const canvas = $("#gl");
const E = WS.createWorld(canvas);
E.onThunder = () => WS.Sound.thunder();

const S = {
  sample: null, db: null, user: null, uid: null, downloads: null, room: null,
  live: false, connecting: true, myName: "Explorer", myColor: "#7fb4ff",
  tier: store.get("tier", "default"), mode: "title",
  world: null, prog: null, meta: {}, goal: "",
  talk: null, sound: store.get("sound", true), atlasUsers: new Map(), profiles: {}, beacons: new Map(),
  r: null, peers: [], bubbles: new Map(),
};
let readyResolve; S.ready = new Promise(r => (readyResolve = r));
const freshProg = () => ({ inv: [], given: {}, seen: [], marked: [], met: [], talks: {}, pos: null });

/* ---------------------------------------------------------------- applying world lines */
const HOLD = { world: 0.4, palette: 1.1, terrain: 2.3, flora: 0.45, landmark: 0.7, npc: 0.5, goal: 0.3, event: 0.3, remove: 0.6, weather: 0.4, time: 0.4 };
function queueOp(op, fast) { E.enqueue(() => runOp(op, fast), fast ? (op.kind === "terrain" ? 0.05 : 0.01) : HOLD[op.kind] || 0.3); }
function runOp(op, fast) {
  switch (op.kind) {
    case "world": S.meta = op; E.setHour(op.hour, fast); E.setWeather(op.weather); E.setTimeFlow(op.flow === false ? 0 : 0.5); WS.Sound.setMusic(op.music); break;
    case "palette": E.setPalette(op, fast ? 0 : 1.3); setTimeout(setAccent, fast ? 0 : 1400); break;
    case "terrain": E.setTerrain(op, !fast); break;
    case "flora": E.addFlora(op); break;
    case "landmark": E.addLandmark(op); break;
    case "npc": E.addNpc(op); break;
    case "goal": S.goal = op.text; break;
    case "event": if (!fast) caption(op.text); break;
    case "remove": E.removeEntity(op.name); break;
    case "weather": E.setWeather(op.value); break;
    case "time": E.setHour(op.hour, fast); break;
  }
  updateWhere();
  if (!$("#journal").hidden) renderJournal();
}
function setAccent() {
  const c = E.W.pal.accent;
  document.documentElement.style.setProperty("--accent", "#" + c.getHexString());
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  document.documentElement.style.setProperty("--accent-ink", lum > 0.45 ? "#17120a" : "#fbf6ec");
}

function loadWorld(world, prog) {
  S.world = world; S.prog = prog || freshProg(); S.meta = {}; S.goal = "";
  clearBeacons();
  E.clearWorld();
  for (const op of world.lines) queueOp(op, true);
  E.enqueue(() => {
    setAccent(); updateWhere();
    $("#enter-name").textContent = S.meta.name || "this world";
    for (const name of S.prog.marked) if (!S.prog.seen.includes(name)) addBeacon(name);
  }, 0.01);
}

function arrive(isNew) {
  if (E.queueLength() > 0) { E.enqueue(() => arrive(isNew), 0); return; }
  closeSheets(); endTalk();
  E.spawnPlayer();
  const sp = S.prog.pos;
  if (!isNew && sp && Number.isFinite(sp.x) && (!E.W.hasWater || E.heightAt(sp.x, sp.z) > E.W.waterY + 0.3)) E.player.pos.set(sp.x, E.groundY(sp.x, sp.z), sp.z);
  E.setMode("play");
  setMode("play");
  if (isNew || !S.prog.seen.length) {
    showTitleCard(isNew ? "You arrive in" : "You return to", S.meta.name, S.meta.tagline);
    if (S.goal) setTimeout(() => S.mode === "play" && caption(S.goal, 7000), 4600);
  } else toast("Back in", S.meta.name || "the world");
  save();
  joinRoom();
  canvas.focus();
  setTimeout(() => $("#help").style.opacity = "0", 15000);
}

function setMode(m) {
  S.mode = m;
  $("#hud").classList.toggle("hidden", m !== "play");
  $("#title").classList.toggle("gone", m !== "title");
  if (m === "title") { E.setMode("orbit"); leaveRoom(); }
}
function showTitleCard(kicker, name, tag) {
  $("#tc-kicker").textContent = kicker; $("#tc-name").textContent = name || ""; $("#tc-tag").textContent = tag || "";
  const t = $("#titlecard"); t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 4300);
}
function updateWhere() {
  $("#w-name").textContent = S.meta.name || "Worldseed";
  const n = S.prog ? S.prog.seen.length : 0, total = E.W.landmarks.length;
  $("#w-meta").textContent = `${fmtHour(E.W.hour)} · ${E.W.weather} · ${n}/${total} places found`;
}
const save = debounce(() => {
  if (!S.world || S.world.building) return;
  if (E.player.placed) S.prog.pos = { x: +E.player.pos.x.toFixed(2), z: +E.player.pos.z.toFixed(2) };
  store.set("current", { world: S.world, prog: S.prog });
}, 600);
setInterval(() => { if (S.mode === "play") save(); }, 5000);

/* ---------------------------------------------------------------- genesis */
function pickSeed(text) { const seeds = window.WS_SEEDS; return seeds.find(s => s.match.test(text)) || seeds[Math.floor(Math.random() * seeds.length)]; }

const GEN_LABEL = op => {
  switch (op.kind) {
    case "world": return ["World", `${op.name}${op.tagline ? " · " + op.tagline : ""}`];
    case "palette": return ["Sky", "Colors and light chosen"];
    case "terrain": return ["Land", `${op.shape}${op.water > 0.03 ? ", ringed by sea" : ", no sea"}`];
    case "flora": return ["Growth", `${op.type === "flower" ? "flowers" : op.type + (op.type.endsWith("s") ? "" : "s")} across the ${op.zone === "all" ? "land" : op.zone + " ground"}`];
    case "landmark": return ["Place", `${op.name} · ${op.type.replace("_", " ")}`];
    case "npc": return ["Person", `${op.name}, ${op.role}`];
    case "goal": return ["Story", op.text];
    case "event": return ["Event", op.text];
    case "remove": return ["Gone", op.name];
    case "weather": return ["Weather", op.value];
    case "time": return ["Time", fmtHour(op.hour)];
    default: return [op.kind, ""];
  }
};

async function grow(text) {
  text = String(text || "").trim();
  if (!text) { $("#seed-in").focus(); return; }
  closeSheets(); endTalk(); leaveRoom();
  if (S.genCtl) S.genCtl.abort();
  const ctl = new AbortController(); S.genCtl = ctl;
  setMode("genesis");
  E.setMode("orbit");
  clearBeacons();
  E.clearWorld();
  const world = { id: uid(), prompt: text, lines: [], atlas: null, building: true };
  S.world = world; S.prog = freshProg(); S.meta = { name: "" }; S.goal = "";
  const g = $("#genesis");
  const status = el("span", { text: "Waiting for Claude" });
  const log = el("ol");
  const stop = el("button", { class: "btn", type: "button", text: "Stop", onclick: () => ctl.abort() });
  g.replaceChildren(el("h3", { text: "Growing a world" }), el("div", { class: "q", text: "“" + text + "”" }), el("div", { class: "think" }, el("i", { class: "orb" }), status), log, el("div", { class: "row" }, stop));
  g.hidden = false;
  const t0 = performance.now();
  let got = 0;
  const tick = setInterval(() => { if (!got) { const s = Math.floor((performance.now() - t0) / 1000); status.textContent = s > 2 ? `Claude is imagining… ${s}s` : "Waiting for Claude"; } }, 250);
  const onOp = op => {
    if (S.world !== world) return;
    if (!got) status.textContent = "Building as Claude writes";
    got++;
    world.lines.push(op);
    queueOp(op, false);
    const [k, txt] = GEN_LABEL(op);
    const li = el("li", {}, el("span", { class: "mono", text: k }), el("span", { text: txt }));
    if (op.kind === "palette") for (const key of ["skyTop", "skyHorizon", "low", "mid", "high", "water", "accent"]) if (op[key]) li.lastChild.append(el("i", { style: `display:inline-block;width:10px;height:10px;border-radius:3px;margin-left:5px;vertical-align:-1px;background:${op[key]}` }));
    log.append(li); li.scrollIntoView({ block: "nearest" });
  };
  try {
    await Promise.race([S.ready, new Promise((_, rej) => ctl.signal.addEventListener("abort", () => rej({ code: "cancelled" })))]);
    if (S.live) {
      const reader = Mind.lineReader(onOp);
      await S.sample(Mind.genesisPrompt(text), { modelTier: S.tier, cache: false, signal: ctl.signal, onText: ({ text: t }) => reader.feed(t) });
      reader.end();
    } else {
      const seed = pickSeed(text);
      world.recorded = true;
      status.textContent = "Replaying a recorded world";
      await sleep(1400);
      for (const op of seed.lines) { if (ctl.signal.aborted) throw { code: "cancelled" }; onOp(op); await sleep(260); }
    }
  } catch (e) {
    clearInterval(tick);
    return genesisFailed(e, text, world);
  }
  clearInterval(tick);
  if (S.world !== world) return;
  if (!world.lines.some(o => o.kind === "terrain")) { const op = { kind: "terrain", shape: "islands", height: 0.5, roughness: 0.5, water: 0.3, seed: 77 }; world.lines.unshift(op); queueOp(op, false); }
  if (!world.lines.some(o => o.kind === "landmark")) { const op = Mind.normalize({ kind: "landmark", type: "ruins", name: "The First Stones", about: "Where this world began.", near: "center" }); world.lines.push(op); queueOp(op, false); }
  if (!S.meta.name) { const op = { kind: "world", name: text.split(/\s+/).slice(0, 4).join(" "), tagline: "", lore: text, hour: 12, weather: "clear", music: {} }; world.lines.unshift(op); runOp(op); }
  status.textContent = world.recorded ? "Recorded world ready" : `Written in ${Math.round((performance.now() - t0) / 1000)} seconds`;
  stop.remove();
  E.enqueue(() => {
    world.building = false;
    $("#genesis").hidden = true;
    $("#enter-name").textContent = S.meta.name || "this world";
    arrive(true);
    if (world.recorded) setTimeout(() => toast("Recorded world", "Growing new worlds live needs Claude. Open Worldseed on claude.ai.", 7000), 5000);
  }, 0.3);
}

function genesisFailed(e, text, world) {
  const code = e && e.code;
  const g = $("#genesis");
  const msg = {
    cancelled: ["Stopped", "Nothing more will be added. You can still walk into what grew."],
    not_granted: ["Claude is off for this page", "Claude access was declined, so only recorded worlds can grow until you reload."],
    rate_limited: ["Usage limit reached", "Claude reports a rate or usage limit on this account. Try again a little later."],
    refused: ["Claude declined that one", "Try describing the world differently."],
    session_expired: ["Sign in again", "Your Claude session expired. Sign in on claude.ai, then try again."],
  }[code] || ["The world stopped growing", "The connection to Claude dropped partway through. Try again."];
  if (code === "not_granted" || code === "sampling_disabled") { S.live = false; setStatus(); }
  world.building = false;
  const enough = world.lines.some(o => o.kind === "terrain") && world.lines.some(o => o.kind === "landmark");
  g.replaceChildren(el("h3", { text: msg[0] }), el("p", { text: msg[1] }),
    el("div", { class: "row" },
      enough ? el("button", { class: "btn primary", type: "button", text: "Walk in anyway", onclick: () => { g.hidden = true; arrive(true); } }) : null,
      code !== "not_granted" ? el("button", { class: "btn", type: "button", text: "Try again", onclick: () => grow(text) }) : null,
      el("button", { class: "btn", type: "button", text: "Back", onclick: () => { g.hidden = true; backToTitle(); } })));
}

function backToTitle() {
  endTalk(); closeSheets();
  setMode("title");
  $("#seed-in").focus();
}

/* ---------------------------------------------------------------- labels, discovery, interaction */
const labels = new Map();
const labelBox = $("#labels");
function label(key, cls, build) {
  let l = labels.get(key);
  if (!l) { l = el("div", { class: "lab " + cls }); build(l); labelBox.append(l); labels.set(key, l); }
  l._seen = true;
  return l;
}
let nearNpc = null, proxTimer = 0;
const _v = new THREE.Vector3();
function frame(dt) {
  for (const l of labels.values()) l._seen = false;
  if (S.mode === "play") {
    const P = E.player.pos;
    for (const L of E.W.landmarks) {
      const d = Math.hypot(L.pos.x - P.x, L.pos.z - P.z);
      if (d > 95 || d < L.radius + 2) continue;
      const seen = S.prog.seen.includes(L.name);
      const p = E.project(_v.set(L.pos.x, L.pos.y + L.height + 2.4, L.pos.z));
      if (!p.on) continue;
      const l = label("L:" + L.name, "place", n => n.append(el("b", { text: L.name }), el("small", { text: L.type.replace("_", " ") })));
      l.classList.toggle("new", !seen);
      l.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
      l.style.opacity = (1 - smooth(55, 95, d)).toFixed(2);
    }
    for (const n of E.W.npcs) {
      const g = n.group, d = Math.hypot(g.position.x - P.x, g.position.z - P.z);
      if (d > 24 || n.talking) continue;
      const p = E.project(_v.set(g.position.x, g.position.y + 2.7 * n.fullScale, g.position.z));
      if (!p.on) continue;
      const l = label("N:" + n.name, "person", x => x.append(el("b", { text: n.name }), el("small", { text: n.role })));
      l.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
      l.style.opacity = (1 - smooth(14, 24, d)).toFixed(2);
    }
    for (const [id, gh] of E.W.ghosts) {
      const g = gh.group;
      const p = E.project(_v.set(g.position.x, g.position.y + 2.7, g.position.z));
      if (!p.on) continue;
      const l = label("G:" + id, "ghost", x => x.append(el("span", { class: "bubble", hidden: true }), el("b")));
      l.lastChild.textContent = gh.name || "Explorer";
      const b = S.bubbles.get(id);
      l.firstChild.hidden = !b; if (b) l.firstChild.textContent = b.text;
      l.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    }
    const mine = S.bubbles.get("me");
    if (mine) {
      const p = E.project(_v.set(P.x, P.y + 2.7, P.z));
      const l = label("me", "ghost", x => x.append(el("span", { class: "bubble" })));
      l.firstChild.textContent = mine.text;
      l.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    }
    proxTimer -= dt;
    if (proxTimer <= 0) { proxTimer = 0.2; proximity(); }
    drawMinimap();
    if (!$("#mapview").hidden) drawMapView();
  }
  for (const [k, l] of labels) if (!l._seen) { l.remove(); labels.delete(k); }
  for (const [k, b] of S.bubbles) if (performance.now() > b.until) S.bubbles.delete(k);
}
E.onFrame(frame);

function proximity() {
  const P = E.player.pos;
  let best = null, bd = 4.4;
  for (const n of E.W.npcs) { const d = Math.hypot(n.group.position.x - P.x, n.group.position.z - P.z); if (d < bd) { bd = d; best = n; } }
  nearNpc = best;
  const pr = $("#prompt");
  if (best && !S.talk) {
    pr.hidden = false;
    pr.replaceChildren(el("kbd", { text: isTouch ? "Tap" : "E" }), el("span", { text: `Talk to ${best.name}` }), el("small", { text: best.role }));
  } else pr.hidden = true;
  for (const L of E.W.landmarks) {
    if (S.prog.seen.includes(L.name)) continue;
    if (Math.hypot(L.pos.x - P.x, L.pos.z - P.z) < L.radius + 8) discover(L);
  }
  updateWhere();
  const yaw = ((E.cam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const dirs = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  $("#compass").textContent = "Facing " + dirs[Math.round(yaw / (Math.PI / 4)) % 8];
}
function discover(L) {
  S.prog.seen.push(L.name);
  removeBeacon(L.name);
  toast("Discovered", L.name);
  if (L.about) caption(L.about, 5000);
  WS.Sound.chime();
  if (S.prog.seen.length === E.W.landmarks.length && E.W.landmarks.length > 2) setTimeout(() => toast("Every place found", `You've walked all of ${S.meta.name || "this world"}.`, 6000), 2500);
  if (!$("#journal").hidden) renderJournal();
  save();
}

/* beacons mark places someone told you about */
function addBeacon(name) {
  const L = E.W.landmarks.find(l => same(l.name, name));
  if (!L || S.beacons.has(L.name)) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 140, 8, 1, true), new THREE.MeshBasicMaterial({ color: E.W.pal.accent.clone(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(L.pos.x, L.pos.y + 70, L.pos.z);
  E.scene.add(m); S.beacons.set(L.name, m);
}
function removeBeacon(name) { const m = S.beacons.get(name); if (m) { E.scene.remove(m); m.geometry.dispose(); S.beacons.delete(name); } }
function clearBeacons() { for (const k of [...S.beacons.keys()]) removeBeacon(k); }

/* ---------------------------------------------------------------- conversations */
function npcCtx(n) {
  return {
    npc: { name: n.name, role: n.role, home: n.spec.home, personality: n.spec.personality, knows: n.spec.knows, wants: n.spec.wants, has: n.spec.has },
    world: S.meta, npcs: E.W.npcs.map(o => ({ name: o.name, role: o.role, home: o.spec.home })),
    landmarks: E.W.landmarks.map(l => ({ name: l.name, about: l.about })),
    timeWords: timeWords(E.W.hour), weather: E.W.weather, inventory: S.prog.inv, given: S.prog.given[n.name] || [],
  };
}
function openTalk(n) {
  if (!n) return;
  if (S.talk) endTalk();
  closeSheets();
  if (!S.prog.met.includes(n.name)) S.prog.met.push(n.name);
  const turns = S.prog.talks[n.name] || (S.prog.talks[n.name] = []);
  if (!turns.length) turns.push({ role: "assistant", content: n.spec.greeting || "Well met, traveler." });
  n.talking = true; n.follow = n.follow && true;
  S.talk = { npc: n, turns, busy: false, ctl: null };
  E.input.x = E.input.y = 0;
  renderTalk();
  WS.Sound.blip(true);
  setTimeout(() => { const i = $("#talk-in"); if (i && !isTouch) i.focus(); }, 30);
}
function endTalk() {
  const t = S.talk; if (!t) return;
  if (t.ctl) t.ctl.abort();
  t.npc.talking = false;
  S.talk = null;
  $("#dialog").hidden = true;
  save();
  canvas.focus();
}
function renderTalk() {
  const t = S.talk, d = $("#dialog"), n = t.npc;
  const lines = el("div", { class: "lines", id: "talk-lines" });
  for (const turn of t.turns) {
    if (turn.role === "assistant") lines.append(el("div", { class: "line them", text: Mind.parseTags(turn.content).clean }));
    else if (turn.role === "user") lines.append(el("div", { class: "line me", text: turn.content }));
    else lines.append(el("div", { class: "line act", text: turn.content }));
  }
  const input = el("input", { id: "talk-in", maxlength: "400", placeholder: `Say something to ${n.name}…`, "aria-label": `Say something to ${n.name}` });
  const form = el("form", { class: "say", autocomplete: "off" }, input, el("button", { class: "btn primary", type: "submit", text: "Say" }), el("button", { class: "btn", type: "button", text: "Leave", onclick: endTalk }));
  form.addEventListener("submit", e => { e.preventDefault(); const v = input.value.trim(); if (!v || t.busy) return; input.value = ""; sendTalk(v); });
  input.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); endTalk(); } e.stopPropagation(); });
  const offer = S.prog.inv.length ? el("div", { class: "offer" }, el("span", { class: "mono", style: "align-self:center;color:var(--dim)", text: "Offer" }),
    S.prog.inv.map(item => el("button", { type: "button", text: item, onclick: () => !t.busy && sendTalk(`Here, I'd like you to have the ${item}.`) }))) : null;
  d.replaceChildren(
    el("button", { class: "x", type: "button", "aria-label": "Leave conversation", text: "×", onclick: endTalk }),
    el("header", {}, el("b", { text: n.name }), el("span", { class: "mono", text: n.role })),
    lines, form, offer,
    S.live ? null : el("div", { class: "note", text: "Recorded voice. On claude.ai, everyone here can talk freely." }));
  d.hidden = false;
  lines.scrollTop = lines.scrollHeight;
}
function actLine(text) { if (S.talk) S.talk.turns.push({ role: "act", content: text }); }

async function sendTalk(text) {
  const t = S.talk, n = t.npc;
  t.turns.push({ role: "user", content: text });
  t.busy = true;
  renderTalk();
  const lines = $("#talk-lines");
  const live = el("div", { class: "line them" }, el("span", { class: "cursor" }));
  lines.append(live); lines.scrollTop = lines.scrollHeight;
  let reply = "";
  try {
    if (S.live) {
      const msgs = [{ role: "user", content: Mind.npcSystem(npcCtx(n)) + "\n\n(The traveler walks up to you.)" }];
      for (const turn of t.turns.slice(-30)) if (turn.role === "user" || turn.role === "assistant") msgs.push({ role: turn.role, content: turn.content });
      t.ctl = new AbortController();
      const res = await S.sample(msgs, { modelTier: "quick", cache: false, signal: t.ctl.signal,
        onText: ({ text: x }) => { live.textContent = Mind.parseTags(x).clean; lines.scrollTop = lines.scrollHeight; } });
      reply = res.text;
    } else {
      reply = offlineReply(n, text);
      await sleep(500);
      for (let i = 0; i <= reply.length; i += 3) { live.textContent = Mind.parseTags(reply.slice(0, i)).clean; await sleep(16); if (S.talk !== t) return; }
    }
  } catch (e) {
    if (S.talk !== t) return;
    t.busy = false;
    if (e && e.code === "cancelled") return;
    if (e && e.code === "not_granted") { S.live = false; setStatus(); }
    actLine(e && e.code === "rate_limited" ? `${n.name} can't answer right now (Claude is rate limited). Try again shortly.` : `${n.name} didn't answer. Try again.`);
    renderTalk();
    return;
  }
  if (S.talk !== t) return;
  t.busy = false;
  t.turns.push({ role: "assistant", content: reply });
  applyActions(n, Mind.parseTags(reply).actions);
  renderTalk();
  save();
}

function applyActions(n, actions) {
  for (const a of actions) {
    const v = a.value.slice(0, 48);
    switch (a.kind) {
      case "give": {
        if (!v || S.prog.inv.some(i => same(i, v))) break;
        const given = S.prog.given[n.name] || (S.prog.given[n.name] = []);
        if (given.some(i => same(i, v))) break;
        S.prog.inv.push(v); given.push(v);
        actLine(`${n.name} gave you ${v}`); toast("Received", v); WS.Sound.chime();
        break;
      }
      case "take": {
        const i = S.prog.inv.findIndex(x => same(x, v) || x.toLowerCase().includes(v.toLowerCase()) || v.toLowerCase().includes(x.toLowerCase()));
        if (i < 0) break;
        const item = S.prog.inv.splice(i, 1)[0];
        actLine(`You gave ${n.name} ${item}`); toast("Handed over", item);
        break;
      }
      case "reveal": {
        const L = E.W.landmarks.find(l => same(l.name, v)) || E.W.landmarks.find(l => l.name.toLowerCase().includes(v.toLowerCase()));
        if (!L) break;
        if (!S.prog.marked.includes(L.name)) S.prog.marked.push(L.name);
        if (!S.prog.seen.includes(L.name)) addBeacon(L.name);
        actLine(`${L.name} is marked on your map`); toast("Marked", L.name);
        break;
      }
      case "follow": n.follow = true; actLine(`${n.name} walks with you`); break;
      case "stay": n.follow = false; n.home = { x: n.group.position.x, z: n.group.position.z }; actLine(`${n.name} stays here`); break;
      case "weather": if (Mind.WEATHERS.includes(v.toLowerCase())) { E.setWeather(v.toLowerCase()); actLine(`The weather turns: ${v.toLowerCase()}`); } break;
      case "time": { const h = Mind.TIME_WORDS[v.toLowerCase()] ?? Number(v); if (Number.isFinite(h)) { E.setHour(h); actLine(`Time moves to ${v}`); } break; }
    }
  }
  if (actions.some(a => a.kind === "take")) checkFinale();
  if (!$("#journal").hidden) renderJournal();
}
function checkFinale() {
  const holders = E.W.npcs.filter(o => o.spec.has);
  if (!holders.length || S.prog.finale || S.prog.inv.length) return;
  if (!holders.every(o => (S.prog.given[o.name] || []).some(g => same(g, o.spec.has)))) return;
  S.prog.finale = true;
  setTimeout(() => {
    caption("Everything you carried has found its way home. The world will remember you.", 9000);
    toast("Story complete", S.meta.name || "This world");
    WS.Sound.chime(); setTimeout(() => WS.Sound.chime(), 700);
    E.setWeather(E.nightness() > 0.5 ? "aurora" : "petals");
  }, 1200);
  save();
}

/* Recorded voices: when Claude isn't connected, people still follow their own story. */
function offlineReply(n, said) {
  const sp = n.spec, given = S.prog.given[n.name] || [];
  const words = s => String(s || "").toLowerCase().match(/[a-z]{4,}/g) || [];
  const wantsWords = new Set(words(sp.wants));
  const offered = S.prog.inv.find(item => { const w = words(item).filter(x => !["with", "from", "that"].includes(x)); return w.length && w.filter(x => wantsWords.has(x)).length >= Math.min(2, w.length); });
  const canGive = sp.has && !given.some(g => same(g, sp.has)) && !S.prog.inv.some(i => same(i, sp.has));
  const metFor = E.W.npcs.find(o => o !== n && S.prog.met.includes(o.name) && words(o.spec.wants).filter(x => words(sp.has).includes(x)).length >= Math.min(2, words(sp.has).length));
  const metWanted = E.W.npcs.find(o => o !== n && S.prog.met.includes(o.name) && sp.wants && sp.wants.toLowerCase().includes(o.name.toLowerCase()));
  const placeWanted = E.W.landmarks.find(l => S.prog.seen.includes(l.name) && words(l.name).filter(w => w !== "the").some(w => wantsWords.has(w)));
  if (offered && canGive) return `That's it. That's exactly what I needed. I won't forget this. Take the ${sp.has}; you'll know who needs it. [[take:${offered}]] [[give:${sp.has}]]`;
  if (offered) return `You found it. Thank you, truly. [[take:${offered}]]`;
  if (canGive && (metFor || metWanted || placeWanted)) {
    const why = metFor ? `${metFor.name} has been asking after this. Take it to them.` : metWanted ? `So you've seen ${metWanted.name}. Then I owe you this.` : `You've been out to ${placeWanted.name}. Then you've earned this.`;
    return `${why} Here, the ${sp.has}. [[give:${sp.has}]]`;
  }
  const n2 = Math.max(0, (S.prog.talks[n.name] || []).filter(x => x.role === "user").length - 1);
  const home = E.W.landmarks.find(l => same(l.name, sp.home));
  const other = E.W.landmarks[(n2 + n.name.length) % Math.max(1, E.W.landmarks.length)];
  const reveal = other && !S.prog.seen.includes(other.name) ? ` [[reveal:${other.name}]]` : "";
  const bank = [
    sp.knows || "I keep to myself, mostly.",
    sp.wants ? `If you're asking what I need: ${sp.wants.replace(/\.$/, "")}.` : "I need nothing, but thank you for asking.",
    other ? `Have you been to ${other.name}? ${other.about}${reveal}` : "Walk a while. This place shows itself slowly.",
    home ? `${home.name} is home. ${home.about}` : "Home is wherever the wind lets me be.",
    "You ask good questions. Ask the others too; everyone here holds a piece of it.",
  ];
  return bank[n2 % bank.length];
}

/* ---------------------------------------------------------------- journal and map */
function renderJournal() {
  const j = $("#journal"), m = S.meta;
  const places = el("ul", { class: "places" }, E.W.landmarks.map(L => {
    const seen = S.prog.seen.includes(L.name), marked = S.prog.marked.includes(L.name);
    return el("li", { class: seen ? "seen" : marked ? "marked" : "unseen" }, el("i"), el("div", {}, el("b", { text: seen || marked ? L.name : "An unexplored place" }), seen ? el("span", { text: L.about }) : marked ? el("span", { text: "Marked on your map" }) : null));
  }));
  const met = E.W.npcs.filter(n => S.prog.met.includes(n.name));
  const people = el("ul", { class: "people places" }, met.map(n => el("li", { class: "seen" }, el("i"), el("div", {}, el("b", { text: n.name }), el("span", { text: n.role })))));
  const strangers = E.W.npcs.length - met.length;
  j.replaceChildren(
    el("button", { class: "x", type: "button", "aria-label": "Close journal", text: "×", onclick: () => toggleSheet("journal", false) }),
    el("div", { class: "mono", style: "color:var(--accent)", text: "Journal" }),
    el("h2", { text: m.name || "Worldseed" }),
    m.tagline ? el("p", { style: "color:var(--dim)", text: m.tagline }) : null,
    m.lore ? el("p", { text: m.lore }) : null,
    S.goal ? el("div", { class: "goal", text: S.goal }) : null,
    el("h4", { class: "mono", text: `Places · ${S.prog.seen.length} of ${E.W.landmarks.length} found` }), places,
    el("h4", { class: "mono", text: `People · ${met.length} met` }), people,
    strangers ? el("p", { style: "color:var(--dim);margin-top:8px", text: `${strangers} ${strangers === 1 ? "person" : "people"} you haven't met yet.` }) : null,
    el("h4", { class: "mono", text: "Satchel" }),
    S.prog.inv.length ? el("ul", { class: "items" }, S.prog.inv.map(i => el("li", { text: i }))) : el("p", { style: "color:var(--dim)", text: "Empty. People here may give you things if you help them." }),
    el("h4", { class: "mono", text: "Share" }),
    el("p", { style: "color:var(--dim)", text: S.world && S.world.atlas ? "This world is in the Atlas. Anyone who opens it walks here with you, live." : "Keep this world in the Atlas so others can visit, and explore it together." }),
    S.world && !S.world.atlas ? el("button", { class: "btn primary", type: "button", text: "Keep in the Atlas", onclick: keepWorld }) : null);
}

const WORLD_HALF = 160, WORLD_SIZE = 320;
function drawMarkers(x, w, h, toPx, scale) {
  const P = E.player.pos;
  for (const L of E.W.landmarks) {
    const seen = S.prog.seen.includes(L.name), marked = S.prog.marked.includes(L.name);
    if (!seen && !marked && scale < 2) continue;
    const [px, py] = toPx(L.pos.x, L.pos.z);
    x.fillStyle = seen ? getComputedStyle(document.documentElement).getPropertyValue("--accent") : "rgba(244,239,229,.5)";
    x.beginPath(); x.arc(px, py, scale > 1.5 ? 6 : 4, 0, Math.PI * 2); x.fill();
    if (scale > 1.5 && (seen || marked)) {
      x.font = "italic 600 15px 'Bodoni Moda', Georgia, serif"; x.fillStyle = "#f4efe5"; x.textAlign = "center";
      x.shadowColor = "rgba(0,0,0,.7)"; x.shadowBlur = 6; x.fillText(L.name, px, py - 11); x.shadowBlur = 0;
    }
  }
  for (const n of E.W.npcs) {
    if (!S.prog.met.includes(n.name) && scale > 1.5) continue;
    const [px, py] = toPx(n.group.position.x, n.group.position.z);
    x.fillStyle = "#f4efe5"; x.beginPath(); x.arc(px, py, 2.6, 0, Math.PI * 2); x.fill();
  }
  for (const gh of E.W.ghosts.values()) {
    const [px, py] = toPx(gh.group.position.x, gh.group.position.z);
    x.fillStyle = "#7fb4ff"; x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.fill();
  }
  const [px, py] = toPx(P.x, P.z), a = E.player.yaw;
  x.save(); x.translate(px, py); x.rotate(-a + Math.PI);
  x.fillStyle = "#fff"; x.strokeStyle = "#000"; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(0, -8); x.lineTo(5.5, 6); x.lineTo(0, 3); x.lineTo(-5.5, 6); x.closePath(); x.stroke(); x.fill();
  x.restore();
}
function drawMinimap() {
  const c = $("#minimap canvas"), x = c.getContext("2d"), W = c.width, P = E.player.pos;
  const span = 130, k = W / span;
  x.clearRect(0, 0, W, W);
  const src = E.mapCanvas, sk = src.width / WORLD_SIZE;
  x.imageSmoothingEnabled = true;
  x.drawImage(src, (P.x - span / 2 + WORLD_HALF) * sk, (P.z - span / 2 + WORLD_HALF) * sk, span * sk, span * sk, 0, 0, W, W);
  drawMarkers(x, W, W, (wx, wz) => [(wx - P.x) * k + W / 2, (wz - P.z) * k + W / 2], 1);
}
function drawMapView() {
  const c = $("#mapview canvas"); if (!c) return;
  const x = c.getContext("2d"), W = c.width;
  x.drawImage(E.mapCanvas, 0, 0, W, W);
  drawMarkers(x, W, W, (wx, wz) => [(wx + WORLD_HALF) / WORLD_SIZE * W, (wz + WORLD_HALF) / WORLD_SIZE * W], 2);
}
function renderMapView() {
  $("#mapview").replaceChildren(
    el("button", { class: "x", type: "button", "aria-label": "Close map", text: "×", onclick: () => toggleSheet("mapview", false) }),
    el("div", { class: "mono", style: "color:var(--accent);margin-bottom:10px", text: S.meta.name || "Map" }),
    el("canvas", { width: "900", height: "900" }),
    el("div", { class: "legend mono" }, el("span", { text: "● places found" }), el("span", { text: "○ places you've heard of" }), el("span", { text: "▲ you" }), el("span", { style: "color:#7fb4ff", text: "● other explorers" })));
}

/* ---------------------------------------------------------------- reshaping */
const QUICK = [
  ["Let night fall", [{ kind: "time", hour: 22.5 }]], ["Bring the dawn", [{ kind: "time", hour: 6.3 }]], ["Golden hour", [{ kind: "time", hour: 18.1 }]],
  ["Storm", [{ kind: "weather", value: "storm" }]], ["Snow", [{ kind: "weather", value: "snow" }]], ["Fireflies", [{ kind: "weather", value: "fireflies" }]],
  ["Aurora", [{ kind: "time", hour: 23 }, { kind: "weather", value: "aurora" }]], ["Clear skies", [{ kind: "weather", value: "clear" }]],
];
const ASKS = ["A storm rolls in from the sea", "Make it spring, with blossoms everywhere", "Raise a ruined tower on the highest hill", "A traveling bard arrives at the fire", "Turn the sea to glass", "The ruins wake up and begin to glow"];
function renderReshape() {
  const r = $("#reshape");
  const input = el("input", { id: "reshape-in", maxlength: "300", placeholder: "Change the world… “a festival begins in the market”", "aria-label": "Describe a change to the world" });
  const log = el("ol", { id: "reshape-log" });
  const form = el("form", { autocomplete: "off" }, input, el("button", { class: "btn primary", type: "submit", text: "Reshape" }));
  form.addEventListener("submit", e => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; reshape(v); } });
  input.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); toggleSheet("reshape", false); } e.stopPropagation(); });
  r.replaceChildren(
    el("button", { class: "x", type: "button", "aria-label": "Close", text: "×", onclick: () => toggleSheet("reshape", false) }),
    el("div", { class: "mono", style: "color:var(--accent)", text: "Reshape" }),
    el("div", { class: "ideas" }, QUICK.map(([lab, ops]) => el("button", { type: "button", text: lab, onclick: () => { for (const op of ops) { S.world.lines.push(op); queueOp(op, false); } caption(lab); save(); } }))),
    form,
    S.live ? el("div", { class: "ideas" }, ASKS.map(a => el("button", { type: "button", text: "✦ " + a, onclick: () => reshape(a) }))) : el("p", { class: "note", style: "margin-top:10px", text: "The quick changes above work anywhere. Describing your own change needs Claude: open Worldseed on claude.ai." }),
    log);
}
async function reshape(text) {
  if (!S.live) { toast("Needs Claude", "Open Worldseed on claude.ai to reshape worlds by describing them."); return; }
  if (S.reshaping) return;
  S.reshaping = true;
  const log = $("#reshape-log");
  const li = el("li", {}, el("span", { class: "mono", text: "Asked" }), el("span", { text: text }));
  log && log.prepend(li);
  const pend = el("li", {}, el("span", { class: "mono", text: "…" }), el("span", { text: "Claude is reshaping the world" }));
  log && li.after(pend);
  const reader = Mind.lineReader(op => {
    S.world.lines.push(op); queueOp(op, false);
    const [k, t] = GEN_LABEL(op);
    const row = el("li", {}, el("span", { class: "mono", text: k }), el("span", { text: t }));
    pend.before(row);
  });
  try {
    await S.sample(Mind.directorPrompt({ world: S.meta, hour: E.W.hour, weather: E.W.weather, terrain: E.W.terrain,
      palette: Object.fromEntries(Object.entries(E.W.pal).map(([k, v]) => [k, "#" + v.getHexString()])),
      landmarks: E.W.landmarks.map(l => ({ name: l.name, type: l.type, about: l.about })), npcs: E.W.npcs.map(n => ({ name: n.name, role: n.role, home: n.spec.home })),
      flora: E.W.flora.map(f => ({ type: f.type })) }, text), { modelTier: S.tier === "quick" ? "quick" : "default", cache: false, onText: ({ text: t }) => reader.feed(t) });
    reader.end();
    pend.remove();
  } catch (e) {
    pend.lastChild.textContent = e && e.code === "rate_limited" ? "Claude is rate limited. Try again shortly." : "The change didn't finish. Try again.";
  }
  S.reshaping = false;
  save();
}

/* ---------------------------------------------------------------- the atlas (shared, kept worlds) */
function subscribeAtlas() {
  const watch = id => {
    if (S.atlasUsers.has(id) || S.atlasUsers.size >= 40) return;
    const entry = { worlds: [] }; S.atlasUsers.set(id, entry);
    try {
      S.db.collection("atlas/" + id + "/worlds").orderBy("keptAt", "desc").limit(40).onSnapshot(snap => {
        entry.worlds = snap.docs.map(d => Object.assign({ id: d.id, path: "atlas/" + id + "/worlds/" + d.id }, d.data()));
        atlasChanged();
      }, () => {});
    } catch {}
  };
  try {
    if (S.uid) watch(S.uid);
    S.db.collection("atlas").onSnapshot(s => { for (const d of s.docs) watch(d.id); }, () => {});
  } catch { S.db = null; }
}
const atlasChanged = debounce(async () => {
  const ids = [...new Set(atlasWorlds().map(w => w.author).filter(a => a && !S.profiles[a]))];
  if (ids.length && S.user) { try { Object.assign(S.profiles, await S.user.profiles(ids)); } catch {} }
  if (!$("#atlas").hidden) renderAtlas();
}, 150);
const atlasWorlds = () => { const all = []; for (const u of S.atlasUsers.values()) all.push(...u.worlds); return all.sort((a, b) => (b.keptAt || 0) - (a.keptAt || 0)); };

function renderAtlas() {
  const a = $("#atlas");
  const head = [
    el("button", { class: "x", type: "button", "aria-label": "Close atlas", text: "×", onclick: () => toggleSheet("atlas", false) }),
    el("div", { class: "mono", style: "color:var(--accent)", text: "Atlas" }),
    el("h2", { text: "Worlds worth keeping" }),
    el("p", { text: "Worlds people chose to keep. Visit one, and anyone else exploring it shows up beside you, live." }),
  ];
  if (S.mode === "play" && S.world && !S.world.atlas) head.push(el("button", { class: "btn primary", type: "button", text: `Keep “${S.meta.name || "this world"}”`, onclick: keepWorld }));
  if (!S.db) { a.replaceChildren(...head, el("div", { class: "empty", text: S.connecting ? "Connecting to the Atlas…" : "The Atlas is shared through claude.ai. Open Worldseed there while signed in to keep and visit worlds." })); return; }
  const list = atlasWorlds();
  a.replaceChildren(...head, list.length ? el("div", { class: "cards" }, list.map(card)) : el("div", { class: "empty", text: "No worlds kept yet. Grow one, walk around, then keep it here for others." }));
}
function card(w) {
  const mine = w.author === S.uid;
  const who = mine ? "You" : (S.profiles[w.author] && S.profiles[w.author].name) || "Someone";
  const row = el("div", { class: "row" }, el("button", { class: "btn primary", type: "button", text: "Visit", onclick: () => visit(w) }));
  if (mine || S.isOwner) {
    const del = el("button", { class: "btn", type: "button", text: "Delete" });
    del.addEventListener("click", () => row.replaceChildren(
      el("span", { class: "mono", style: "align-self:center", text: "Delete for everyone?" }),
      el("button", { class: "btn", type: "button", text: "Cancel", onclick: renderAtlas }),
      el("button", { class: "btn primary", type: "button", text: "Delete", onclick: async () => { try { await S.db.doc(w.path).delete(); toast("Deleted", w.name); } catch { toast("Couldn't delete", "You may not have permission."); } } })));
    row.append(del);
  }
  return el("article", { class: "card" },
    el("div", { class: "sw", style: `background:linear-gradient(180deg,${w.sky || "#4f7fc4"},${w.horizon || "#f3d7b4"} 70%,${w.accent || "#ffcf6b"})` }),
    el("b", { text: w.name || "Unnamed world" }), el("span", { text: w.tagline || "" }),
    el("div", { class: "mono", text: `${who} · ${ago(w.keptAt || Date.now())}` }), row);
}
async function keepWorld() {
  if (!S.db || !S.uid) { toast("Atlas", "Keeping worlds needs claude.ai while signed in."); return; }
  if (!S.world || S.world.building) return;
  const P = E.W.pal;
  const data = { name: S.meta.name || "Unnamed world", tagline: S.meta.tagline || "", prompt: (S.world.prompt || "").slice(0, 400), lines: S.world.lines,
    sky: "#" + P.skyTop.getHexString(), horizon: "#" + P.skyHorizon.getHexString(), accent: "#" + P.accent.getHexString(), author: S.uid, keptAt: Date.now() };
  if (JSON.stringify(data).length > 240000) { toast("Too large", "This world has grown too large for the Atlas."); return; }
  try {
    const ref = S.db.collection("atlas/" + S.uid + "/worlds").doc();
    await ref.set(data);
    await S.db.doc("atlas/" + S.uid).set({ updatedAt: Date.now() });
    S.world.atlas = { path: ref.path, author: S.uid };
    save();
    toast("Kept", `${data.name} is in the Atlas. Anyone who visits will see you here.`);
    renderJournal(); if (!$("#atlas").hidden) renderAtlas();
    joinRoom();
  } catch (e) {
    toast("Couldn't keep it", e && e.code === "invalid_argument" ? "You can visit the Atlas but not add to it. Ask the owner for Contributor access." : "Try again in a moment.");
  }
}
function visit(w) {
  if (!Array.isArray(w.lines)) return;
  const lines = w.lines.map(Mind.normalize).filter(Boolean);
  const prog = store.get("prog." + w.path, null);
  closeSheets();
  loadWorld({ id: w.id, prompt: w.prompt, lines, atlas: { path: w.path, author: w.author } }, prog);
  E.enqueue(() => arrive(!prog), 0.2);
}
const saveAtlasProg = debounce(() => { if (S.world && S.world.atlas) store.set("prog." + S.world.atlas.path, S.prog); }, 1500);
setInterval(() => { if (S.mode === "play") saveAtlasProg(); }, 6000);

/* ---------------------------------------------------------------- live explorers */
async function joinRoom() {
  leaveRoom();
  if (!S.room || !S.world || !S.world.atlas) return;
  const name = "w-" + WS.hashStr(S.world.atlas.path).toString(36);
  try {
    const r = await S.room.join(name);
    if (!S.world || !S.world.atlas) { r.leave(); return; }
    S.r = r;
    S.rUnsub = [
      r.onPeers(ch => { for (const p of ch.left) E.removeGhost(p.peer); syncPeers(ch.peers); }, () => {}),
      r.on("say", m => { if (m.isMe && m.sameTab) return; const t = String(m.data && m.data.text || "").slice(0, 140); if (!t) return; S.bubbles.set(m.peer, { text: t, until: performance.now() + 7000 }); toast(((m.presence && m.presence.n) || peerName(m.peer)), t); }, () => {}),
    ];
    syncPeers(r.peers());
  } catch {}
}
function peerName(id) { const p = S.peers.find(x => x.peer === id); return (p && p.presence && p.presence.n) || "Explorer"; }
function syncPeers(peers) {
  S.peers = peers.filter(p => !p.isMe);
  for (const p of S.peers) { const d = p.presence || {}; if (typeof d.x === "number") E.setGhost(p.peer, { x: d.x, z: d.z, ry: d.ry, name: d.n, color: d.c }); }
  const live = new Set(S.peers.map(p => p.peer));
  for (const id of [...E.W.ghosts.keys()]) if (!live.has(id)) E.removeGhost(id);
  const n = S.peers.length;
  $("#presence").hidden = !n;
  $("#presence-n").textContent = n === 1 ? "1 other explorer here" : `${n} other explorers here`;
}
function leaveRoom() {
  if (S.rUnsub) S.rUnsub.forEach(f => { try { f(); } catch {} });
  if (S.r) { try { S.r.leave(); } catch {} }
  S.r = null; S.rUnsub = null; S.peers = [];
  for (const id of [...E.W.ghosts.keys()]) E.removeGhost(id);
  $("#presence").hidden = true;
}
let lastSent = { x: 1e9, z: 1e9, ry: 0 };
setInterval(() => {
  if (!S.r || S.mode !== "play" || !E.player.placed) return;
  const P = E.player.pos, ry = E.player.yaw;
  if (Math.hypot(P.x - lastSent.x, P.z - lastSent.z) < 0.05 && Math.abs(ry - lastSent.ry) < 0.05) return;
  lastSent = { x: P.x, z: P.z, ry };
  S.r.presence({ x: +P.x.toFixed(2), z: +P.z.toFixed(2), ry: +ry.toFixed(2), n: S.myName, c: S.myColor }).catch(() => {});
}, 125);
function openChat() {
  if (!S.r) { toast("Alone here", S.world && S.world.atlas ? "Nobody else is connected right now." : "Keep this world in the Atlas to explore it with others."); return; }
  const f = $("#chat"); f.hidden = false; $("#chat-in").focus();
}
$("#chat").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#chat-in").value.trim(); $("#chat-in").value = ""; $("#chat").hidden = true; canvas.focus();
  if (!v || !S.r) return;
  S.r.emit("say", { text: v.slice(0, 140) }).catch(() => toast("Not sent", "The message couldn't be delivered."));
  S.bubbles.set("me", { text: v, until: performance.now() + 7000 });
});
$("#chat-in").addEventListener("keydown", e => { if (e.key === "Escape") { $("#chat").hidden = true; canvas.focus(); } e.stopPropagation(); });

/* ---------------------------------------------------------------- postcard */
async function postcard() {
  const url = E.capture();
  const img = new Image(); img.src = url; await img.decode().catch(() => {});
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const g = x.createLinearGradient(0, c.height * 0.6, 0, c.height); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  const pad = c.width * 0.035, fs = Math.round(c.height * 0.075);
  x.fillStyle = "#f4efe5"; x.font = `italic 500 ${fs}px 'Bodoni Moda', Georgia, serif`; x.textBaseline = "bottom";
  x.fillText(S.meta.name || "Worldseed", pad, c.height - pad - fs * 0.42);
  x.font = `400 ${Math.round(fs * 0.24)}px 'Martian Mono', monospace`; x.fillStyle = "rgba(244,239,229,.75)";
  x.fillText(`WORLDSEED · ${fmtHour(E.W.hour)} · ${E.W.weather.toUpperCase()}`, pad, c.height - pad);
  const flash = el("div", { style: "position:fixed;inset:0;background:#fff;z-index:99;opacity:.85;transition:opacity .6s;pointer-events:none" });
  document.body.append(flash); requestAnimationFrame(() => (flash.style.opacity = "0")); setTimeout(() => flash.remove(), 700);
  const filename = (S.meta.name || "worldseed").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-postcard.jpg";
  c.toBlob(async blob => {
    if (!blob) return;
    if (S.downloads) {
      try { await S.downloads.save({ filename, data: blob }); toast("Postcard", "Saved " + filename); } catch (e) { if (e && e.code !== "declined") toast("Postcard", "Couldn't save it this time."); }
    } else if (!window.claude) {
      const a = el("a", { href: URL.createObjectURL(blob), download: filename }); document.body.append(a); a.click(); a.remove();
    } else toast("Postcard", "Saving files isn't available in this view.");
  }, "image/jpeg", 0.92);
}

/* ---------------------------------------------------------------- sheets and tools */
const SHEETS = { journal: renderJournal, mapview: renderMapView, reshape: renderReshape, atlas: renderAtlas };
const SHEET_BTN = { journal: "#t-journal", mapview: "#t-map", reshape: "#t-reshape", atlas: "#t-atlas" };
function toggleSheet(name, force) {
  const s = $("#" + name), open = force ?? s.hidden;
  if (open) { closeSheets(); if (S.talk && name !== "journal") endTalk(); SHEETS[name](); s.hidden = false; if (name === "reshape") setTimeout(() => $("#reshape-in") && $("#reshape-in").focus(), 20); }
  else { s.hidden = true; canvas.focus(); }
  for (const [k, sel] of Object.entries(SHEET_BTN)) $(sel).setAttribute("aria-pressed", String(!$("#" + k).hidden));
}
function closeSheets() { for (const k of Object.keys(SHEETS)) $("#" + k).hidden = true; for (const sel of Object.values(SHEET_BTN)) $(sel).setAttribute("aria-pressed", "false"); }
$("#t-journal").onclick = () => toggleSheet("journal");
$("#t-map").onclick = () => toggleSheet("mapview");
$("#minimap").onclick = () => toggleSheet("mapview");
$("#t-reshape").onclick = () => toggleSheet("reshape");
$("#t-atlas").onclick = () => toggleSheet("atlas");
$("#t-photo").onclick = postcard;
$("#t-new").onclick = backToTitle;
$("#t-sound").onclick = () => { S.sound = !S.sound; store.set("sound", S.sound); $("#t-sound").setAttribute("aria-pressed", String(S.sound)); S.sound ? WS.Sound.start() : WS.Sound.stop(); };
$("#t-sound").setAttribute("aria-pressed", String(S.sound));
$("#prompt").onclick = () => nearNpc && openTalk(nearNpc);

/* ---------------------------------------------------------------- title screen */
const IDEAS = [
  "a drowned city where the bells still ring at low tide",
  "floating islands tended by retired gods",
  "a mushroom kingdom on the eve of a coronation",
  "a desert of glass where lightning grows like trees",
  "the last autumn forest, where the leaves remember names",
  "a volcanic archipelago run by cheerful dragons",
  "a snowbound observatory town waiting for a comet",
  "a sunken temple garden at the bottom of a dried-up sea",
];
$("#ideas").append(...IDEAS.map(t => el("button", { type: "button", text: t, onclick: () => { $("#seed-in").value = t; grow(t); } })));
$("#seedform").addEventListener("submit", e => { e.preventDefault(); grow($("#seed-in").value); });
$("#seed-in").addEventListener("keydown", e => e.stopPropagation());
const paintTiers = () => document.querySelectorAll("#tiers button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.tier === S.tier)));
$("#tiers").addEventListener("click", e => { const b = e.target.closest("button[data-tier]"); if (!b) return; S.tier = b.dataset.tier; store.set("tier", S.tier); paintTiers(); });
paintTiers();
$("#enter").onclick = () => { if (S.world && !S.world.building) arrive(false); };
$("#title-atlas").onclick = () => { setMode("play"); E.setMode("orbit"); $("#hud").classList.add("hidden"); toggleSheet("atlas", true); $("#title").classList.add("gone"); S.mode = "atlas"; };
function setStatus() {
  const s = $("#status");
  s.dataset.live = S.live ? "1" : "0";
  s.lastChild.textContent = S.connecting ? "Connecting" : S.live ? "Claude · live" : "Recorded worlds · open on claude.ai to grow new ones";
}

/* ---------------------------------------------------------------- controls */
const isTouch = matchMedia("(pointer: coarse)").matches;
if (isTouch) document.body.classList.add("touch");
const keys = new Set();
function syncInput() {
  if (S.talk || S.mode !== "play") { E.input.x = E.input.y = 0; return; }
  if (joy.active) return;
  E.input.x = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  E.input.y = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  E.input.run = keys.has("ShiftLeft") || keys.has("ShiftRight");
}
addEventListener("keydown", e => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  startSound();
  if (S.mode === "title") return;
  if (e.key === "Escape") { if (S.talk) endTalk(); else if (S.mode === "atlas") { toggleSheet("atlas", false); backToTitle(); } else closeSheets(); return; }
  if (S.mode !== "play") return;
  if (S.talk) return;
  const k = e.code;
  if (k === "KeyE" && nearNpc) { e.preventDefault(); openTalk(nearNpc); return; }
  if (k === "KeyJ") { toggleSheet("journal"); return; }
  if (k === "KeyM") { toggleSheet("mapview"); return; }
  if (k === "KeyR") { e.preventDefault(); toggleSheet("reshape"); return; }
  if (k === "KeyT") { e.preventDefault(); openChat(); return; }
  if (k === "KeyP") { postcard(); return; }
  if (k === "Space") { e.preventDefault(); E.input.jump = true; return; }
  if (/^(Key[WASD]|Arrow|Shift)/.test(k)) { keys.add(k); syncInput(); if (k.startsWith("Arrow")) e.preventDefault(); }
});
addEventListener("keyup", e => { keys.delete(e.code); syncInput(); });
addEventListener("blur", () => { keys.clear(); syncInput(); });

let drag = null;
canvas.addEventListener("pointerdown", e => {
  startSound();
  if (S.mode !== "play") return;
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", e => {
  if (!drag || drag.id !== e.pointerId) return;
  E.look(e.clientX - drag.x, e.clientY - drag.y);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", e => { if (S.mode === "play") { e.preventDefault(); E.zoom(e.deltaY); } }, { passive: false });

const joy = { active: false, id: null, cx: 0, cy: 0 };
const joyEl = $("#joy"), knob = joyEl.firstElementChild;
joyEl.addEventListener("pointerdown", e => { startSound(); joyEl.setPointerCapture(e.pointerId); const r = joyEl.getBoundingClientRect(); Object.assign(joy, { active: true, id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }); moveJoy(e); });
joyEl.addEventListener("pointermove", e => { if (joy.active && e.pointerId === joy.id) moveJoy(e); });
const stopJoy = () => { joy.active = false; knob.style.transform = ""; E.input.x = E.input.y = 0; E.input.run = false; };
joyEl.addEventListener("pointerup", stopJoy); joyEl.addEventListener("pointercancel", stopJoy);
function moveJoy(e) {
  let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy; const d = Math.hypot(dx, dy), max = 46;
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  if (S.talk) return;
  E.input.x = dx / max; E.input.y = -dy / max; E.input.run = d > max * 0.95;
}
$("#jumpbtn").addEventListener("pointerdown", () => { E.input.jump = true; });

function startSound() { if (S.sound && !WS.Sound.on) WS.Sound.start(); }
setInterval(() => {
  if (!WS.Sound.on) return;
  const P = E.player.placed ? E.player.pos : E.cam.target;
  let wet = 0;
  if (E.W.hasWater) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; if (E.heightAt(P.x + Math.cos(a) * 22, P.z + Math.sin(a) * 22) < E.W.waterY) wet++; }
  WS.Sound.ambience({ wind: 0.3 + (E.W.weather === "snow" ? 0.4 : 0), water: wet / 10, night: E.nightness(), rain: ["rain", "storm"].includes(E.W.weather) ? 1 : 0 });
}, 600);

/* ---------------------------------------------------------------- boot */
async function connect() {
  const c = window.claude;
  if (c && typeof c.use === "function") {
    const use = n => c.use(n).catch(() => null);
    const [sample, db, user, downloads, room] = await Promise.all([use("sample"), use("db"), use("user"), use("downloads"), use("room")]);
    Object.assign(S, { sample, db, user, downloads, room });
    if (user) {
      try { S.uid = await user.id(); } catch {}
      try { S.isOwner = await user.isOwner(); } catch {}
      try { const me = await user.me(); if (me) { S.myName = me.name || "Explorer"; if (me.color) S.myColor = me.color; } } catch {}
    }
    S.live = !!sample;
  }
  S.connecting = false;
  setStatus();
  readyResolve();
  if (S.db) subscribeAtlas();
  if (S.mode === "play") joinRoom();
}

function boot() {
  setMode("title");
  setStatus();
  const saved = store.get("current", null);
  if (saved && saved.world && Array.isArray(saved.world.lines) && saved.world.lines.length) {
    const lines = saved.world.lines.map(Mind.normalize).filter(Boolean);
    loadWorld(Object.assign({}, saved.world, { lines, building: false }), saved.prog);
  } else {
    const seed = window.WS_SEEDS[0];
    loadWorld({ id: "seed-" + seed.key, prompt: "", lines: seed.lines.map(Mind.normalize).filter(Boolean), atlas: null }, null);
  }
  connect();
}
boot();
window.WS_DEBUG = { E, S };
})();

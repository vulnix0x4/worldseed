/* Ephemera — a computer with no installed software.
   Every app is written by Claude on request, streamed into a sandboxed window,
   and forgotten when it closes unless someone keeps it. */
(() => {
"use strict";

/* ================================================================ utilities */

const $ = (s, r = document) => r.querySelector(s);
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
const local = {
  get(k, d) { try { const v = localStorage.getItem("eph." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("eph." + k, JSON.stringify(v)); return true; } catch { return false; } },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function toast(msg, ms = 3800) {
  const t = el("div", { class: "toast", text: msg });
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}
function cssColor(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const narrowMQ = matchMedia("(max-width: 760px)");
const isNarrow = () => narrowMQ.matches;

const I = {
  x: '<svg viewBox="0 0 10 10" fill="none" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg>',
  min: '<svg viewBox="0 0 10 10" fill="none" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 5h5"/></svg>',
  max: '<svg viewBox="0 0 10 10" fill="none" stroke-width="1.5"><path d="M2.5 2.5h5v5h-5z"/></svg>',
  code: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>',
  prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
  next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
  keep: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 1.5h6v9L6 8.2 3 10.5z"/></svg>',
  check: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>',
  spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4z" fill="currentColor"/></svg>',
};

/* ================================================================ state */

const S = {
  mode: "connecting",          // connecting | live | demo
  denied: false,
  sample: null, db: null, user: null, downloads: null,
  uid: null, isOwner: false,
  tier: local.get("tier", "default"),
  lines: local.get("lines", 0),
  wins: new Map(),
  focused: null,
  z: 10,
  keepUsers: new Map(),
  profiles: {},
  stores: new Map(),
};
let readyResolve; S.ready = new Promise(r => (readyResolve = r));

/* ================================================================ the field
   A 1-bit, ordered-dither interference pattern behind everything. It brightens
   around windows that are being built and rings outward when an app is born. */

const Field = (() => {
  const cv = $("#field"), cx = cv.getContext("2d");
  const PX = 3;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let W = 0, H = 0, img, buf, ink = 0, t = Math.random() * 50, last = 0, running = false;
  let ax, sx, cxx, by, sy, cyy;
  const pulses = [], glows = new Map();
  let mx = -1e5, my = -1e5;

  function readInk() {
    const [r, g, b] = cssColor("--field");
    ink = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  function resize() {
    W = Math.max(1, Math.ceil((innerWidth || 1) / PX)); H = Math.max(1, Math.ceil((innerHeight || 1) / PX));
    cv.width = W; cv.height = H;
    img = cx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
    ax = new Float32Array(W); sx = new Float32Array(W); cxx = new Float32Array(W);
    by = new Float32Array(H); sy = new Float32Array(H); cyy = new Float32Array(H);
    readInk(); draw();
  }
  function draw() {
    const s = 0.021, now = performance.now();
    for (let x = 0; x < W; x++) { ax[x] = Math.sin(x * s * 1.25 + t * 0.5); sx[x] = Math.sin(x * s * 0.8); cxx[x] = Math.cos(x * s * 0.8); }
    for (let y = 0; y < H; y++) { by[y] = Math.sin(y * s * 1.7 - t * 0.37); sy[y] = Math.sin(y * s * 0.8 + t * 0.23); cyy[y] = Math.cos(y * s * 0.8 + t * 0.23); }
    const rcx = W * (0.68 + 0.08 * Math.sin(t * 0.21)), rcy = H * (0.4 + 0.1 * Math.cos(t * 0.17));
    const live = [];
    for (let i = pulses.length - 1; i >= 0; i--) {
      const a = (now - pulses[i].t0) / 1700;
      if (a >= 1) { pulses.splice(i, 1); continue; }
      live.push({ x: pulses[i].x, y: pulses[i].y, r: a * Math.max(W, H) * 0.75, amp: (1 - a) * 0.9 });
    }
    const gl = [...glows.values()];
    const breathe = 0.75 + 0.25 * Math.sin(t * 9);
    buf.fill(0);
    for (let y = 0; y < H; y++) {
      const row = y * W, b = by[y], sY = sy[y], cY = cyy[y], dy = y - rcy, by4 = (y & 3) << 2;
      for (let x = 0; x < W; x++) {
        const dx = x - rcx;
        let f = ax[x] + b + (sx[x] * cY + cxx[x] * sY) + Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.055 - t * 0.8);
        let n = (f + 4) * 0.125; n *= n; let d = n * n * 0.7;
        for (let k = 0; k < live.length; k++) {
          const p = live[k], ex = x - p.x, ey = y - p.y, dd = Math.sqrt(ex * ex + ey * ey) - p.r;
          if (dd > -18 && dd < 18) d += p.amp * Math.exp(-(dd * dd) / 90);
        }
        for (let k = 0; k < gl.length; k++) {
          const g = gl[k], ex = x - g.x, ey = y - g.y;
          if (ex > -g.rx * 1.8 && ex < g.rx * 1.8 && ey > -g.ry * 1.8 && ey < g.ry * 1.8)
            d += 0.55 * breathe * Math.exp(-((ex * ex) / (2 * g.rx * g.rx) + (ey * ey) / (2 * g.ry * g.ry)));
        }
        const ex = x - mx, ey = y - my;
        if (ex > -40 && ex < 40 && ey > -40 && ey < 40) d += 0.4 * Math.exp(-(ex * ex + ey * ey) / 300);
        if (d > BAYER[by4 | (x & 3)]) buf[row + x] = ink;
      }
    }
    cx.putImageData(img, 0, 0);
  }
  function loop(ts) {
    if (!running) return;
    if (!document.hidden && ts - last > 62) {
      t += Math.min(ts - last, 200) / 1000 * 0.35;
      last = ts;
      draw();
    }
    requestAnimationFrame(loop);
  }
  function start() {
    resize();
    addEventListener("resize", debounce(resize, 120));
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(() => { readInk(); draw(); }, 30));
    new MutationObserver(() => { readInk(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    addEventListener("pointermove", e => { mx = e.clientX / PX; my = e.clientY / PX; }, { passive: true });
    document.addEventListener("pointerleave", () => { mx = my = -1e5; });
    if (!reduce.matches) { running = true; requestAnimationFrame(loop); }
  }
  return {
    start,
    pulse(x, y) { if (reduce.matches) return; pulses.push({ x: x / PX, y: y / PX, t0: performance.now() }); },
    glow(id, r) {
      if (!r) glows.delete(id);
      else glows.set(id, { x: (r.left + r.width / 2) / PX, y: (r.top + r.height / 2) / PX, rx: r.width / PX * 0.55, ry: r.height / PX * 0.55 });
      if (reduce.matches) draw();
    },
  };
})();

/* ================================================================ the prompt
   Everything Claude needs to compile a sentence into a working program. */

const ENV_RULES = `Environment the app runs in:
- A sandboxed window with NO network: no CDNs, no web fonts, no external images, no fetch or XHR to other sites. Use system font stacks, inline SVG, canvas, CSS and the Web Audio API. Everything lives in this one file.
- localStorage works and persists for this app. Use it to keep the person's data and settings (wrap reads in try/catch, and handle an empty store).
- alert(), confirm(), prompt() and window.open() do not work. Build dialogs, confirmations and messages into the page.
- Claude is available to the app through a global function:
    const text = await ai("prompt")                    // resolves with a string
    const data = await ai.json("prompt")               // resolves with parsed JSON; describe the exact JSON shape in the prompt
    await ai("prompt", { onText: t => (out.textContent = t) })  // streams; t is the whole answer so far
    ai("prompt", { tier: "smart" })                    // slower, better reasoning; default is fast
  Each call is memoryless, so put all needed context and the output format in the prompt. Calls take 1-10 s and spend the person's Claude usage, so call ai only from a deliberate action (a button, Enter), never in a loop or on a timer, and never on load. While waiting, show a loading state and disable the trigger. Wrap every call in try/catch and show the error message in the UI.
  Use ai wherever understanding language, writing, knowledge, judgment or generated content would make the app genuinely better than a static tool. That is what makes this app worth more than the one it replaces. Don't force it into apps that don't benefit.
- The window can be resized anywhere from about 340px to 1200px wide and 300px to 900px tall. Use a fluid layout that never scrolls sideways; let content scroll vertically inside the page if needed.`;

const QUALITY_RULES = `Quality bar (this replaces an app someone would have downloaded or paid for):
- It fully works on first run. Real logic, sensible defaults, and realistic sample data where an empty screen would show nothing. No placeholders, TODOs, lorem ipsum, or buttons that do nothing.
- A deliberate visual identity that suits its purpose: a specific palette defined as CSS custom properties (avoid generic purple-blue gradients), confident type from system stacks (for example ui-rounded, ui-serif, ui-monospace or system-ui), clear hierarchy, generous spacing. Support light and dark with prefers-color-scheme.
- Considered states: hover, focus-visible, active, disabled, loading, empty and error. Smooth, quick transitions; respect prefers-reduced-motion. Keyboard shortcuts where they're natural.
- Robust code with no runtime errors: guard every input, never assume an element exists before creating it. Keep it under roughly 650 lines.`;

const FORMAT_RULES = `Reply format — follow exactly, because your reply is executed directly:
1. The first line is a metadata comment:
<!--ephemera {"name":"...","tagline":"...","glyph":"...","hue":0,"w":560,"h":640}-->
   name: 1-3 words, a real product name (never "App" or "Tool"). tagline: under 60 characters, what it does. glyph: 1-2 characters for its icon (letters or a symbol, no emoji). hue: 0-359 for its icon color. w and h: the ideal window size in pixels (w 360-1100, h 360-860).
2. Then the complete HTML document, starting with <!doctype html>.
No Markdown code fences and no explanation before or after.
Order inside the document, because it is shown progressively while you write: <head> with meta charset, meta viewport, <title> and ONE <style> block; then the <body> markup; then ONE <script> as the last thing in <body>.`;

function conjurePrompt(request) {
  return `You are the compiler inside Ephemera, a computer with no installed software. A person describes what they need, and you write it on the spot as one complete, self-contained HTML file that runs immediately in a window.

The person asked for:
"""
${request}
"""

Interpret the request generously and build the best version of it a thoughtful product designer and engineer would ship. If it is vague, choose a specific, delightful take on it.

${ENV_RULES}

${QUALITY_RULES}

${FORMAT_RULES}`;
}

function revisePrompt(v, job, original) {
  const intro = job.kind === "fix"
    ? `It crashed while running. Fix the root cause of this error and change nothing else:\n"""\n${job.change}\n"""`
    : `The person asked for this change:\n"""\n${job.change}\n"""\nApply it fully and well, and keep everything else that works.`;
  return `You are the compiler inside Ephemera, a computer with no installed software. Apps are written on request as one self-contained HTML file. You are revising an existing app.

${original ? `It was originally requested as: "${original}"\n\n` : ""}Its current complete source:
<current_source>
${v.code}
</current_source>

${intro}
Keep the same localStorage keys so the person's saved data survives. Keep the name unless the change calls for a new one.

${ENV_RULES}

${QUALITY_RULES}

${FORMAT_RULES}
Return the complete updated file, not a diff.`;
}

/* ================================================================ parsing the stream */

function splitOut(text) {
  let t = text.replace(/^\s*```[\w-]*[ \t]*\n?/, "");
  let meta = null;
  const m = /<!--\s*ephemera\s*(\{[\s\S]*?\})\s*-->/i.exec(t);
  if (m) {
    try { meta = JSON.parse(m[1]); } catch { meta = null; }
    t = t.slice(0, m.index) + t.slice(m.index + m[0].length);
  } else if (/^\s*<!--\s*e/i.test(t) && !/-->/.test(t)) {
    t = "";
  }
  const i = t.search(/<!doctype|<html/i);
  let code = i >= 0 ? t.slice(i) : (/<(head|body|style|main|div)\b/i.test(t) ? t.trimStart() : "");
  code = code.replace(/\n?```\s*$/, "");
  return { meta, code };
}
function cleanMeta(meta, code) {
  meta = meta && typeof meta === "object" ? meta : {};
  const title = (/<title>([^<]{1,60})<\/title>/i.exec(code) || [])[1];
  const name = String(meta.name || title || "Untitled").trim().slice(0, 40) || "Untitled";
  const glyph = Array.from(String(meta.glyph || name).replace(/\s+/g, "")).slice(0, 2).join("") || "·";
  const hue = ((Number(meta.hue) % 360) + 360) % 360 || Math.floor(Math.random() * 360);
  return {
    name, glyph, hue,
    tagline: String(meta.tagline || "").slice(0, 90),
    w: clamp(Number(meta.w) || 560, 340, 1100),
    h: clamp(Number(meta.h) || 620, 320, 860),
  };
}
function parseOut(text) {
  const { meta, code } = splitOut(text);
  const ok = /<(body|main|div|canvas|svg|section|button|script)\b/i.test(code);
  return { ok, code: code.trim(), meta: cleanMeta(meta, code) };
}
function partialSafe(code) {
  let s = code;
  const lt = s.lastIndexOf("<"), gt = s.lastIndexOf(">");
  if (lt > gt) s = s.slice(0, lt);
  return s.replace(/<script\b[\s\S]*?(<\/script\s*>|$)/gi, "");
}
function phaseOf(code) {
  const c = code.toLowerCase();
  const b = c.indexOf("<body"), sc = c.lastIndexOf("<script");
  if (sc > -1 && (b === -1 || sc > b)) return 3;
  if (b > -1) return 2;
  return c.length ? 1 : 0;
}
function highlight(src) {
  return src.replace(
    /(<!--[\s\S]*?(?:-->|$))|(<\/?[a-zA-Z][\w-]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(function|const|let|var|return|if|else|for|while|new|class|await|async|true|false|null|try|catch)\b|([&<>])/g,
    (m, c, t, s, k, e) => c ? `<span class="t-com">${esc(c)}</span>`
      : t ? `<span class="t-tag">${esc(t)}</span>`
      : s ? `<span class="t-str">${esc(s)}</span>`
      : k ? `<span class="t-kw">${k}</span>`
      : esc(e));
}

/* ================================================================ the bridge
   Injected at the top of every app. Gives it ai(), a persistent localStorage,
   and reports crashes back so Ephemera can offer a fix. Kept free of line
   comments because it is flattened onto the app's <head> line, which keeps
   the app's own error line numbers accurate. */

function bridgeMain(INIT, STANDALONE) {
  var P = window.parent, seq = 0, pend = {};
  function post(type, payload, id) { if (STANDALONE) return; try { P.postMessage({ __eph: 1, id: id, type: type, payload: payload }, "*"); } catch (e) {} }
  function call(type, payload, onPart) {
    if (STANDALONE) return Promise.reject(new Error("This app was conjured in Ephemera. Its AI features only work there."));
    return new Promise(function (res, rej) { var id = ++seq; pend[id] = { res: res, rej: rej, onPart: onPart }; post(type, payload, id); });
  }
  window.addEventListener("message", function (e) {
    if (e.source !== P) return;
    var d = e.data; if (!d || d.__eph !== 1 || !pend[d.id]) return;
    var p = pend[d.id];
    if ("part" in d) { if (p.onPart) { try { p.onPart(d.part); } catch (x) {} } return; }
    delete pend[d.id];
    if (d.error) { p.rej(new Error(d.error)); } else { p.res(d.result); }
  });
  function str(x) { return typeof x === "string" ? x : JSON.stringify(x); }
  function ai(prompt, opts) { opts = opts || {}; return call("ai", { prompt: str(prompt), json: false, tier: opts.tier || "", stream: typeof opts.onText === "function" }, opts.onText); }
  ai.json = function (prompt, opts) { opts = opts || {}; return call("ai", { prompt: str(prompt), json: true, tier: opts.tier || "" }); };
  window.ai = ai;
  if (STANDALONE) return;
  function mk(data, persist) {
    var has = function (k) { return Object.prototype.hasOwnProperty.call(data, k); };
    var api = {
      getItem: function (k) { k = String(k); return has(k) ? data[k] : null; },
      setItem: function (k, v) { k = String(k); v = String(v); data[k] = v; if (persist) post("store", { op: "set", k: k, v: v }); },
      removeItem: function (k) { k = String(k); delete data[k]; if (persist) post("store", { op: "del", k: k }); },
      clear: function () { for (var k in data) delete data[k]; if (persist) post("store", { op: "clear" }); },
      key: function (i) { var ks = Object.keys(data); return i < ks.length ? ks[i] : null; }
    };
    return new Proxy(api, {
      get: function (t, k) { if (k === "length") return Object.keys(data).length; if (k in t) return t[k]; if (typeof k === "symbol") return undefined; return t.getItem(k); },
      set: function (t, k, v) { t.setItem(k, v); return true; },
      deleteProperty: function (t, k) { t.removeItem(k); return true; },
      has: function (t, k) { return k in t || has(k); },
      ownKeys: function () { return Object.keys(data); },
      getOwnPropertyDescriptor: function (t, k) { return has(k) ? { value: data[k], enumerable: true, configurable: true, writable: true } : undefined; }
    });
  }
  try { Object.defineProperty(window, "localStorage", { value: mk(INIT || {}, true), configurable: true }); } catch (e) {}
  try { Object.defineProperty(window, "sessionStorage", { value: mk({}, false), configurable: true }); } catch (e) {}
  window.alert = function (m) { post("alert", { message: String(m) }); };
  window.confirm = function () { return true; };
  window.prompt = function () { return null; };
  window.addEventListener("error", function (e) { post("error", { message: String(e.message || "Script error"), line: e.lineno || 0 }); });
  window.addEventListener("unhandledrejection", function (e) { var r = e.reason; post("error", { message: "Unhandled rejection: " + String((r && r.message) || r), line: 0 }); });
}
const BRIDGE_SRC = bridgeMain.toString().replace(/\n\s*/g, " ");

function injectBridge(code, init, standalone) {
  const json = JSON.stringify(init || {}).replace(/</g, "\\u003c");
  const tag = `<script>(${BRIDGE_SRC})(${json},${standalone ? "true" : "false"});<\/script>`;
  const head = /<head[^>]*>/i.exec(code);
  if (head) return code.slice(0, head.index + head[0].length) + tag + code.slice(head.index + head[0].length);
  const dt = /<!doctype[^>]*>/i.exec(code);
  if (dt) return code.slice(0, dt.index + dt[0].length) + tag + code.slice(dt.index + dt[0].length);
  return tag + code;
}

function appStore(key) {
  if (!S.stores.has(key)) S.stores.set(key, local.get("app." + key, {}));
  return S.stores.get(key);
}
const flushStores = debounce(() => {
  for (const [k, v] of S.stores) {
    if (JSON.stringify(v).length < 400000) local.set("app." + k, v);
  }
}, 400);

addEventListener("message", e => {
  const d = e.data;
  if (!d || d.__eph !== 1 || !e.source) return;
  let w = null;
  for (const x of S.wins.values()) if (x.frame && x.frame.contentWindow === e.source) { w = x; break; }
  if (!w) return;
  const src = e.source;
  const reply = m => { try { src.postMessage(Object.assign({ __eph: 1, id: d.id }, m), "*"); } catch {} };
  const p = d.payload || {};
  if (d.type === "store") {
    const st = appStore(w.app.appKey);
    if (p.op === "set") st[String(p.k)] = String(p.v);
    else if (p.op === "del") delete st[String(p.k)];
    else if (p.op === "clear") for (const k of Object.keys(st)) delete st[k];
    flushStores();
  } else if (d.type === "error") {
    showCrash(w, p);
  } else if (d.type === "alert") {
    toast(curMeta(w).name + ": " + String(p.message || "").slice(0, 200));
  } else if (d.type === "ai") {
    bridgeAI(w, p, reply);
  }
});

function aiErrorCopy(e) {
  switch (e && e.code) {
    case "not_granted": return "Claude access was declined for this page.";
    case "rate_limited": return "Claude is rate limited right now. Wait a moment and try again.";
    case "refused": return "Claude declined that request.";
    case "invalid_json": return "Claude's answer wasn't valid JSON. Try again.";
    case "prompt_too_large": return "That request is too large for one call.";
    case "session_expired": return "Your Claude session expired. Sign in again.";
    case "sampling_disabled": return "Claude isn't available on this account.";
    case "cancelled": return "The request was cancelled.";
    default: return (e && e.message) || "Claude couldn't answer. Try again.";
  }
}

async function bridgeAI(w, p, reply) {
  await S.ready;
  if (!S.sample || S.denied) return reply({ error: "Claude isn't connected here. Open Ephemera on claude.ai to use this app's AI features." });
  const a = w.app;
  if (!a.trusted && a.ai !== "allow") {
    if (a.ai === "block") return reply({ error: "AI access is blocked for this app." });
    const ok = await askConsent(w);
    if (!ok) return reply({ error: "AI access is blocked for this app." });
  }
  const now = Date.now();
  w.aiTimes = (w.aiTimes || []).filter(t => now - t < 60000);
  if (w.aiTimes.length >= 30) return reply({ error: "This app is calling Claude too often. Slow down and try again in a minute." });
  w.aiTimes.push(now);
  const prompt = String(p.prompt || "").slice(0, 150000);
  if (!prompt.trim()) return reply({ error: "The prompt was empty." });
  while ((w.aiBusy || 0) >= 2) await sleep(120);
  w.aiBusy = (w.aiBusy || 0) + 1;
  w.ui.glyph.classList.add("spin");
  const opts = { modelTier: p.tier === "smart" || p.tier === "default" || p.tier === "complex" ? "default" : "quick", cache: false };
  if (p.stream) opts.onText = ({ text }) => reply({ part: text });
  try {
    if (p.json) reply({ result: await S.sample.json(prompt, opts) });
    else reply({ result: (await S.sample(prompt, opts)).text });
  } catch (err) {
    reply({ error: aiErrorCopy(err) });
    if (err && err.code === "not_granted") goDenied();
  } finally {
    w.aiBusy--;
    if (!w.aiBusy && !w.building) w.ui.glyph.classList.remove("spin");
    renderTray();
  }
}

function askConsent(w) {
  if (w.consent) return w.consent;
  w.consent = new Promise(res => {
    const done = v => { w.app.ai = v ? "allow" : "block"; note.remove(); w.consent = null; persistSoon(); res(v); };
    const note = el("div", { class: "note consent" },
      el("p", {}, el("b", { text: curMeta(w).name }), " wants to use Claude. Calls run on your account and use your usage."),
      el("button", { class: "btn", type: "button", text: "Block", onclick: () => done(false) }),
      el("button", { class: "btn signal", type: "button", text: "Allow", onclick: () => done(true) }));
    w.ui.body.append(note);
  });
  return w.consent;
}

function showCrash(w, p) {
  if (w.building || w.crashShown) return;
  w.crashShown = true;
  const msg = String(p.message || "Unknown error").slice(0, 300);
  const where = p.line ? ` (line ${p.line})` : "";
  const note = el("div", { class: "note" },
    el("p", {}, "This app crashed: ", el("code", { text: msg + where })),
    el("button", { class: "btn", type: "button", text: "Dismiss", onclick: () => note.remove() }),
    S.mode === "live" ? el("button", { class: "btn primary", type: "button", text: "Fix it", onclick: () => { note.remove(); runBuild(w, { kind: "fix", change: msg + where }); } }) : null);
  w.ui.body.append(note);
}

function showNote(w, kind, text, ms = 7000) {
  const note = el("div", { class: "note " + kind },
    el("p", { text }),
    el("button", { class: "btn", type: "button", text: "OK", onclick: () => note.remove() }));
  w.ui.body.append(note);
  if (ms) setTimeout(() => note.remove(), ms);
}

/* ================================================================ windows */

const desk = $("#desk"), os = $("#os");
const deskRect = () => desk.getBoundingClientRect();

function fitRect(r) {
  const d = deskRect();
  const w = clamp(r.w, 300, Math.max(300, d.width - 8));
  const h = clamp(r.h, 220, Math.max(220, d.height - 8));
  return { w, h, x: clamp(r.x, -w + 140, d.width - 140), y: clamp(r.y, 0, Math.max(0, d.height - 44)) };
}
function cascadeRect(size = {}) {
  const d = deskRect();
  const w = Math.min(size.w || 560, d.width - 32), h = Math.min(size.h || 600, d.height - 32);
  const n = [...S.wins.values()].filter(x => !x.min).length % 6;
  return fitRect({ w, h, x: (d.width - w) / 2 + n * 26 - 40, y: Math.max(12, (d.height - h) / 2 - 10) + n * 22 - 30 });
}
function place(w, r) {
  w.rect = fitRect(r);
  Object.assign(w.el.style, { left: w.rect.x + "px", top: w.rect.y + "px", width: w.rect.w + "px", height: w.rect.h + "px" });
}
function applyMax(w) {
  if (w.max) Object.assign(w.el.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
  else place(w, w.rect);
  w.el.classList.toggle("max", w.max);
}
function animateTo(w, r) {
  if (w.max || isNarrow()) { w.rect = fitRect(r); return; }
  w.el.classList.add("animate");
  place(w, r);
  setTimeout(() => w.el.classList.remove("animate"), 420);
}

function makeWindow(o) {
  const id = o.id || "w" + uid();
  const w = { id, kind: o.kind, app: o.app || null, max: false, min: false, rect: null };
  const root = el("section", { class: "win" + (S.booted ? " enter" : ""), "data-id": id, "data-kind": o.kind, role: "region" });
  const glyph = el("span", { class: "glyph", "aria-hidden": "true" });
  const name = el("b"), sub = el("span");
  const acts = el("div", { class: "acts" });
  const bar = el("header", { class: "bar" },
    el("div", { class: "lights" },
      el("button", { class: "x", type: "button", "aria-label": "Close", html: I.x, onclick: () => closeWin(w) }),
      el("button", { class: "m", type: "button", "aria-label": "Minimize", html: I.min, onclick: () => minimize(w) }),
      el("button", { class: "z", type: "button", "aria-label": "Maximize", html: I.max, onclick: () => toggleMax(w) })),
    glyph, el("div", { class: "ttl" }, name, sub), acts);
  const body = el("div", { class: "body" });
  root.append(bar, body);
  w.el = root;
  w.ui = { bar, glyph, name, sub, acts, body };
  for (const dir of ["e", "s", "se"]) {
    const hnd = el("div", { class: "rz rz-" + dir, "aria-hidden": "true" });
    hnd.addEventListener("pointerdown", e => startResize(w, e, dir));
    root.append(hnd);
  }
  bar.addEventListener("pointerdown", e => startDrag(w, e));
  bar.addEventListener("dblclick", e => { if (!e.target.closest("button")) toggleMax(w); });
  root.addEventListener("pointerdown", () => focusWin(w), true);
  desk.append(root);
  S.wins.set(id, w);
  setTitle(w, o.title || "Untitled", o.sub || "");
  setGlyph(w, o.glyph, o.hue, o.ink);
  place(w, o.rect || cascadeRect(o.size));
  focusWin(w);
  renderTray();
  return w;
}

function setTitle(w, name, sub) {
  w.ui.name.textContent = name;
  if (sub != null) w.ui.sub.textContent = sub;
  w.el.setAttribute("aria-label", name);
}
function setGlyph(w, g, hue, ink) {
  const n = w.ui.glyph;
  n.textContent = g || "";
  n.classList.toggle("ink", !!ink);
  n.style.setProperty("--h", hue == null ? 40 : hue);
}

function startDrag(w, e) {
  if (e.button !== 0 || e.target.closest("button,input,a") || w.max || isNarrow()) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, r0 = { ...w.rect }, bar = w.ui.bar;
  bar.setPointerCapture(e.pointerId);
  os.classList.add("dragging");
  const move = ev => place(w, { ...r0, x: r0.x + ev.clientX - sx, y: r0.y + ev.clientY - sy });
  const up = () => {
    bar.removeEventListener("pointermove", move);
    os.classList.remove("dragging");
    persistSoon();
  };
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", up, { once: true });
  bar.addEventListener("pointercancel", up, { once: true });
}
function startResize(w, e, dir) {
  if (e.button !== 0 || w.max) return;
  e.preventDefault(); e.stopPropagation();
  focusWin(w);
  const h = e.currentTarget, sx = e.clientX, sy = e.clientY, r0 = { ...w.rect };
  h.setPointerCapture(e.pointerId);
  os.classList.add("dragging");
  const move = ev => place(w, {
    ...r0,
    w: dir.includes("e") ? r0.w + ev.clientX - sx : r0.w,
    h: dir.includes("s") ? r0.h + ev.clientY - sy : r0.h,
  });
  const up = () => { h.removeEventListener("pointermove", move); os.classList.remove("dragging"); persistSoon(); };
  h.addEventListener("pointermove", move);
  h.addEventListener("pointerup", up, { once: true });
  h.addEventListener("pointercancel", up, { once: true });
}

function focusWin(w) {
  if (!w || S.focused === w && w.el.style.zIndex == S.z) return;
  if (w.min) { w.min = false; w.el.classList.remove("min"); }
  w.el.style.zIndex = ++S.z;
  for (const x of S.wins.values()) x.el.classList.toggle("focus", x === w);
  S.focused = w;
  renderTray();
}
function topWindow(except) {
  let best = null;
  for (const x of S.wins.values()) if (x !== except && !x.min && (!best || +x.el.style.zIndex > +best.el.style.zIndex)) best = x;
  return best;
}
function minimize(w) {
  w.min = true;
  w.el.classList.add("min");
  w.el.classList.remove("focus");
  if (S.focused === w) { S.focused = null; focusWin(topWindow(w)); }
  renderTray(); persistSoon();
}
function toggleMax(w) {
  w.max = !w.max;
  applyMax(w);
  persistSoon();
}
function closeWin(w) {
  if (w.ctl) w.ctl.abort();
  Field.glow(w.id, null);
  S.wins.delete(w.id);
  if (S.focused === w) { S.focused = null; focusWin(topWindow(w)); }
  w.el.classList.add("closing");
  setTimeout(() => w.el.remove(), 190);
  renderTray(); persistSoon();
}

addEventListener("blur", () => setTimeout(() => {
  const a = document.activeElement;
  if (a && a.tagName === "IFRAME") {
    const we = a.closest(".win");
    if (we) focusWin(S.wins.get(we.dataset.id));
  }
}, 0));

function renderTray() {
  const tray = $("#tray");
  tray.replaceChildren(...[...S.wins.values()].map(w => {
    const g = w.ui.glyph.cloneNode(true);
    if (!w.building && !w.aiBusy) g.classList.remove("spin");
    const b = el("button", {
      type: "button", title: w.ui.name.textContent, "aria-label": w.ui.name.textContent,
      class: (w === S.focused ? "active " : "") + (w.min ? "minimized" : ""),
      onclick: () => { if (w === S.focused && !w.min) minimize(w); else focusWin(w); },
    }, g);
    return b;
  }));
}

/* ================================================================ app windows */

const cur = w => w.app && w.app.versions[w.app.vi];
const curMeta = w => (cur(w) && cur(w).meta) || { name: w.ui.name.textContent, glyph: "", hue: 40 };

function sourceLabel(a) {
  if (a.source === "example") return "example";
  if (a.source === "demo") return "recorded build";
  if (a.source === "keep") return a.author === S.uid ? "kept by you" : "kept by " + ((S.profiles[a.author] && S.profiles[a.author].name) || "someone");
  return "conjured";
}

function openApp(app, opts = {}) {
  app.versions = app.versions || [];
  if (app.vi == null || app.vi >= app.versions.length) app.vi = app.versions.length - 1;
  const v = app.versions[app.vi];
  const meta = v ? v.meta : { name: "Conjuring…", glyph: "", hue: 30, w: 560, h: 600 };
  const w = makeWindow({ kind: "app", title: meta.name, glyph: meta.glyph, hue: meta.hue, rect: opts.rect, size: { w: meta.w, h: meta.h }, app });

  const verLabel = el("span");
  const prev = el("button", { class: "ib", type: "button", "aria-label": "Previous version", html: I.prev, onclick: () => stepVersion(w, -1) });
  const next = el("button", { class: "ib", type: "button", "aria-label": "Next version", html: I.next, onclick: () => stepVersion(w, 1) });
  const ver = el("div", { class: "ver", title: "Versions" }, prev, verLabel, next);
  const srcBtn = el("button", { class: "ib", type: "button", title: "View source", "aria-label": "View source", "aria-pressed": "false", html: I.code, onclick: () => toggleSource(w) });
  const dlBtn = el("button", { class: "ib", type: "button", title: "Download as .html", "aria-label": "Download as HTML file", html: I.down, onclick: () => downloadApp(w) });
  const keepBtn = el("button", { class: "keepbtn", type: "button", onclick: () => keepApp(w) });
  w.ui.acts.append(ver, srcBtn, dlBtn, keepBtn);
  Object.assign(w.ui, { verLabel, prev, next, ver, srcBtn, dlBtn, keepBtn });

  const frames = el("div", { class: "frames" });
  w.ui.body.append(frames);
  w.ui.frames = frames;

  const input = el("input", { type: "text", id: "remix-" + w.id, placeholder: "Change this app… e.g. “add a dark mode”", "aria-label": "Describe a change", autocomplete: "off" });
  const go = el("button", { type: "submit", text: "Rewrite" });
  const form = el("form", { class: "remix" }, el("span", { html: I.spark, "aria-hidden": "true" }), input, go);
  form.addEventListener("submit", e => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t || w.building || !cur(w)) return;
    if (S.mode !== "live") { showNote(w, "info", "Rewriting needs Claude. Open Ephemera on claude.ai to change apps by asking."); return; }
    input.value = "";
    runBuild(w, { kind: "change", change: t });
  });
  w.el.append(form);
  w.ui.remixInput = input; w.ui.remixGo = go;

  if (v) mountVersion(w);
  else { w.ui.glyph.classList.add("spin"); refreshActs(w); }
  return w;
}

function refreshActs(w) {
  if (w.kind !== "app") return;
  const a = w.app, v = cur(w), n = a.versions.length;
  w.ui.verLabel.textContent = n ? `v${a.vi + 1}/${n}` : "v0";
  w.ui.ver.hidden = n < 2;
  w.ui.prev.disabled = w.building || a.vi <= 0;
  w.ui.next.disabled = w.building || a.vi >= n - 1;
  w.ui.srcBtn.disabled = !v;
  w.ui.dlBtn.hidden = !(S.downloads || !window.claude);
  w.ui.dlBtn.disabled = !v || w.building;
  const kept = v && a.keptPath && a.keptAt === v.at;
  w.ui.keepBtn.className = "keepbtn" + (kept ? " kept" : "");
  w.ui.keepBtn.innerHTML = (kept ? I.check : I.keep) + `<span>${kept ? "Kept" : "Keep"}</span>`;
  w.ui.keepBtn.disabled = !v || w.building;
  w.ui.keepBtn.title = kept ? "Saved to Kept" : "Save to Kept so it survives closing";
  w.ui.remixGo.disabled = !v || w.building;
  if (v) setTitle(w, v.meta.name, `v${a.vi + 1} · ${sourceLabel(a)}${v.meta.tagline ? " · " + v.meta.tagline : ""}`);
}

function mountVersion(w, swap) {
  const v = cur(w);
  if (!v) return Promise.resolve();
  setGlyph(w, v.meta.glyph, v.meta.hue);
  w.crashShown = false;
  for (const n of w.ui.body.querySelectorAll(".note")) n.remove();
  const f = el("iframe", {
    sandbox: "allow-scripts allow-forms allow-pointer-lock",
    allow: "autoplay; fullscreen; clipboard-write",
    title: v.meta.name,
  });
  f.srcdoc = injectBridge(v.code, appStore(w.app.appKey), false);
  let loaded = Promise.resolve();
  if (swap) {
    f.style.opacity = "0";
    loaded = new Promise(res => {
      const go = () => { f.style.opacity = ""; for (const o of [...w.ui.frames.children]) if (o !== f) o.remove(); res(); };
      f.addEventListener("load", () => setTimeout(go, 60), { once: true });
      setTimeout(go, 1800);
    });
    w.ui.frames.append(f);
  } else {
    w.ui.frames.replaceChildren(f);
  }
  w.frame = f;
  if (w.ui.source) { w.ui.source.remove(); w.ui.source = null; w.ui.srcBtn.setAttribute("aria-pressed", "false"); }
  refreshActs(w);
  renderTray();
  return loaded;
}

function stepVersion(w, d) {
  const a = w.app;
  const vi = clamp(a.vi + d, 0, a.versions.length - 1);
  if (vi === a.vi || w.building) return;
  a.vi = vi;
  mountVersion(w);
  persistSoon();
}

function toggleSource(w) {
  if (w.ui.source) { w.ui.source.remove(); w.ui.source = null; w.ui.srcBtn.setAttribute("aria-pressed", "false"); return; }
  const v = cur(w); if (!v) return;
  const pre = el("pre", { html: highlight(v.code), tabindex: "0" });
  const copy = el("button", { type: "button", text: "Copy" });
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(v.code).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1500); },
      () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = "Selected · press ⌘C"; });
  });
  const lines = v.code.split("\n").length;
  const box = el("div", { class: "source" },
    el("div", { class: "sbar" }, el("span", { text: `${lines} lines · ${(v.code.length / 1024).toFixed(1)} KB · written ${ago(v.at)}` }), el("span", { class: "spacer" }), copy),
    pre);
  w.ui.body.append(box);
  w.ui.source = box;
  w.ui.srcBtn.setAttribute("aria-pressed", "true");
}

function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app"; }
async function downloadApp(w) {
  const v = cur(w); if (!v) return;
  const note = `<!-- ${v.meta.name}, conjured in Ephemera${w.app.prompt ? " from: " + w.app.prompt.replace(/--/g, "–").slice(0, 300) : ""} -->\n`;
  const html = note + injectBridge(v.code, {}, true);
  const filename = slugify(v.meta.name) + ".html";
  if (S.downloads) {
    try { await S.downloads.save({ filename, data: html }); toast("Saved " + filename); }
    catch (e) { if (e && e.code !== "declined") toast("Couldn't save the file. Try again in a moment."); }
  } else if (!window.claude) {
    const a = el("a", { href: URL.createObjectURL(new Blob([html], { type: "text/html" })), download: filename });
    document.body.append(a); a.click(); a.remove();
  }
}

/* ================================================================ building */

const PHASES = [["think", "Reading"], ["style", "Designing"], ["markup", "Building"], ["script", "Wiring"], ["run", "Running"]];

function startConjure(text) {
  text = String(text || "").trim();
  if (!text) return;
  const app = { appKey: "a" + uid(), prompt: text, source: "conjured", trusted: true, versions: [], vi: -1 };
  const w = openApp(app);
  runBuild(w, { kind: "new", prompt: text });
}

function pickDemo(text) {
  const D = window.EPHEMERA_DEMOS || [];
  return D.find(d => d.match.test(text)) || D[(S.demoTurn = ((S.demoTurn || 0) + 1)) % D.length];
}

async function replay(demo, onText, signal) {
  const full = `<!--ephemera ${JSON.stringify(demo.meta)}-->\n${demo.code}`;
  await sleep(1300);
  let i = 0;
  while (i < full.length) {
    if (signal.aborted) throw { code: "cancelled" };
    i = Math.min(full.length, i + 34 + Math.floor(Math.random() * 40));
    onText({ text: full.slice(0, i) });
    await sleep(18);
  }
  return full;
}

async function runBuild(w, job) {
  if (w.building) return;
  w.building = true;
  w.ui.glyph.classList.add("spin");
  for (const n of w.ui.body.querySelectorAll(".note")) n.remove();
  if (w.ui.source) toggleSource(w);
  refreshActs(w);
  const ui = buildUI(w, job);
  const ctl = new AbortController();
  w.ctl = ctl;
  let text = "";
  const onText = ({ text: t }) => { text = t; ui.update(t); };
  try {
    await Promise.race([S.ready, new Promise((_, rej) => ctl.signal.addEventListener("abort", () => rej({ code: "cancelled" })))]);
    if (S.mode === "live") {
      const input = job.kind === "new" ? conjurePrompt(job.prompt) : revisePrompt(cur(w), job, w.app.prompt);
      const res = await S.sample(input, { modelTier: S.tier, signal: ctl.signal, cache: false, onText });
      text = res.text;
      ui.update(text);
      const out = parseOut(text);
      if (!out.ok) throw { code: "bad_output", text };
      await finishBuild(w, out, job, res.truncated, ui, false);
    } else {
      if (job.kind !== "new") throw { code: "demo_change" };
      const demo = pickDemo(job.prompt);
      ui.recorded();
      text = await replay(demo, onText, ctl.signal);
      ui.update(text);
      w.app.source = "demo";
      await finishBuild(w, parseOut(text), job, false, ui, true);
    }
  } catch (err) {
    ui.fail(err, () => runBuild(w, job));
    if (err && err.code === "not_granted") goDenied();
  } finally {
    w.building = false;
    w.ctl = null;
    if (!w.aiBusy) w.ui.glyph.classList.remove("spin");
    refreshActs(w);
    renderTray();
  }
}

async function finishBuild(w, out, job, truncated, ui, recorded) {
  const a = w.app;
  const v = { code: out.code, meta: out.meta, note: job.kind === "new" ? "First build" : job.change, at: Date.now() };
  a.versions = a.versions.slice(0, a.vi + 1);
  a.versions.push(v);
  if (a.versions.length > 12) a.versions.shift();
  a.vi = a.versions.length - 1;
  ui.landing();
  await mountVersion(w, true);
  if (!recorded) {
    S.lines += out.code.split("\n").length;
    local.set("lines", S.lines);
    updateStats();
  }
  persistSoon();
  ui.done();
  if (truncated) showNote(w, "info", "Claude hit its length limit before finishing, so parts may be missing. Try asking it to “finish the unfinished parts”.", 0);
}

function buildUI(w, job) {
  const body = w.ui.body;
  const hadApp = !!cur(w);
  const ov = el("div", { class: "build", "aria-live": "polite" });
  const veil = el("canvas", { class: "veil", "aria-hidden": "true" });
  const phases = el("div", { class: "phases" }, PHASES.map(([k, label]) => el("span", { "data-k": k, text: label })));
  const status = el("small", { text: "Waiting for Claude" });
  const think = el("div", { class: "think" }, el("q", { text: job.kind === "new" ? job.prompt : job.kind === "fix" ? "Fix: " + job.change : job.change }), status);
  const pre = el("pre", { "aria-hidden": "true" });
  const linesB = el("b", { text: "0" }), sizeB = el("b", { text: "0.0" }), timeB = el("b", { text: "0.0" });
  const rec = el("span", { class: "rec", hidden: true, text: "Recorded build" });
  const stop = el("button", { type: "button", text: "Stop", onclick: () => w.ctl && w.ctl.abort() });
  const tape = el("div", { class: "tape" }, pre,
    el("div", { class: "meta" }, el("span", {}, linesB, " lines"), el("span", {}, sizeB, " KB"), el("span", {}, timeB, " s"), rec, el("span", { class: "spacer" }), stop));
  ov.append(veil, phases, think, tape);
  body.append(ov);

  if (job.kind === "new") setTitle(w, "Conjuring…", `building · ${S.mode === "live" ? tierName(S.tier) : "recorded"}`);
  else w.ui.sub.textContent = job.kind === "fix" ? "repairing…" : "rewriting…";

  // the veil: a dithered screen that thins out as the app takes shape
  const VPX = 5;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  let density = hadApp ? 0.62 : 1, vctx = veil.getContext("2d"), vw = 0, vh = 0;
  function drawVeil() {
    const r = body.getBoundingClientRect();
    const nw = Math.max(1, Math.ceil(r.width / VPX)), nh = Math.max(1, Math.ceil(r.height / VPX));
    if (nw !== vw || nh !== vh) { vw = veil.width = nw; vh = veil.height = nh; }
    const [cr, cg, cb] = cssColor("--panel");
    const im = vctx.createImageData(vw, vh), b32 = new Uint32Array(im.data.buffer);
    const px = (255 << 24) | (cb << 16) | (cg << 8) | cr;
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) if (density > BAY[((y & 3) << 2) | (x & 3)]) b32[y * vw + x] = px;
    vctx.putImageData(im, 0, 0);
  }
  drawVeil();

  const t0 = performance.now();
  let got = false, metaDone = false, lastPv = 0, phase = 0, raf = 0, latest = "";
  const glowTick = () => Field.glow(w.id, w.el.getBoundingClientRect());
  glowTick();
  const timer = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    timeB.textContent = s.toFixed(1);
    if (!got) status.textContent = s > 3 ? `Claude is thinking · ${Math.floor(s)}s` : "Waiting for Claude";
    glowTick();
  }, 100);

  function setPhase(p) {
    phase = Math.max(phase, p);
    phases.querySelectorAll("span").forEach((s, i) => { s.className = i < phase ? "done" : i === phase ? "now" : ""; });
  }
  setPhase(0);

  function paintTape() {
    raf = 0;
    const code = latest;
    const tail = code.split("\n").slice(-9).join("\n");
    pre.innerHTML = "<code>" + highlight(tail) + '<span class="cur"></span></code>';
    linesB.textContent = code ? code.split("\n").length : 0;
    sizeB.textContent = (code.length / 1024).toFixed(1);
  }

  function preview(code) {
    const f = el("iframe", { class: "pv", sandbox: "", "aria-hidden": "true", tabindex: "-1" });
    f.srcdoc = partialSafe(code);
    f.addEventListener("load", () => {
      if (!f.isConnected) return;
      f.classList.add("show");
      for (const o of w.ui.frames.querySelectorAll("iframe.pv")) if (o !== f && o.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) setTimeout(() => o.remove(), 320);
    });
    w.ui.frames.append(f);
  }

  return {
    recorded() { rec.hidden = false; },
    landing() { setPhase(4); stop.disabled = true; },
    update(text) {
      const { meta, code } = splitOut(text);
      if (!got && text.trim()) { got = true; status.textContent = "Writing"; }
      if (meta && !metaDone) {
        metaDone = true;
        const m = cleanMeta(meta, code);
        setGlyph(w, m.glyph, m.hue);
        if (job.kind === "new") {
          setTitle(w, m.name, (m.tagline || "building").toLowerCase());
          const r = w.rect;
          animateTo(w, { w: m.w, h: m.h, x: r.x + (r.w - m.w) / 2, y: r.y + (r.h - m.h) / 2 });
        }
        renderTray();
      }
      latest = code;
      if (code) setPhase(Math.max(1, phaseOf(code)));
      if (!raf) raf = requestAnimationFrame(paintTape);
      const now = performance.now();
      if (code.length > 300 && phaseOf(code) >= 2 && now - lastPv > 900) {
        lastPv = now;
        preview(code);
        if (!think.hidden) { think.hidden = true; density = 0.5; drawVeil(); }
      }
    },
    done() {
      clearInterval(timer);
      setPhase(4);
      Field.glow(w.id, null);
      const r = w.el.getBoundingClientRect();
      Field.pulse(r.left + r.width / 2, r.top + r.height / 2);
      tape.style.transition = "opacity .25s, transform .3s"; tape.style.opacity = "0"; tape.style.transform = "translateY(10px)";
      phases.style.transition = "opacity .25s"; phases.style.opacity = "0";
      think.hidden = true;
      const from = density, start = performance.now();
      const step = ts => {
        const k = Math.min(1, (ts - start) / 650);
        density = from * (1 - k) * (1 - k);
        drawVeil();
        if (k < 1) requestAnimationFrame(step); else ov.remove();
      };
      requestAnimationFrame(step);
    },
    fail(err, retry) {
      clearInterval(timer);
      Field.glow(w.id, null);
      for (const f of w.ui.frames.querySelectorAll("iframe.pv")) f.remove();
      const code = err && err.code;
      if (code === "cancelled" && hadApp) { ov.remove(); refreshActs(w); toast("Rewrite stopped. The previous version is still running."); return; }
      const copy = failCopy(code);
      phases.remove(); tape.remove(); think.remove();
      density = 0.85; drawVeil();
      const card = el("div", { class: "fail", role: "alert" },
        el("h3", { text: copy[0] }), el("p", { text: copy[1] }),
        el("div", { class: "row" },
          copy[2] !== false ? el("button", { class: "btn primary", type: "button", text: "Try again", onclick: () => { ov.remove(); retry(); } }) : null,
          hadApp ? el("button", { class: "btn", type: "button", text: "Back to the app", onclick: () => { ov.remove(); refreshActs(w); } })
                 : el("button", { class: "btn", type: "button", text: "Close window", onclick: () => closeWin(w) })));
      ov.append(card);
      if (!hadApp) setTitle(w, "Didn't build", "nothing was kept");
    },
  };
}

function failCopy(code) {
  switch (code) {
    case "cancelled": return ["Stopped", "Nothing was kept from this build."];
    case "not_granted": return ["Claude is off for this page", "Claude access was declined, so Ephemera can only replay recorded builds until you reload the page.", false];
    case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed":
      return ["Claude isn't available here", "This account or view can't use Claude from a page. Recorded builds still work.", false];
    case "rate_limited": return ["Usage limit reached", "Claude reports a rate or usage limit on this account. Wait a little, then try again."];
    case "session_expired": return ["Sign in again", "Your Claude session expired. Sign in on claude.ai, then try again."];
    case "refused": return ["Claude declined this one", "Try describing the app differently."];
    case "prompt_too_large": return ["Too big to rewrite", "This app has grown too large to rewrite in one pass. Try a smaller change, or start a fresh app."];
    case "bad_output": return ["That didn't come back as an app", "Claude answered with something other than a working page. Try again, or describe the app more concretely."];
    case "demo_change": return ["Rewriting needs Claude", "Open Ephemera on claude.ai to change apps by asking.", false];
    default: return ["The build was interrupted", "The connection to Claude dropped partway through. Try again."];
  }
}
const tierName = t => ({ quick: "fast", default: "balanced", complex: "deep" }[t] || "balanced");

/* ================================================================ built-in windows */

const OBITS = [
  ["c. 1993 – 2025", "The Unit Converter", "Turned miles into kilometers for three decades without once asking why you needed to know.",
    "A unit converter where I type anything in plain words, like “3 cups of flour in grams” or “how many football fields is a marathon”, and it answers with the working shown. Handle common units instantly offline and use ai.json for anything unusual."],
  ["c. 1990 – 2025", "The To-Do App", "Survived by tens of thousands of nearly identical siblings, each with a slightly different checkbox.",
    "A to-do list that turns a messy brain dump into a plan: I paste rambling text, ai.json splits it into tasks with time estimates and priorities, and I check them off. Remember everything in localStorage."],
  ["c. 2006 – 2025", "The Pomodoro Timer", "Rang every twenty-five minutes. Most people stopped hearing it by the third ring.",
    "A focus timer with a big analog dial I can drag to set, custom work and break lengths, a soft synthesized chime, and a log of today's sessions."],
  ["c. 1999 – 2025", "The Flashcard App", "Required you to write every card yourself, which turned out to be most of the work.",
    "Flashcards that write themselves: I type any topic, ai.json generates 12 question and answer cards, and I study them with flip animations and simple spaced repetition."],
  ["c. 1997 – 2025", "The Mortgage Calculator", "Lived on every bank's website and showed everyone the same four numbers.",
    "A mortgage calculator with sliders for price, down payment, rate and term, an amortization chart drawn on canvas, and a side-by-side of 15 and 30 year loans."],
  ["c. 2004 – 2025", "The Invoice Generator", "Charged a monthly fee to put your logo above a table.",
    "An invoice maker with editable line items, tax, discount and due date, a clean invoice preview, and saved clients in localStorage."],
  ["c. 2010 – 2025", "The Habit Tracker", "Broke more streaks than it ever built.",
    "A habit tracker with a year heatmap for each habit, streak counts, and a weekly review where ai writes a short, honest note on how I'm doing."],
  ["c. 2003 – 2025", "The Regex Tester", "Highlighted everything. Explained nothing.",
    "A regex workbench: live match highlighting with capture groups, an Explain button that uses ai to describe the pattern in plain English, and a Write one for me box that turns a description into a pattern."],
  ["c. 2008 – 2025", "The Palette Generator", "Produced five hex codes at a time, forever.",
    "A palette generator where I describe a mood, like “rainy Lisbon tram, 1970”, and ai.json returns a named five-color palette with roles. Show swatches, contrast ratios and copy-as-CSS."],
  ["c. 1998 – 2025", "The Résumé Builder", "Offered forty templates that were all the same résumé.",
    "A résumé builder: I paste my messy work history, ai rewrites it into tight bullet points, and it renders a clean one-page résumé with two layout styles."],
  ["c. 2009 – 2025", "The Recipe Scaler", "Multiplied fractions, mostly correctly.",
    "A recipe tool: I paste any recipe, choose servings, and every quantity scales with sensible units. An Out of something? button asks ai for substitutions."],
  ["c. 2011 – 2025", "The Bill Splitter", "Ended friendships over a shared appetizer.",
    "A bill splitter for a group dinner: add people and dishes, mark shared dishes, add tip and tax, and show who owes whom with the fewest payments."],
  ["c. 1985 – 2025", "The Typing Tutor", "Made you type the quick brown fox roughly a million times.",
    "A typing trainer that uses ai to write fresh practice passages about any topic I pick, tracks WPM and accuracy live, and shows my weakest keys on a keyboard diagram."],
  ["c. 2001 – 2025", "The Lorem Ipsum Generator", "Filled layouts with Latin for twenty years. Replaced by words that mean something.",
    "A copy generator for designers: pick a product type and tone, and ai writes realistic headlines, button labels, empty states and error messages, each one copyable."],
  ["c. 2007 – 2025", "The Personality Quiz", "Told everyone they were the main character.",
    "A personality quiz generator: I name any theme, like “which kitchen appliance are you”, ai.json writes 8 questions and 4 results, and I take the quiz with smooth transitions."],
  ["c. 1980 – 2025", "The Drum Machine", "Used to arrive in a box, with a power supply and a manual.",
    "A step sequencer drum machine with synthesized sounds, tempo and swing, and a box where I describe a groove and ai.json writes the pattern."],
];

function openBuiltin(kind, rect) {
  for (const w of S.wins.values()) if (w.kind === kind) { focusWin(w); return w; }
  const spec = {
    readme: { title: "Readme", glyph: "¶", sub: "how this computer works", size: { w: 540, h: 640 } },
    obits: { title: "Obituaries", glyph: "†", sub: "software that used to be a product", size: { w: 640, h: 680 } },
    kept: { title: "Kept", glyph: "K", sub: "apps people chose to keep", size: { w: 700, h: 580 } },
  }[kind];
  const w = makeWindow({ kind, title: spec.title, sub: spec.sub, glyph: spec.glyph, ink: true, rect, size: spec.size });
  const doc = el("div", { class: "doc", tabindex: "0" });
  w.ui.body.append(doc);
  w.ui.doc = doc;
  if (kind === "readme") renderReadme(doc);
  if (kind === "obits") renderObits(doc);
  if (kind === "kept") renderKept(w);
  persistSoon();
  return w;
}

function renderReadme(doc) {
  doc.innerHTML = `
    <p class="kicker">Readme · build 2026.10</p>
    <h2>There are no apps on this computer.</h2>
    <p>For about fifty years, software was something you found, bought, installed and learned. Someone else decided what it did. If nothing fit, you went without.</p>
    <p>That arrangement ended quietly. A model can now write a small, working program from one sentence in about a minute, which is less time than it takes to find one in an app store and read the reviews.</p>
    <p>Ephemera is a computer built for that. Nothing is installed. You describe what you need, Claude writes it on the spot, and it runs in a window. Change it by asking. Close it and it's gone, unless you keep it.</p>
    <dl>
      <dt>Conjure</dt><dd>Describe an app in the bar at the bottom of the screen. <kbd>⌘</kbd> <kbd>K</kbd> jumps there. You can watch the code being written and the app taking shape as it streams in.</dd>
      <dt>Change</dt><dd>Type into the bar under any app, like “make it work for six people” or “add sound”. Every change is a new version, and the arrows in the title bar step back through them.</dd>
      <dt>Think</dt><dd>Conjured apps can call Claude themselves. A flashcard app can write its own cards, and a drum machine can take requests.</dd>
      <dt>Repair</dt><dd>When an app crashes, Ephemera shows the error and offers to fix it. Claude rewrites the broken part and leaves the rest alone.</dd>
      <dt>Keep</dt><dd>Keep saves an app to a shelf that everyone who can open this page can browse. The download button saves it as a single .html file you own.</dd>
      <dt>Models</dt><dd>Fast is quickest and good for small tools. Balanced is the default. Deep takes longer and handles ambitious apps best.</dd>
    </dl>
    <p class="fine">Conjuring runs on your own Claude account and counts toward your usage. Claude asks for permission before the first build. Apps run in a sealed sandbox with no network access. Apps you open from someone else's shelf have to ask before they can use Claude.</p>`;
}

function renderObits(doc) {
  doc.replaceChildren(
    el("p", { class: "kicker", text: "Obituaries" }),
    el("h2", { text: "Software that used to be a product." }),
    el("p", { text: "Each of these was a whole category, with companies, app-store charts and monthly subscriptions. Each one now fits in a sentence. Press Resurrect, and Claude will write a version that does more than the original did, usually in under a minute." }),
    el("div", { class: "obits" }, OBITS.map(([yrs, name, epitaph, prompt]) =>
      el("article", { class: "obit" },
        el("div", { class: "yrs", text: yrs }),
        el("div", {}, el("h3", { text: name }), el("p", { text: epitaph })),
        el("button", { type: "button", html: I.spark + "<span>Resurrect</span>", "aria-label": "Resurrect " + name, onclick: () => startConjure(prompt) })))));
}

function keptApps() {
  const all = [];
  for (const [, u] of S.keepUsers) all.push(...u.apps);
  return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderKept(w) {
  const doc = w.ui.doc;
  const head = [
    el("p", { class: "kicker", text: "Kept" }),
    el("h2", { text: "The few apps worth keeping." }),
    el("p", { text: "Everything else on this computer disappears when its window closes. These were kept on purpose, by you or by anyone else who can open this page." }),
  ];
  if (!S.db) {
    doc.replaceChildren(...head, el("div", { class: "empty" },
      el("b", { text: S.mode === "connecting" ? "Connecting to the shelf…" : "The shelf lives on claude.ai" }),
      S.mode === "connecting" ? "" : "Open Ephemera on claude.ai while signed in to keep apps and see what others kept."));
    return;
  }
  const apps = keptApps();
  const mine = apps.filter(a => a.author === S.uid), others = apps.filter(a => a.author !== S.uid);
  const section = (label, list) => list.length ? [el("h5", { text: label }), el("div", { class: "shelf" }, list.map(keptTile))] : [];
  doc.replaceChildren(...head,
    ...(apps.length ? [...section("Kept by you", mine), ...section("Kept by others", others)]
      : [el("div", { class: "empty" }, el("b", { text: "Nothing kept yet" }), "Conjure an app, then press Keep in its title bar. It will show up here for everyone who can open this page.")]));
}

function keptTile(k) {
  const mine = k.author === S.uid;
  const who = mine ? "You" : (S.profiles[k.author] && S.profiles[k.author].name) || "Someone";
  const glyph = el("span", { class: "glyph", text: k.glyph || "·" });
  glyph.style.setProperty("--h", k.hue || 40);
  const row = el("div", { class: "row" }, el("button", { class: "btn primary", type: "button", text: "Open", onclick: () => openKept(k) }));
  if (mine || S.isOwner) {
    const del = el("button", { class: "btn", type: "button", text: "Delete" });
    del.addEventListener("click", () => {
      row.replaceChildren(el("span", { class: "by", text: "Delete for everyone?" }),
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: () => renderKeptAll() }),
        el("button", { class: "btn signal", type: "button", text: "Delete", onclick: async () => {
          try { await S.db.doc(k.path).delete(); toast("Deleted “" + k.name + "” from Kept."); }
          catch { toast("Couldn't delete it. You may not have permission."); renderKeptAll(); }
        } }));
    });
    row.append(del);
  }
  return el("article", { class: "tile" }, glyph, el("h4", { text: k.name || "Untitled" }), el("p", { text: k.tagline || "" }),
    el("div", { class: "by", text: `${who} · ${ago(k.createdAt || Date.now())}${k.versions > 1 ? " · " + k.versions + " versions" : ""}` }), row);
}

function openKept(k) {
  const key = "k_" + k.id;
  for (const w of S.wins.values()) if (w.app && w.app.appKey === key) { focusWin(w); return; }
  const mine = k.author === S.uid;
  const meta = cleanMeta(k, k.code || "");
  openApp({
    appKey: key, prompt: k.prompt || "", source: "keep", author: k.author, trusted: mine,
    keptPath: mine ? k.path : null, keptAt: mine ? k.createdAt : null, keptCreated: k.createdAt,
    versions: [{ code: String(k.code || ""), meta, note: "Kept version", at: k.createdAt || Date.now() }], vi: 0,
  });
  persistSoon();
}

function renderKeptAll() { for (const w of S.wins.values()) if (w.kind === "kept") renderKept(w); }

async function keepApp(w) {
  const v = cur(w), a = w.app;
  if (!v) return;
  if (!S.db) return showNote(w, "info", S.mode === "connecting" ? "Still connecting. Try again in a moment." : "Keeping works on claude.ai. Open Ephemera there while signed in to keep apps.");
  if (!S.uid) return showNote(w, "info", "Sign in to claude.ai to keep apps.");
  const mine = a.keptPath && a.keptPath.startsWith("keep/" + S.uid + "/");
  const data = {
    name: v.meta.name, tagline: v.meta.tagline || "", glyph: v.meta.glyph, hue: v.meta.hue, w: v.meta.w, h: v.meta.h,
    code: v.code, prompt: (a.prompt || "").slice(0, 2000), author: S.uid, versions: a.versions.length,
    createdAt: mine && a.keptCreated ? a.keptCreated : Date.now(), keptAt: Date.now(),
  };
  if (JSON.stringify(data).length > 250000) return showNote(w, "info", "This app is too large for the shelf. Download it instead.");
  w.ui.keepBtn.disabled = true;
  try {
    const ref = mine ? S.db.doc(a.keptPath) : S.db.collection("keep/" + S.uid + "/apps").doc();
    await ref.set(data);
    await S.db.doc("keep/" + S.uid).set({ updatedAt: Date.now() });
    a.keptPath = ref.path; a.keptAt = v.at; a.keptCreated = data.createdAt;
    toast(`Kept “${v.meta.name}”. Anyone who can open this page will find it under Kept.`);
    persistSoon();
  } catch (e) {
    const c = e && e.code;
    showNote(w, "info", c === "invalid_argument" ? "You can browse Kept but not add to it. Ask the owner for Contributor access."
      : c === "quota_exceeded" ? "The shelf is full. Delete an app from Kept to make room."
      : "Couldn't keep it. Try again in a moment.");
  } finally { refreshActs(w); }
}

function subscribeKeep() {
  const watchUser = id => {
    if (S.keepUsers.has(id) || S.keepUsers.size >= 40) return;
    const entry = { apps: [] };
    S.keepUsers.set(id, entry);
    try {
      entry.unsub = S.db.collection("keep/" + id + "/apps").orderBy("createdAt", "desc").limit(60).onSnapshot(snap => {
        entry.apps = snap.docs.map(d => Object.assign({ id: d.id, path: "keep/" + id + "/apps/" + d.id }, d.data()));
        keptChanged();
      }, () => {});
    } catch { /* an id that isn't a valid path segment */ }
  };
  try {
    if (S.uid) watchUser(S.uid);
    S.db.collection("keep").onSnapshot(snap => { for (const d of snap.docs) watchUser(d.id); }, () => {});
  } catch { S.db = null; }
}

const keptChanged = debounce(async () => {
  const apps = keptApps();
  $("#st-kept").textContent = apps.length;
  const ids = [...new Set(apps.map(a => a.author).filter(id => id && !S.profiles[id]))];
  if (ids.length && S.user) {
    try { Object.assign(S.profiles, await S.user.profiles(ids)); } catch {}
  }
  renderKeptAll();
  for (const w of S.wins.values()) if (w.kind === "app") refreshActs(w);
}, 120);

/* ================================================================ chrome */

function setStatus() {
  const chip = $("#status");
  const state = S.mode === "live" ? "live" : S.mode === "connecting" ? "connecting" : "demo";
  chip.dataset.state = state;
  chip.lastElementChild.textContent = state === "live" ? "Claude · live" : state === "connecting" ? "Connecting" : S.denied ? "Claude off" : "Recorded builds";
  chip.title = state === "live" ? "Apps are written live by Claude on your account."
    : state === "demo" ? "Live conjuring needs this page open on claude.ai. Until then, builds are recorded replays." : "";
  $("#hint").textContent = state === "demo" ? "Recorded builds only · open on claude.ai to conjure live" : "⌘K to describe · Esc to leave";
}
function goDenied() { S.denied = true; S.mode = "demo"; setStatus(); }

function updateStats() { $("#st-lines").textContent = S.lines.toLocaleString(); }

function tickClock() {
  const d = new Date();
  $("#clock").textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const CHIPS = [
  "Flashcards that write themselves on any topic",
  "A dream journal that finds patterns across my dreams",
  "Split a dinner bill between friends with shared dishes",
  "A synth that turns a sentence into a melody",
  "Plan a week of dinners from what's in my fridge",
  "A debate partner that scores my arguments",
  "A focus timer with a big analog dial and rain sounds",
  "A tiny city-builder game on a grid",
  "Explain any contract clause in plain English",
  "A packing list for any trip that I check off as I go",
];

function initChrome() {
  const q = $("#q"), form = $("#intent");
  const grow = () => { q.style.height = "auto"; q.style.height = Math.min(q.scrollHeight, 132) + "px"; q.style.overflowY = q.scrollHeight > 132 ? "auto" : "hidden"; };
  q.addEventListener("input", grow);
  const ph = () => { q.placeholder = isNarrow() ? "Describe an app…" : "Describe an app you need right now…"; };
  ph(); narrowMQ.addEventListener("change", ph);
  q.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    if (e.key === "Escape") q.blur();
  });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const t = q.value.trim();
    if (!t) { q.focus(); return; }
    q.value = ""; grow();
    startConjure(t);
  });
  $("#chips").append(...CHIPS.map(c => el("button", { type: "button", text: c, onclick: () => startConjure(c) })));
  const tier = $("#tier");
  const paintTier = () => tier.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", b.dataset.tier === S.tier ? "true" : "false"));
  tier.addEventListener("click", e => {
    const b = e.target.closest("button[data-tier]");
    if (!b) return;
    S.tier = b.dataset.tier; local.set("tier", S.tier); paintTier();
  });
  paintTier();
  $("#mb-conjure").onclick = () => q.focus();
  $("#mb-kept").onclick = () => openBuiltin("kept");
  $("#mb-obits").onclick = () => openBuiltin("obits");
  $("#mb-readme").onclick = () => openBuiltin("readme");
  $("#th-readme").onclick = () => openBuiltin("readme");
  $("#th-obits").onclick = () => openBuiltin("obits");
  addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); q.focus(); }
  });
  updateStats();
  tickClock(); setInterval(tickClock, 15000);
  setStatus();
  narrowMQ.addEventListener("change", () => { for (const w of S.wins.values()) applyMax(w); });
  addEventListener("resize", debounce(() => { for (const w of S.wins.values()) if (!w.max) place(w, w.rect); }, 150));
}

/* ================================================================ persistence */

const persistSoon = debounce(() => {
  const list = [...S.wins.values()]
    .sort((a, b) => +a.el.style.zIndex - +b.el.style.zIndex)
    .map(w => {
      const o = { kind: w.kind, rect: w.rect, max: w.max, min: w.min };
      if (w.kind === "app") {
        const a = w.app;
        if (!a.versions.length) return null;
        const keepN = 5, drop = Math.max(0, a.versions.length - keepN);
        o.app = {
          appKey: a.appKey, prompt: a.prompt, source: a.source, author: a.author, trusted: a.trusted, ai: a.ai,
          keptPath: a.keptPath, keptAt: a.keptAt, keptCreated: a.keptCreated,
          versions: a.versions.slice(drop), vi: Math.max(0, a.vi - drop),
        };
      }
      return o;
    }).filter(Boolean);
  if (!local.set("desk", list)) {
    for (const o of list) if (o.app) { o.app.versions = [o.app.versions[o.app.vi]]; o.app.vi = 0; }
    local.set("desk", list);
  }
}, 500);

function restore() {
  const saved = local.get("desk", null);
  if (Array.isArray(saved)) {
    for (const o of saved) {
      let w = null;
      if (o.kind === "app" && o.app && o.app.versions && o.app.versions.length) w = openApp(o.app, { rect: o.rect });
      else if (o.kind === "readme" || o.kind === "obits" || o.kind === "kept") w = openBuiltin(o.kind, o.rect);
      if (!w) continue;
      if (o.max) { w.max = true; applyMax(w); }
      if (o.min) minimize(w);
    }
    return;
  }
  // first visit: one example app, already running
  if (isNarrow()) return;
  const demo = (window.EPHEMERA_DEMOS || [])[0];
  if (!demo) return;
  const d = deskRect();
  const w = Math.min(demo.meta.w, d.width * 0.52), h = Math.min(demo.meta.h, d.height - 40);
  openApp({
    appKey: "example-" + demo.key, prompt: demo.prompt, source: "example", trusted: true,
    versions: [{ code: demo.code, meta: cleanMeta(demo.meta, demo.code), note: "Example", at: Date.now() }], vi: 0,
  }, { rect: { x: d.width - w - 28, y: 22, w, h } });
}

/* ================================================================ boot */

async function connect() {
  const c = window.claude;
  if (!c || typeof c.use !== "function") { S.mode = "demo"; setStatus(); readyResolve(); return; }
  const use = n => c.use(n).catch(() => null);
  const [sample, db, user, downloads] = await Promise.all([use("sample"), use("db"), use("user"), use("downloads")]);
  S.sample = sample; S.user = user; S.downloads = downloads;
  if (user) {
    try { S.uid = await user.id(); } catch {}
    try { S.isOwner = await user.isOwner(); } catch {}
  }
  S.db = db;
  S.mode = sample ? "live" : "demo";
  setStatus();
  readyResolve();
  if (S.db) subscribeKeep();
  renderKeptAll();
  for (const w of S.wins.values()) if (w.kind === "app") refreshActs(w);
}

initChrome();
restore();
S.booted = true;
connect();
try { Field.start(); } catch (e) { console.warn("field", e); }
})();

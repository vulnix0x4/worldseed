/* Worldseed mind: what Claude is asked, and how its answers become world operations. */
(() => {
"use strict";
const { clamp } = WS;

const SHAPES = ["islands", "archipelago", "mountains", "valley", "plains", "dunes", "canyon", "crater", "plateau"];
const WEATHERS = ["clear", "rain", "storm", "snow", "fog", "fireflies", "petals", "embers", "ash", "aurora"];
const SCALES = ["major", "minor", "dorian", "lydian", "mixolydian", "pentatonic", "phrygian", "harmonic"];
const ZONES = ["shore", "low", "mid", "high", "all"];
const NEARS = ["center", "north", "south", "east", "west", "shore", "peak", "valley", "random"];
const FLORA_ALIASES = { tree: "broadleaf", oak: "broadleaf", maple: "broadleaf", willow: "broadleaf", fir: "pine", spruce: "pine", conifer: "pine", cedar: "pine",
  grass: "reed", reeds: "reed", fern: "bush", shrub: "bush", shrubs: "bush", flowers: "flower", blossom: "flower", fungus: "mushroom", mushrooms: "mushroom",
  crystals: "crystal", boulder: "rock", rocks: "rock", stone: "rock", cacti: "cactus", palms: "palm", birches: "birch", deadwood: "dead" };
const LANDMARK_ALIASES = { castle: "tower", keep: "tower", spire: "tower", house: "cottage", cabin: "cottage", inn: "hall", tavern: "hall", library: "hall", church: "temple",
  chapel: "temple", monastery: "temple", altar: "shrine", torii: "shrine", ruin: "ruins", standing_stones: "stones", stonehenge: "stones", circle: "stones", monument: "statue",
  idol: "statue", fire: "campfire", bonfire: "campfire", camp: "tent", yurt: "tent", tree: "great_tree", world_tree: "great_tree", crystal: "crystals", geode: "crystals",
  ziggurat: "pyramid", tomb: "pyramid", dome: "observatory", telescope: "observatory", ship: "shipwreck", wreck: "shipwreck", boat: "dock", pier: "dock", harbor: "dock",
  harbour: "dock", bazaar: "market", stalls: "market", spring: "fountain", mine: "cave", grotto: "cave", den: "cave", arch: "gate", door: "gate", rift: "portal", monolith: "obelisk" };

const hexOk = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim());
const str = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v, a, b, d) => { const x = Number(v); return Number.isFinite(x) ? clamp(x, a, b) : d; };
const pick = (v, list, d) => { v = String(v || "").toLowerCase().trim().replace(/[\s-]+/g, "_"); return list.includes(v) ? v : d; };

function normalize(o) {
  if (!o || typeof o !== "object") return null;
  const kind = String(o.kind || o.type_of || "").toLowerCase();
  switch (kind) {
    case "world": return { kind, name: str(o.name, 48) || "Unnamed World", tagline: str(o.tagline, 100), lore: str(o.lore, 700),
      hour: num(o.hour, 0, 24, 12), weather: pick(o.weather, WEATHERS, "clear"), flow: o.flow === false ? false : true,
      music: { scale: pick(o.music && o.music.scale, SCALES, "dorian"), tempo: num(o.music && o.music.tempo, 40, 130, 72), mood: str(o.music && o.music.mood, 40) } };
    case "palette": { const p = { kind }; for (const k of Object.keys(WS.DEFAULT_PALETTE)) if (hexOk(o[k])) p[k] = o[k].trim(); return p; }
    case "terrain": return { kind, shape: pick(o.shape, SHAPES, "islands"), height: num(o.height, 0, 1, 0.5), roughness: num(o.roughness, 0, 1, 0.5), water: num(o.water, 0, 1, 0.3),
      seed: Math.floor(num(o.seed, 1, 1e9, Math.random() * 1e6)) };
    case "flora": { let t = String(o.type || "").toLowerCase().trim(); t = FLORA_ALIASES[t] || t; if (!WS.FLORA_TYPES.includes(t)) t = "bush";
      return { kind, type: t, density: num(o.density, 0, 1, 0.5), color: hexOk(o.color) ? o.color : "#5b8a46", zone: pick(o.zone, ZONES, "all"), size: num(o.size, 0.5, 2.2, 1), glow: !!o.glow }; }
    case "landmark": { let t = String(o.type || "").toLowerCase().trim().replace(/[\s-]+/g, "_"); t = LANDMARK_ALIASES[t] || t; if (!WS.LANDMARK_TYPES.includes(t)) t = "ruins";
      return { kind, type: t, name: str(o.name, 48) || "Nameless Place", about: str(o.about, 240), near: pick(o.near, NEARS, "random"), scale: num(o.scale, 0.5, 2.2, 1),
        color: hexOk(o.color) ? o.color : undefined, glow: hexOk(o.glow) ? o.glow : undefined }; }
    case "npc": { const look = o.look || {};
      return { kind, name: str(o.name, 40) || "Stranger", role: str(o.role, 60), home: str(o.home, 48), personality: str(o.personality, 300), knows: str(o.knows, 400),
        wants: str(o.wants, 240), has: str(o.has, 60), greeting: str(o.greeting, 280),
        look: { robe: hexOk(look.robe) ? look.robe : undefined, skin: hexOk(look.skin) ? look.skin : undefined, hat: pick(look.hat, WS.HATS, "none"),
          hatColor: hexOk(look.hatColor) ? look.hatColor : undefined, height: num(look.height, 0.8, 1.3, 1) } }; }
    case "goal": return { kind, text: str(o.text, 240) };
    case "event": return { kind, text: str(o.text, 240) };
    case "remove": return { kind, name: str(o.name, 48) };
    case "weather": return { kind, value: pick(o.value || o.weather, WEATHERS, "clear") };
    case "time": return { kind, hour: num(o.hour, 0, 24, 12) };
    default: return null;
  }
}

/* Reads JSON Lines out of a growing stream of text. */
function lineReader(onOp) {
  let done = 0, buf = "";
  const take = line => {
    line = line.trim().replace(/,$/, "");
    if (!line.startsWith("{")) return;
    try { const op = normalize(JSON.parse(line)); if (op) onOp(op); } catch (e) { /* skip a malformed line */ }
  };
  return {
    feed(text) {
      const lines = text.split("\n");
      for (let i = done; i < lines.length - 1; i++) take(lines[i]);
      done = Math.max(done, lines.length - 1);
      buf = lines[lines.length - 1];
    },
    end() { if (buf) take(buf); buf = ""; },
  };
}

const CATALOG = `Landmark types: ${WS.LANDMARK_TYPES.join(", ")}.
Flora types: ${WS.FLORA_TYPES.join(", ")}. Flora zones: shore, low, mid, high, all.
Terrain shapes: ${SHAPES.join(", ")}.
Weather: ${WEATHERS.join(", ")}.
Hats: ${WS.HATS.join(", ")}.
Placement hints ("near"): ${NEARS.join(", ")}.`;

const LINE_FORMATS = `{"kind":"world","name":"2-4 word evocative name","tagline":"under 80 characters","lore":"2-3 sentences of history and mood","hour":0-24,"weather":"<weather>","music":{"scale":"major|minor|dorian|lydian|mixolydian|pentatonic|phrygian|harmonic","tempo":50-110,"mood":"two words"}}
{"kind":"palette","skyTop":"#hex","skyHorizon":"#hex","sun":"#hex","low":"#hex","mid":"#hex","high":"#hex","peak":"#hex","sand":"#hex","water":"#hex","accent":"#hex"}
{"kind":"terrain","shape":"<shape>","height":0-1,"roughness":0-1,"water":0-1 (0 means no sea),"seed":integer}
{"kind":"flora","type":"<flora type>","density":0-1,"color":"#hex","zone":"<zone>","size":0.5-2}
{"kind":"landmark","type":"<landmark type>","name":"Proper Name","about":"one vivid sentence","near":"<hint>","scale":0.6-1.8,"color":"#hex","glow":"#hex or omit"}
{"kind":"npc","name":"First name","role":"short role","home":"exact landmark name","personality":"how they talk","knows":"a secret or piece of lore","wants":"something specific they want","has":"an exact item name they can give, or empty","greeting":"their first line to the traveler, in voice","look":{"robe":"#hex","skin":"#hex","hat":"<hat>","hatColor":"#hex","height":0.85-1.2}}
{"kind":"goal","text":"one sentence: the traveler's first hook"}`;

function genesisPrompt(request) {
  return `You are the world-builder inside Worldseed. A person describes a world in one sentence. You design a small explorable 3D world (a region about 320 meters across) that a low-poly game engine builds live, line by line, as you write. The person then walks around it and talks to the people who live there.

The person's sentence:
"""
${request}
"""

Reply with ONLY JSON Lines: one compact JSON object per line, no prose, no Markdown, no code fences. Write the lines in exactly this order:
1. one "world" line
2. one "palette" line
3. one "terrain" line
4. three to five "flora" lines
5. six to nine "landmark" lines
6. three to five "npc" lines
7. one "goal" line

Line formats:
${LINE_FORMATS}

${CATALOG}

Art direction:
- The palette describes the world in full daylight; the engine applies the hour and weather on top. Choose a cohesive, specific palette with clear value contrast between low, mid and high ground. The horizon is usually lighter than skyTop. Avoid pure black and pure white except for snow peaks. Water should feel deeper than the sand.
- Interpret the sentence boldly and specifically. Pick the terrain shape, weather and hour that make the first view unforgettable.
- Landmarks are the places worth walking to. Give each a proper name and a sentence that makes someone want to visit. Spread them with different placement hints. Use glow for things that should shine at night.
- Flora gives the land texture: mix one or two dominant types with accents like flowers, rocks or reeds.

The people:
- They live at the landmarks (home must exactly match a landmark name) and know each other. Each has a distinct voice.
- Design a small chain of favors using exact item names: someone has an item that another person wants, whose own item someone else wants. Following the chain should lead the traveler across the whole world and end in something meaningful.
- Greetings should be in voice and should hook the traveler with a question, a request or a mystery.`;
}

function summarize(state) {
  const w = state.world || {};
  return JSON.stringify({
    name: w.name, lore: w.lore, hour: Math.round(state.hour * 10) / 10, weather: state.weather, terrain: state.terrain, palette: state.palette,
    landmarks: state.landmarks.map(l => ({ name: l.name, type: l.type, about: l.about })),
    people: state.npcs.map(n => ({ name: n.name, role: n.role, home: n.home })),
    flora: state.flora.map(f => f.type),
  });
}

function directorPrompt(state, request) {
  return `You are the director of a living 3D world in Worldseed. The traveler standing in it has asked for a change, and the engine applies your lines live, one at a time, as you write them.

The world right now:
${summarize(state)}

The traveler asks:
"""
${request}
"""

Reply with ONLY JSON Lines (one compact JSON object per line, no prose, no fences). Begin with one "event" line narrating what happens, in a single vivid sentence, present tense. Then write only the lines needed to make the change real:
{"kind":"event","text":"..."}
{"kind":"time","hour":0-24}
{"kind":"weather","value":"<weather>"}
{"kind":"palette", ...only the keys that change...}
{"kind":"terrain","shape":"<shape>","height":0-1,"roughness":0-1,"water":0-1,"seed":integer}  (only if the land itself must change; keep the same seed to keep the same coastline)
{"kind":"flora", ...as in creation...}
{"kind":"landmark", ...as in creation...}
{"kind":"npc", ...as in creation; home must exactly match a landmark name...}
{"kind":"remove","name":"exact name of a landmark or person to remove"}

Formats for flora, landmark and npc lines:
${LINE_FORMATS}

${CATALOG}

Be generous and imaginative, but change only what the request implies. New people should have a reason to be here and something to say about the change.`;
}

function npcSystem(ctx) {
  const n = ctx.npc, w = ctx.world || {};
  const others = ctx.npcs.filter(o => o.name !== n.name).map(o => `${o.name} (${o.role}, lives at ${o.home})`).join("; ") || "nobody";
  const places = ctx.landmarks.map(l => `${l.name}: ${l.about}`).join("\n") || "none";
  return `You are ${n.name}, ${n.role || "a local"}, in a world called "${w.name || "this place"}". Stay fully in character. Never mention being an AI, a game or a model.

The world: ${w.lore || ""}
Places here:
${places}
Other people here: ${others}.

You: ${n.personality || ""}
What you know: ${n.knows || ""}
What you want: ${n.wants || ""}
What you have to give: ${n.has || "nothing in particular"}
Where you live: ${n.home || ""}

Right now it is ${ctx.timeWords}, and the weather is ${ctx.weather}. The traveler carries: ${ctx.inventory.length ? ctx.inventory.join(", ") : "nothing"}.${ctx.given.length ? ` You have already given: ${ctx.given.join(", ")}.` : ""}

Speak in short turns of one to three sentences, vivid and specific to this world, in your own voice. Respond to what the traveler actually says. Point them to places and people by name when it helps.

You can act in the world by ending your reply with one or more tags. Use them only when the story calls for it:
[[give:Exact Item Name]] when you hand over the item you have (only if you have it and the traveler earned it; give it at most once)
[[take:Exact Item Name]] when the traveler hands you an item they carry that you want
[[reveal:Exact Place Name]] to mark a place on the traveler's map
[[follow]] to start walking with the traveler, [[stay]] to stop
[[weather:clear|rain|storm|snow|fog|fireflies|petals|embers|ash|aurora]] or [[time:dawn|noon|dusk|night]] only if you truly have such power in this world.`;
}

const TAG_RE = /\[\[\s*(give|take|reveal|follow|stay|weather|time)\s*(?::\s*([^\]]+?))?\s*\]\]/gi;
function parseTags(text) {
  const actions = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text))) actions.push({ kind: m[1].toLowerCase(), value: (m[2] || "").trim() });
  const clean = text.replace(TAG_RE, "").replace(/\[\[[^\]]*$/, "").replace(/\s+$/, "");
  return { clean, actions };
}
const TIME_WORDS = { dawn: 6.2, morning: 8.5, noon: 12.5, day: 13, afternoon: 15.5, dusk: 18.4, sunset: 18.2, evening: 19.5, night: 22.5, midnight: 0 };

WS.Mind = { normalize, lineReader, genesisPrompt, directorPrompt, npcSystem, parseTags, TIME_WORDS, WEATHERS };
})();

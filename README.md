# Worldseed

**Type one sentence. Claude grows it into a 3D world you can walk through, full of people who remember you.**

▶ **Play it:** https://vulnix0x4.github.io/worldseed/

Worldseed is a small game engine with Claude as its world designer. You describe a place, like *"a drowned city where the bells still ring at low tide"*, and the world assembles in front of you while Claude writes it: first the sky colors, then the land rising from the sea, then forests, landmarks and people. Then you walk in.

## What's in a world

- **Land and atmosphere.** Nine terrain shapes (islands, archipelago, mountains, valley, plains, dunes, canyon, crater, plateau), animated low-poly water, a day and night cycle with stars and moonlight, and ten weathers: rain, storms with lightning, snow, fog, fireflies, petals, embers, ash and aurora.
- **Places.** Twenty-seven procedural landmark types, from lighthouses with sweeping beams and windmills with turning sails to portals, observatories and shipwrecks. Each one has a name and a story. Find them all to finish your journal.
- **People who think.** Every character is played by Claude, in character, and knows the world's history, its places and its other people. They remember what you said, and they can act: hand you items, take what you offer, mark places on your map, follow you, even change the weather. Each world is generated with a chain of favors between its people that sends you across the whole map.
- **A director.** Press <kbd>R</kbd> and type *"a storm rolls in from the sea"* or *"raise a ruined tower on the highest hill"*. Claude rewrites the world around you while you stand in it.
- **Other explorers.** Keep a world in the Atlas, and anyone who opens it walks beside you in real time, with chat bubbles.
- **A score.** Each world gets generative music in its own scale and tempo, plus wind, waves near the shore and crickets at night.
- **Postcards.** <kbd>P</kbd> saves a framed snapshot of the view.

## Live vs. recorded

The AI features run through the [claude.ai Artifacts](https://claude.ai) runtime: `sample` for Claude, `db` for the shared Atlas, `room` for live presence, `downloads` for postcards. Open as a claude.ai artifact, worlds grow live on the viewer's own Claude account.

Opened anywhere else, including the GitHub Pages link above, Worldseed replays three hand-built worlds (The Lantern Archipelago, The Glass Dunes and Hollow Pines). Their people speak from scripted lines but still follow their full quest chains.

## Controls

| | |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / arrows | walk |
| <kbd>Shift</kbd> | run |
| <kbd>Space</kbd> | jump |
| drag | look around |
| scroll | zoom |
| <kbd>E</kbd> | talk |
| <kbd>J</kbd> / <kbd>M</kbd> / <kbd>R</kbd> | journal, map, reshape |
| <kbd>T</kbd> | say something to other explorers |
| <kbd>P</kbd> | postcard |

On a phone, use the on-screen stick and drag to look.

## How it works

Claude never writes code for a world. It writes **JSON Lines**, one object per line, and the engine applies each line the moment it arrives:

```jsonl
{"kind":"world","name":"Hollow Bell Reach","hour":18.5,"weather":"fog","music":{"scale":"dorian","tempo":58}}
{"kind":"palette","skyTop":"#3d4a6b","skyHorizon":"#e8c9a8","water":"#2c4a5a", "...": "..."}
{"kind":"terrain","shape":"archipelago","height":0.4,"water":0.55,"seed":8812}
{"kind":"landmark","type":"tower","name":"The Sunken Belfry","about":"...","near":"center"}
{"kind":"npc","name":"Ysolde","role":"last bellkeeper","has":"Tide Table","wants":"Silver Clapper", "...": "..."}
```

Because the engine draws everything procedurally from that small vocabulary, any world Claude imagines renders reliably, and a world is fully described by its lines. That makes worlds tiny to store and share, and reshaping a world just appends more lines.

Characters reply in plain speech with optional action tags (`[[give:Silver Clapper]]`, `[[reveal:Cathedral of Tides]]`, `[[follow]]`), which the game strips out and carries out.

| File | What it does |
|---|---|
| `worldseed/world.js` | three.js engine: terrain, water and sky shaders, time of day, weather, flora instancing, characters, player and camera |
| `worldseed/builders.js` | procedural landmarks, flora and characters |
| `worldseed/mind.js` | prompts, the JSON Lines reader and validation, character action tags |
| `worldseed/app.js` | genesis, conversations, journal, map, director, Atlas, live presence, postcards, controls |
| `worldseed/sound.js` | generative score and ambience (Web Audio) |
| `worldseed/seeds.js` | the three hand-built worlds |
| `worldseed/core.js` | seeded noise and geometry helpers |

`index.html` is the claude.ai artifact version of each page. `play.html` is the same page with a full HTML document around it, for hosting anywhere.

## Also in this repo: Ephemera

`ephemera/` is an earlier experiment: a desktop with no installed apps. You describe an app, and Claude writes it live into a sandboxed window. Apps can call Claude themselves, repair their own crashes, and be kept on a shared shelf. There's also an "Obituaries" window for kinds of software that AI made obsolete. [Try it](https://vulnix0x4.github.io/worldseed/ephemera/play.html) (recorded builds outside claude.ai).

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/worldseed/play.html. There's no build step and nothing to install; three.js loads from cdnjs.

---

Built with [Claude Code](https://claude.com/claude-code).

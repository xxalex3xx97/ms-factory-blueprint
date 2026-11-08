# MS Factory Blueprint

Browser tool to plan a station factory for **Main Sequence**: a top-down grid of station blocks, plus the factory floor inside them (machines, belts, ports, doors, recipes and items/min rates).

**Live site:** https://xxalex3xx97.github.io/ms-factory-blueprint/

## Features
- Station block layout with the in-game palette, rotation, move, copy, delete.
- Internal factory floor per block (14x14, 14x30, 30x30) with doorways.
- Machines and belts with toggleable ports, belt link overlay, underground length warnings.
- Splitters: the input side is drawn as a small chevron (not a port); the three output ports (right, front, left, rotating with the machine) are toggleable and exported in the game's byte order. Importing a station block file keeps the block positions as in the file.
- Recipe selection per machine, items/min rates and belt speed (Mk1-3) checks.
- Live simulation: play/pause, 1x/10x/60x; containers, machines (idle/working/starved/blocked), splitters, balancers, merges and undergrounds.
- Bottlenecks view: Flow / Blockage colours from the plan or the live simulation.
- Configurable containers (items, amounts, infinite source), recipe supply vs need, hotbar, autosave in your browser.
- Item and block icons.
- JSON export / import. Static page (index.html + css/ + js/ plain scripts), no build step, opens from file://.

## Companion mod: Blueprint Unit
[**MSBlueprintUnit**](https://github.com/xxalex3xx97/MSBlueprintUnit) turns a plan from this site into a real factory in Main Sequence. Use the **Companion mod** button in the site header to open its page.

**What it does**
- Adds a **Blueprint Unit** station block (researched under Computation Science).
- You export the JSON here (File > Export), open the unit in the game and paste it in.
- The window shows the net **modification cost** before anything is built.
- **Build** places the machines, belts and ports on your station. Parts that already match are kept, different ones are changed in place, stale ones are removed and refunded to the unit. A splitter whose ports differ is replaced.
- With the optional **Station Build** checkbox the unit also places the station blocks of the JSON first (a block in the way is removed, research and cost are checked).

**What you need:** Main Sequence Demo and MSCore (installed with MSCoreManager): MSCore 0.7.6 or newer, 0.8.0 for Station Build, 0.8.1 so hand deconstruction refunds into your own inventory. Install steps are in the mod's README.

## Roadmap
- [x] Savegame station selection: load a save and pick one of its stations to plan or edit.
- [x] In-game blueprint construction: see the Blueprint Unit mod below.

## Notes
Game data and icons belong to the Main Sequence developers. This is an unofficial fan tool.

## File map
- `index.html`: markup only (header, panels, dialogs). Loads `css/style.css` and the `js/*.js` scripts.
- `css/style.css`: all styles.
- `js/*.js`: classic scripts, global scope (no modules, no IIFE). `<script defer>` in this order: catalog, core, model, sim, draw, input, snippets, palette, inspector, planner, panel, io, simui, panels, autosave, boot. Order matters; boot.js last (sets `window.__fb`, restores autosave, first draw).
- `js/catalog.js`: generated `CATALOG` line (icon data URIs), rewritten by `extract/inject_catalog.py` in the mod repo.
- Tests: `node tests/harness.mjs`, `node tests/snippets-planner.mjs`.

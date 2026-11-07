# MS Factory Blueprint

Browser tool to plan a station factory for **Main Sequence**: a top-down grid of station blocks, plus the factory floor inside them (machines, belts, ports, doors, recipes and items/min rates).

**Live site:** https://xxalex3xx97.github.io/ms-factory-blueprint/

## Features
- Station block layout with the in-game palette, rotation, move, copy, delete.
- Internal factory floor per block (14x14, 14x30, 30x30) with doorways.
- Machines and belts with toggleable ports, belt link overlay, underground length warnings.
- Recipe selection per machine, items/min rates and belt speed (Mk1-3) checks.
- Live simulation: play/pause, 1x/10x/60x; containers, machines (idle/working/starved/blocked), splitters, balancers, merges and undergrounds.
- Bottlenecks view: Flow / Blockage colours from the plan or the live simulation.
- Configurable containers (items, amounts, infinite source), recipe supply vs need, hotbar, autosave in your browser.
- Item and block icons.
- JSON export / import. Static page (index.html + css/ + js/ plain scripts), no build step, opens from file://.

## Blueprint Unit mod
[MSBlueprintUnit](https://github.com/xxalex3xx97/MSBlueprintUnit) is a Main Sequence mod that adds a **Blueprint Unit** station block. Export the JSON from this site, paste it into the unit's window in the game, check the modification cost, and it builds the factory on your station (keeps what already matches, changes or removes the rest, refunds to the unit). Needs MSCore, installed with MSCoreManager.

## Roadmap
- [ ] Savegame station selection: load a save and pick one of its stations to plan or edit.
- [x] In-game blueprint construction: see the Blueprint Unit mod below.

## Notes
Game data and icons belong to the Main Sequence developers. This is an unofficial fan tool.

## File map
- `index.html`: markup only (header, panels, dialogs). Loads `css/style.css` and the `js/*.js` scripts.
- `css/style.css`: all styles.
- `js/*.js`: classic scripts, global scope (no modules, no IIFE). `<script defer>` in this order: catalog, core, model, sim, draw, input, snippets, palette, inspector, planner, panel, io, simui, panels, autosave, boot. Order matters; boot.js last (sets `window.__fb`, restores autosave, first draw).
- `js/catalog.js`: generated `CATALOG` line (icon data URIs), rewritten by `extract/inject_catalog.py` in the mod repo.
- Tests: `node tests/harness.mjs`, `node tests/snippets-planner.mjs`.

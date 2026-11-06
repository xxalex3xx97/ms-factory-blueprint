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

## Roadmap
- [ ] Savegame station selection: load a save and pick one of its stations to plan or edit.
- [ ] In-game blueprint construction: a mod that imports a blueprint and builds it in the game.

## Notes
Game data and icons belong to the Main Sequence developers. This is an unofficial fan tool.

## File map
- `index.html`: markup only (header, panels, dialogs). Loads `css/style.css` and the `js/*.js` scripts.
- `css/style.css`: all styles.
- `js/*.js`: classic scripts, global scope (no modules, no IIFE). `<script defer>` in this order: catalog, core, model, sim, draw, input, snippets, palette, inspector, planner, panel, io, simui, panels, autosave, boot. Order matters; boot.js last (sets `window.__fb`, restores autosave, first draw).
- `js/catalog.js`: generated `CATALOG` line (icon data URIs), rewritten by `extract/inject_catalog.py` in the mod repo.
- Tests: `node tests/harness.mjs`, `node tests/snippets-planner.mjs`.

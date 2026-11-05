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
- JSON export / import. Single offline HTML file, no build step.

## Roadmap
- [ ] Savegame station selection: load a save and pick one of its stations to plan or edit.
- [ ] In-game blueprint construction: a mod that imports a blueprint and builds it in the game.

## Notes
Game data and icons belong to the Main Sequence developers. This is an unofficial fan tool.

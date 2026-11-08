"""Generate js/shapes.js: real hull shapes (walls / props / port arms / optional outline polys) + catalog patch for allowlisted blocks.

usage:
  python -I extract/gen_shapes.py           write js/shapes.js
  python -I extract/gen_shapes.py --check   exit 1 if js/shapes.js is not what this script generates

Inputs: extract/floors.json (colliders_raw, hull), extract/shapes_src.json (allowlist, patch, floorOrigin),
        extract/extra_blocks.json (portsMesh), extract/sm2_industrial_dock_ports_outline.json (mesh rows, cm).
Shape coords: block units (1 unit = 1 site cell = 100 cm; machine grid units are 50 cm), relative to the floor top-left (floorOrigin).
Walls: collider z-size >= 1.9, else props. Port arms: cm * cm2unit + originBlock, mirrorY, then shifted by floorOrigin.
Per block (shapes_src.json): floorOrigin [x,y] overrides the global one; polys [[[x,y],...],...] (floor cells, block frame like
colliders_raw) are copied into the shape entry as 'polys' (floor frame). Shape-only keys (floorOrigin, polys, shapeOf) never reach the catalog patch. shapeOf: colliders taken from another block in floors.json (add:true mod block).
ground: true = ground-level plan (colliders with z0 >= 1 are overhead: skipped; walls need z0 < 1). solid: true = every collider is a prop.
fill: [x0,y0,x1,y1] block frame = one solid prop, used when the BPO has no colliders (Station Armour); hull size then comes from fill.
add: true = block is not in CATALOG.blocks yet: its full definition (the block's own keys) is appended to CATALOG.blocks before core.js.
iconFile: PNG under extract/icons/, embedded as CATALOG.icons[<icon key>] (data URL). mirrorOf: shape copy of another block, no catalog entry.
flipY: true = mirror the collider and polys y (shape-only). ports: optional 'bay' (numbered belt ports, dock); without 'bay' the port is drawn unnumbered.
entrance: {kind: doors|ports, evidence}: what the Layout arrows mark for this block (doors = catalog door slots, ports = side of the shape's output ports); evidence string says 'inferred' when it is. entrance.gaps: [{side: E|S|W|N, from, to}] block-frame door gaps for no-floor blocks (one mark each, shape frame in 'gaps').
shapeOf: take the colliders of another floors.json block (mod block with the same shape).
top-level 'buildables': {DAT_id: patch} merged into CATALOG.buildables (matched by b.id), e.g. hidden: true = kept for import/export but not offered in the palette (DAT_TradeConsole).
wallsOverride: [[x0,y0,x1,y1]] block-frame wall rects appended to walls (use with drop on the replaced colliders; corridor: 1-unit walls on the strip edges, user "walls THIN").
drop: [collider indices] not drawn. clip: clip walls/props to the tile on N/S. chain: {group, edges {N, S}, evidence} closing walls for open lateral edges. hatch: interior|ring.
wallIdx: [collider indices] low colliders drawn as walls (joined outline + chamfered corners). ring: {c [x,y] block frame, rOut, rIn, gap {side, half}, idx [collider indices drawn as the ring instead of boxes], evidence}.
A block without these keys produces the same entry as before.
"""
import base64, json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
EX = os.path.join(ROOT, 'extract')
OUT = os.path.join(ROOT, 'js', 'shapes.js')
SHAPE_ONLY = ('floorOrigin', 'polys', 'ground', 'solid', 'fill', 'add', 'iconFile', 'mirrorOf', 'entrance', 'wallIdx', 'ring', 'drop', 'chain', 'hatch', 'clip', 'shapeOf', 'flipY', 'wallsOverride')


def rd(name):
    with open(os.path.join(EX, name), encoding='utf-8') as f:
        return json.load(f)


def r3(v):
    return round(v, 3)


def merge_rows(rows):
    # consecutive mesh rows with identical runs become one rect per run
    out, prev = [], None
    for row in rows:
        if prev and prev['runs'] == row['runs'] and abs(prev['y1'] - row['y0']) < 1e-6:
            prev['y1'] = row['y1']
        else:
            prev = {'y0': row['y0'], 'y1': row['y1'], 'runs': row['runs']}
            out.append(prev)
    return out


def gap_rect(g, w, h, ox, oy):
    # door gap on a block edge: block frame (centred on the block) -> shape frame (origin ox,oy); edges at +-8 cells per block cell
    side, a, b = g['side'], g['from'], g['to']
    if side not in ('E', 'S', 'W', 'N') or not a < b:
        sys.exit('bad gap ' + json.dumps(g))
    if side in ('E', 'W'):
        ex = (8 * w if side == 'E' else -8 * w) - ox
        return [side, r3(ex), r3(a - oy), r3(ex), r3(b - oy)]
    ey = (8 * h if side == 'S' else -8 * h) - oy
    return [side, r3(a - ox), r3(ey), r3(b - ox), r3(ey)]


def build():
    src = rd('shapes_src.json')
    fl = rd('floors.json')['blocks']
    eb = rd('extra_blocks.json')
    gox, goy = src['floorOrigin']
    shapes, patch, adds, icons = {}, {}, {}, {}
    for name, p in src['blocks'].items():
        body = {k: v for k, v in p.items() if k not in SHAPE_ONLY}
        if p.get('add'):
            adds[name] = body
        elif not p.get('mirrorOf'):
            patch[name] = body
        if p.get('iconFile'):
            with open(os.path.join(EX, 'icons', p['iconFile']), 'rb') as f:
                icons[p['icon']] = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')
        src_name = p.get('shapeOf', name)   # shapeOf: same colliders as another decoded block (mod block with a cloned shape)
        if src_name not in fl:
            sys.exit('no floors.json entry for ' + src_name)
        ox, oy = p.get('floorOrigin', [gox, goy])   # per-block floor origin overrides the global one
        f = fl[src_name]
        cols = f.get('colliders_raw', [])
        if p.get('flipY'):   # flipY: mirror the collider y (floor frame) when the decoded BPO is upside down vs the Layout
            cols = [[[a, -y1, c], [d, -y0, e]] for (a, y0, c), (d, y1, e) in cols]
        size = f['hull']['size'] if 'hull' in f else None
        walls, props, arms = [], [], []
        ring_idx = set((p.get('ring') or {}).get('idx', []))
        for ci, ((x0, y0, z0), (x1, y1, z1)) in enumerate(cols):
            if p.get('ground') and z0 >= 1:
                continue   # ground plan: overhead boxes (lintels over doors, balcony) are not drawn
            if ci in ring_idx or ci in p.get('drop', []):
                continue   # ring: drawn as a circle; drop: collider not drawn (loose posts on the shipyard N/S edges)   # drawn as a true circle (ring), not as boxes
            rect = [r3(x0 - ox), r3(y0 - oy), r3(x1 - ox), r3(y1 - oy)]
            if p.get('clip'):   # clip: genuine colliders overshoot the tile by 0.24 on N/S (and nothing may start west of it); drawn clipped to the tile so neighbours meet on one line
                rect = [max(0, rect[0]), max(0, rect[1]), rect[2], min(p['h'] * 16, rect[3])]
            wall = (z1 - z0 >= 1.9 and not p.get('solid')) or ci in p.get('wallIdx', [])   # wallIdx: low colliders that are really wall bars (drone bay) -> one joined outline
            (walls if wall else props).append(rect)   # solid: one solid collider = no-build prop
        for x0, y0, x1, y1 in p.get('wallsOverride', []):   # wallsOverride: block-frame wall rects appended (with drop on the replaced colliders)
            walls.append([r3(x0 - ox), r3(y0 - oy), r3(x1 - ox), r3(y1 - oy)])
        if p.get('fill'):
            fx0, fy0, fx1, fy1 = p['fill']
            props.append([r3(fx0 - ox), r3(fy0 - oy), r3(fx1 - ox), r3(fy1 - oy)])
            size = size or [fx1 - fx0, fy1 - fy0]
        pm = (eb.get(name) or {}).get('portsMesh')
        if pm:
            mesh = rd(pm['file'])
            k, (bx, by) = pm['cm2unit'], pm['originBlock']
            for r in merge_rows(mesh['rows']):
                for x0, x1 in r['runs']:
                    ys = [r['y0'] * k + by, r['y1'] * k + by]
                    if pm.get('mirrorY'):
                        ys = [-ys[1], -ys[0]]
                    arms.append([r3(x0 * k + bx - ox), r3(ys[0] - oy), r3(x1 * k + bx - ox), r3(ys[1] - oy)])
        ports = [[q.get('bay'), r3(q['x'] - ox), r3(q['y'] - oy)] for q in (eb.get(name) or {}).get('ports', [])]   # bay (None = unnumbered), x, y of the port cell centre (floor frame)
        entry = {'fw': round(size[0]), 'fh': round(size[1]), 'walls': walls, 'props': props, 'arms': arms, 'ports': ports}
        if p.get('polys'):
            entry['polys'] = [[[r3(x - ox), r3((-y if p.get('flipY') else y) - oy)] for x, y in poly] for poly in p['polys']]
        if p.get('entrance'):   # entrance: {kind: 'doors'|'ports', evidence}; Layout marks door slots (catalog door data) or the side of the output ports
            if p['entrance'].get('kind') not in ('doors', 'ports') or not p['entrance'].get('evidence'):
                sys.exit('bad entrance for ' + name)
            entry['entrance'] = p['entrance']
            if p['entrance'].get('gaps'):   # no-floor doors: [side, x0, y0, x1, y1] gap rects on the block edge, shape frame (Layout marks)
                entry['gaps'] = [gap_rect(g, p['w'], p['h'], ox, oy) for g in p['entrance']['gaps']]
        if p.get('chain'):   # chain: {group, edges {N,S: closing wall rect, block frame}, evidence}: closing walls drawn on the edges with no attached block of the group
            ch = p['chain']
            entry['chain'] = {'group': ch['group'], 'closing': {k: [r3(v[0] - ox), r3(v[1] - oy), r3(v[2] - ox), r3(v[3] - oy)] for k, v in ch['edges'].items()}}
        if p.get('hatch'):
            entry['hatch'] = p['hatch']   # 'interior' = grey no-build hatch inside the closed wall outline; 'ring' = inside the circle
        if p.get('ring'):   # circular ring (Command Module / Blueprint Unit): centre + radii fitted in shapes_src (see ring.evidence), gap = door opening on one side
            rg = p['ring']
            entry['ring'] = {'c': [r3(rg['c'][0] - ox), r3(rg['c'][1] - oy)], 'ro': rg['rOut'], 'ri': rg['rIn'], 'gap': rg['gap'], 'n': len(ring_idx)}
        shapes[name] = entry
    return shapes, patch, adds, icons, src.get('buildables', {})


def render():
    shapes, patch, adds, icons, bsrc = build()
    lines = [
        '// generated by extract/gen_shapes.py (python -I). Do not edit by hand.',
        '// shape units: sim units, origin = floor top-left (block -15,-15). walls / props / arms = [x0,y0,x1,y1].',
        'const SHAPES=' + json.dumps(shapes, sort_keys=True, separators=(',', ':')) + ';',
        '// catalog patch (generated from extract/shapes_src.json): merges into CATALOG.blocks before core.js builds BASE',
        '(function(){const P=' + json.dumps(patch, sort_keys=True, separators=(',', ':')) + ';',
        'const A=' + json.dumps(adds, sort_keys=True, separators=(',', ':')) + ';',
        'const I=' + json.dumps(icons, sort_keys=True, separators=(',', ':')) + ';',
        'const B=' + json.dumps(bsrc, sort_keys=True, separators=(',', ':')) + ';',
        'Object.keys(A).forEach(n=>{if(!CATALOG.blocks.some(b=>b.name===n))CATALOG.blocks.push(Object.assign({name:n},A[n]))});',
        'Object.assign(CATALOG.icons,I);',
        'CATALOG.blocks.forEach(b=>{const p=P[b.name];if(!p)return;const door=Object.assign({},b.door,p.door);Object.assign(b,p,{door})});',
        'CATALOG.buildables.forEach(b=>{const p=B[b.id];if(p)Object.assign(b,p)});})();',
        '',
    ]
    return '\n'.join(lines)


def main():
    text = render()
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8', newline='').read() if os.path.exists(OUT) else ''
        if cur != text:
            print('FAIL js/shapes.js is stale: run python -I extract/gen_shapes.py')
            return 1
        print('OK js/shapes.js up to date')
        return 0
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('wrote', OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())

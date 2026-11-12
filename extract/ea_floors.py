"""Merge EA building-block data into extract/floors.json. Static, read-only on game files.

usage: python -I extract/ea_floors.py <dir with decoded BPO json> [--report]
  decode first: powershell extract/decode_bpo.ps1 -Names <BPO_...> (all of BuildingBlocks) -Out F:\\ms-tools\\json_ea
For every BPO: colliders, BlockBounds, hull, cells, ItemCost, Connectors, DefaultMachines (via bpo_props helpers).
Entry unchanged vs floors.json (colliders + BlockBounds within 0.01): kept as is, `ea` key added.
New or changed: colliders_raw / block_bounds_decoded / hull / cells_* / sides / lintels / floor_rect_inferred recomputed.
--report: print the diff only, write nothing. Field names of floors.json are kept.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpo_props as bp

HERE = os.path.dirname(os.path.abspath(__file__))
FLOORS = os.path.join(HERE, 'floors.json')
SRC = 'cooked EA assets F:/MSEAroot/legacy/MainSequence/Content + EA paks (BPO_* Default objects, CUE4Parse CLI)'
USER_FLOOR = {'BPO_Station_03': [30.0, 30.0]}
R = lambda v: round(v, 4)


def load_bpos(d):
    out = {}
    for path in bp.files([d]):
        name, p = bp.default_obj(bp.load(path))
        if p is not None:
            out['BPO_' + name[4:-2] if name.startswith('BPO_') and name.endswith('_C') else name] = p
    return out


def parse(p):
    cs = [[[c[0], c[1], c[2]], [c[3], c[4], c[5]]] for c in bp.colliders(p.get('Colliders'))]
    bb = p.get('BlockBounds')
    bbd = None
    if bb:
        bbd = [[bp.cell(bb['min'].get('X', 0)), bp.cell(bb['min'].get('Y', 0)), bp.cell(bb['min'].get('Z', 0))],
               [bp.cell(bb['max'].get('X', 0)), bp.cell(bb['max'].get('Y', 0)), bp.cell(bb['max'].get('Z', 0))]]
    ea = {'item_cost': {bp.obj_name(i.get('Item', {})): i.get('Amount') for i in p.get('ItemCost') or []},
          'connectors': [{'class': bp.obj_name(c.get('Class', {})),
                          'grid': [c.get('Transform', {}).get('GridLocation', {}).get('X'), c.get('Transform', {}).get('GridLocation', {}).get('Y')],
                          'height': c.get('Transform', {}).get('Height'), 'rot': c.get('Transform', {}).get('GridRotation')}
                         for c in p.get('Connectors') or []],
          'default_machines': [{'class': bp.obj_name(m.get('Class', {})),
                                'grid': [m.get('Transform', {}).get('GridLocation', {}).get('X'), m.get('Transform', {}).get('GridLocation', {}).get('Y')],
                                'height': m.get('Transform', {}).get('Height'), 'rot': m.get('Transform', {}).get('GridRotation')}
                               for m in p.get('DefaultMachines') or []],
          'ship_collision_r': [bp.cell(s.get('Radius', {})) for s in p.get('ShipCollisions') or []],
          'source': SRC}
    return cs, bbd, ea


def close(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True) or _near(a, b)


def _near(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) < 0.01
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        return all(_near(x, y) for x, y in zip(a, b))
    return False


def derive(cs, bbd):
    """hull, cells, walls per side, lintels, inferred floor from colliders (z-size >= 1.9 = wall, z0 >= 2.5 = lintel)."""
    e = {}
    if cs:
        x0 = min(c[0][0] for c in cs); y0 = min(c[0][1] for c in cs)
        x1 = max(c[1][0] for c in cs); y1 = max(c[1][1] for c in cs)
        e['hull'] = {'min': [x0, y0], 'max': [x1, y1], 'size': [R(x1 - x0), R(y1 - y0)]}
        e['cells_from_hull'] = [R((x1 - x0) / 16), R((y1 - y0) / 16)]
    if bbd:
        e['cells_from_block_bounds'] = [R((bbd[1][0] - bbd[0][0]) / 16), R((bbd[1][1] - bbd[0][1]) / 16)]
    walls = [c for c in cs if c[1][2] - c[0][2] >= 1.9]
    lint = [c for c in cs if c[0][2] >= 2.4]
    if not cs:
        e['kind'] = None
        return e
    if not walls:
        e['kind'] = 'solid_or_nonrect'
        return e
    h = e['hull']
    defs = (('S', 1, h['min'][1], h['min'][0], h['max'][0]), ('N', 1, h['max'][1], h['min'][0], h['max'][0]),
            ('W', 0, h['min'][0], h['min'][1], h['max'][1]), ('E', 0, h['max'][0], h['min'][1], h['max'][1]))
    segs, ths = {}, {}
    for sd, ax, edge, lo, hi in defs:
        seg = [c for c in walls + lint if abs(c[0][ax] - edge) < 1e-3 or abs(c[1][ax] - edge) < 1e-3]
        segs[sd] = seg
        ths[sd] = max([R(c[1][ax] - c[0][ax]) for c in seg if c[1][2] - c[0][2] >= 1.9] or [0])
    perp = {'S': ('W', 'E'), 'N': ('W', 'E'), 'W': ('S', 'N'), 'E': ('S', 'N')}
    sides, full = {}, True
    for sd, ax, edge, lo, hi in defs:
        al = 1 - ax
        th = ths[sd]
        lo2, hi2 = lo + ths[perp[sd][0]], hi - ths[perp[sd][1]]   # corners belong to the perpendicular walls
        spans = sorted((c[0][al], c[1][al]) for c in segs[sd])
        gaps, cur = [], lo2
        for a_, b_ in spans:
            if a_ > cur + 1e-6:
                gaps.append((cur, a_))
            cur = max(cur, b_)
        if cur < hi2 - 1e-6:
            gaps.append((cur, hi2))
        ops = [{'from': R(a_), 'to': R(b_), 'width': R(b_ - a_), 'offset_from_wall_end': R(a_ - (lo + th))} for a_, b_ in gaps]
        for c in lint:
            if c in segs[sd]:
                a_, b_ = c[0][al], c[1][al]
                ops.append({'from': R(a_), 'to': R(b_), 'width': R(b_ - a_), 'offset_from_wall_end': R(a_ - (lo + th))})
        ops.sort(key=lambda g: g['from'])
        if not segs[sd]:
            full = False
        sides[sd] = {'wall_thickness': th, 'openings': ops}
    e['sides_game_frame'] = sides
    e['lintels_z25'] = lint
    e['kind'] = 'walled_room_with_floor'
    bbext = [bbd[1][0] - bbd[0][0], bbd[1][1] - bbd[0][1]] if bbd else None
    covers = bbext is None or all(abs(h['size'][i] - bbext[i]) < 0.5 for i in (0, 1))
    th = max(s['wall_thickness'] for s in sides.values())
    if full and covers and th:
        e['floor_rect_inferred'] = {'min': [R(h['min'][0] + th), R(h['min'][1] + th)], 'max': [R(h['max'][0] - th), R(h['max'][1] - th)],
                                    'size': [R(h['size'][0] - 2 * th), R(h['size'][1] - 2 * th)],
                                    'rule': 'hull minus uniform max perimeter wall thickness'}
    else:
        e['floor_rect_inferred'] = None
        e['floor_rect_note'] = 'not a plain rectangle (walls do not cover the block bounds or a side is open): unknown, needs probe'
    e['interior_solids'] = [c for c in cs if not any(c in v for v in segs.values())]
    return e


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    report = '--report' in argv
    bpos = load_bpos(argv[0])
    doc = json.load(open(FLOORS, encoding='utf-8'))
    blocks = doc['blocks']
    new, changed, same = [], [], []
    for name in sorted(bpos):
        cs, bbd, ea = parse(bpos[name])
        old = blocks.get(name)
        if old is None:
            new.append(name)
        elif close(old.get('colliders_raw', []), cs) and (bbd is None or close(old.get('block_bounds_decoded'), bbd)):
            same.append(name)
        else:
            changed.append(name)
        if report:
            continue
        ent = old or {'class_path': '/Game/Blueprints/BuildingBlocks/%s.%s_C' % (name, name), 'in_catalog': False,
                      'actor': 'BP_' + name[4:], 'has_factory_floor_component': None, 'factory_floor_components': [],
                      'status': {'colliders': 'verified: decoded from cooked EA BPO Default object'}}
        if name in changed and close(old.get('colliders_raw', []), cs):
            ent['block_bounds_decoded'] = bbd   # e.g. EA 2-level height; sides/floor kept (user-verified)
            ent['cells_from_block_bounds'] = derive([], bbd)['cells_from_block_bounds']
            ent.setdefault('status', {})['ea'] = 'colliders identical to demo; BlockBounds refreshed from EA'
        elif name in new or name in changed:
            ent.pop('floor_rect_note', None)
            ent['colliders_raw'] = cs
            if bbd:
                ent['block_bounds_decoded'] = bbd
            ent.update(derive(cs, bbd))
            ent.setdefault('status', {})['ea'] = 'recomputed from EA BPO (%s)' % ('new' if name in new else 'collider/bounds differ from demo')
        if name in USER_FLOOR and not ent.get('floor_rect_inferred'):
            fr = derive(cs, bbd).get('floor_rect_inferred')
            if fr and fr['size'] == USER_FLOOR[name]:
                ent['floor_rect_inferred'] = fr
                ent.pop('floor_rect_note', None)
                ent['floor_crosscheck_user'] = {'size': fr['size'], 'source': 'user 2026-11-12 (screenshots, internal floor %dx%d)' % tuple(fr['size'])}
        ent['ea'] = ea
        blocks[name] = ent
    print('EA BPOs', len(bpos), '| same', len(same), '| changed', len(changed), changed, '| new', len(new), new)
    if not report:
        doc['_meta']['source'] = SRC + '; demo-era entries kept when EA colliders + BlockBounds identical'
        doc['_meta']['generated'] = '2026-11-12'
        doc['_meta']['method'] = 'static decode, game not running; extract/ea_floors.py over CUE4Parse CLI JSON (extract/decode_bpo.ps1)'
        with open(FLOORS, 'w', encoding='utf-8') as f:
            json.dump(doc, f, indent=1, ensure_ascii=False)
        print('wrote', FLOORS, len(blocks), 'blocks')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

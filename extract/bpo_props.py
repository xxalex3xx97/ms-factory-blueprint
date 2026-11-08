"""Print block props of decoded BPO JSON (output of extract/decode_bpo.ps1). Static, read-only.

usage: python -I extract/bpo_props.py <dir-or-json> [more ...]
Units: raw int 65536 = 1 floor cell (100 cm); 16 floor cells = 1 block cell. Printed as floor cells.
Walls = collider z-size >= 1.9 (same rule as gen_shapes.py); the rest are props.
Connectors / MountPoints / DefaultMachines / ItemCost are printed by class name.
"""
import json, os, re, sys

U = 65536   # raw per floor cell
BC = 16     # floor cells per block cell


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def files(args):
    for a in args:
        if os.path.isdir(a):
            for root, _, names in os.walk(a):
                for n in sorted(names):
                    if n.endswith('.json'):
                        yield os.path.join(root, n)
        else:
            yield a


def default_obj(doc):
    # the Default__<Class> export holds the CDO properties (blocks/machines)
    for e in doc if isinstance(doc, list) else [doc]:
        if isinstance(e, dict) and str(e.get('Name', '')).startswith('Default__') and 'Properties' in e:
            return e['Name'][len('Default__'):], e['Properties']
    return None, None


def raw(v):
    return v['Value'] if isinstance(v, dict) and 'Value' in v else v


def cell(v):
    return round(raw(v) / U, 4)


def obj_name(ref):
    # {"ObjectName": "BlueprintGeneratedClass'BPO_LargeConnector_C'", ...} -> BPO_LargeConnector
    s = ref.get('ObjectName', '') if isinstance(ref, dict) else str(ref)
    m = re.search(r"'([^']+)'", s)
    s = m.group(1) if m else s
    return s[:-2] if s.endswith('_C') else s


def colliders(lst):
    out = []
    for b in lst or []:
        mn, mx = b['min'], b['max']
        out.append((cell(mn['X']), cell(mn['Y']), cell(mn['Z']), cell(mx['X']), cell(mx['Y']), cell(mx['Z'])))
    return out


def show(name, p, src):
    print(f'== {name}  ({os.path.basename(src)})')
    cs = colliders(p.get('Colliders'))
    walls = [c for c in cs if c[5] - c[2] >= 1.9]
    print(f'Colliders {len(cs)} (walls {len(walls)}, props {len(cs) - len(walls)}) x0 y0 z0 x1 y1 z1, floor cells:')
    for c in cs:
        print('  ', c)
    bb = p.get('BlockBounds')
    if bb:
        x0, y0, x1, y1 = cell(bb['min']['X']), cell(bb['min']['Y']), cell(bb['max']['X']), cell(bb['max']['Y'])
        print(f'BlockBounds x {x0}..{x1}, y {y0}..{y1} floor cells = block cells {round((x1 - x0) / BC, 3)} x {round((y1 - y0) / BC, 3)}')
    else:
        print('BlockBounds none')
    for c in p.get('Connectors') or []:
        t = c.get('Transform', {})
        g = t.get('GridLocation', {})
        print(f'Connector {obj_name(c.get("Class", {}))} grid ({g.get("X")},{g.get("Y")}) height {t.get("Height")} rot {t.get("GridRotation")}')
    mp = p.get('MountPoints')
    print(f'MountPoints {len(mp)}: {json.dumps(mp)[:300]}' if mp else 'MountPoints none')
    for s in p.get('ShipCollisions') or []:
        loc = s.get('Location', {})
        print(f'ShipCollision r {cell(s.get("Radius", {}))} at ({cell(loc.get("X", {}))},{cell(loc.get("Y", {}))},{cell(loc.get("Z", {}))})')
    for m in p.get('DefaultMachines') or []:
        t = m.get('Transform', {})
        g = t.get('GridLocation', {})
        print(f'DefaultMachine {obj_name(m.get("Class", {}))} grid ({g.get("X")},{g.get("Y")}) height {t.get("Height")} rot {t.get("GridRotation")} (machine grid units)')
        for k in ('Inputs', 'Outputs'):
            if m.get(k):
                print(f'    {k} {json.dumps(m[k])[:300]}')
    ic = p.get('ItemCost') or []
    print('ItemCost ' + (', '.join(f'{obj_name(i.get("Item", {}))} x{i.get("Amount")}' for i in ic) or 'none'))
    print()


def main(args):
    if not args:
        print(__doc__)
        return 2
    for path in files(args):
        name, p = default_obj(load(path))
        if p is None:
            print(f'skip {path}: no Default__ export')
            continue
        show(name, p, path)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

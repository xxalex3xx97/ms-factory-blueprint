# Usage: python -I tools/sav_counts.py FILE.sav
# Prints one JSON line: DisplayName, Type, Blocks/Connectors/Machines counts, ids_unique.
# Independent cross-check for tests/sav_export.mjs (uses the Python writer gvas_w.py).
import sys, os, json, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gvas_w as g

def i32(raw): return struct.unpack_from('<i', raw, 0)[0]

def main():
    d = open(sys.argv[1], 'rb').read()
    h, ps, tail = g.load(d)
    assert g.dump(h, ps, tail) == d, 'roundtrip failed'
    bp = g.find(ps, 'Blueprint').val[1]
    name = g.fstr_r(g.find(bp, 'DisplayName').val[1][9:], 0)[0]
    tp = g.find(bp, 'Type').val[1]
    try:
        typ = g.fstr_r(tp, 0)[0]
    except Exception:
        typ = repr(tp)
    blocks = g.find(bp, 'Blocks').val[1]
    cons = g.find(bp, 'Connectors').val[1]
    macs = g.find(bp, 'Machines').val[1]
    raw = lambda e, n: g.find(e, n).val[1]
    ids = []
    for e in blocks + cons:
        ids.append(i32(raw(e, 'BlockID')))
        for m in g.find(e, 'DefaultMachines').val[1]:
            ids.append(i32(raw(m, 'MachineID')))
    for e in macs:
        ids.append(i32(raw(e, 'MachineID')))
    print(json.dumps({'DisplayName': name, 'Type': typ, 'Blocks': len(blocks), 'Connectors': len(cons),
                      'Machines': len(macs), 'ids_unique': len(ids) == len(set(ids))}))

if __name__ == '__main__':
    main()

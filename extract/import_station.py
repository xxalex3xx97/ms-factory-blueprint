"""Import player-made stations from a Main Sequence *_S.sav into Factory Blueprint JSON.

usage:
  python -I import_station.py <file_S.sav> --list
  python -I import_station.py <file_S.sav> --station "NAME" [-o out.json]

--list      player stations (class BP_StationObject only): name, objectId, block count, machine count.
--station   site import JSON {Version:2, DisplayName, Blocks, DefaultMachines}; match name case-insensitive.
            Version 2 = raw game units (block 4 per cell, machine 2 per floor cell, Height 8 per layer for machines);
            index.html importJson converts them (needs catalog footprints). Legacy Version 1/absent = site units.
            default out = <NAME with non-word chars -> _>.json in cwd.
Decoding is generic (no hardcoded offsets); see vault main-sequence tasks brief, Stage 2 decoding.
"""
import struct, sys, json, re, argparse, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config_codec
SIG = bytes.fromhex('02000000' '12000000' 'ff' '01000000')   # BuildBlueprint struct head, then FString DisplayName
STATION = '/Game/Blueprints/Stations/BP_StationObject.BP_StationObject_C'
DIRV = [(1, 0), (0, 1), (-1, 0), (0, -1)]   # rot 0..3 = east, south, west, north (raw units, 2 per cell; = js/core.js DIR)

def load(path):
    d = open(path, 'rb').read()
    I = lambda o: struct.unpack_from('<i', d, o)[0]
    return d, I

def fstr(d, I, o):
    """-> (text, next_offset) or None if not a plausible ASCII FString."""
    if o < 0 or o + 4 > len(d): return None
    n = I(o)
    if not 1 <= n <= 400 or o + 4 + n > len(d) or d[o + 3 + n] != 0: return None
    b = d[o + 4:o + 3 + n]
    if not all(32 <= c < 127 for c in b): return None
    return b.decode('ascii'), o + 4 + n

def top_table(d, I):
    assert I(0) == 0 and I(4) == 30, 'unexpected header'
    n = I(8); o = 12; t = []
    for _ in range(n):
        s, o = fstr(d, I, o); t.append(s)
    return t, o

def local_table_at(d, I, o):
    c = I(o)
    if not 1 <= c <= 255: return None
    p = o + 4; out = []
    for _ in range(c):
        r = fstr(d, I, p)
        if not r or not r[0].startswith('/Game/'): return None
        out.append(r[0]); p = r[1]
    return out, p

def find_local_table(d, I, start, limit):
    for o in range(start, limit):
        if d[o + 4:o + 10] == b'\x40\x00\x00\x00/G' or d[o + 8:o + 14] == b'/Game/':   # cheap prefilter
            r = local_table_at(d, I, o)
            if r: return o, r[0], r[1]
    return None

def read_block(d, I, o):
    """block record: class,X,Y,H,R,ID (6 x i32), PaletteID i32, nMachines i32, then nMachines machine records."""
    cls, x, y, h, r, bid, pal, nm = struct.unpack_from('<8i', d, o); o += 32
    assert 0 <= nm < 64
    b = dict(cls=cls, X=x, Y=y, Height=h, GridRotation=r, BlockID=bid, PaletteID=pal)
    ms = []
    for _ in range(nm):
        m, o = read_machine(d, I, o); ms.append(m)
    return b, ms, o

def read_machine(d, I, o):
    """machine record: class,X,Y,H,R,ID, PaletteID i32, extraLen i32, extra[extraLen]."""
    cls, x, y, h, r, mid, pal, L = struct.unpack_from('<8i', d, o); o += 32
    assert 0 <= L < 100000, 'bad extra len'
    return dict(cls=cls, X=x, Y=y, Height=h, GridRotation=r, MachineID=mid, PaletteID=pal, extra=d[o:o + L]), o + L

def read_blocks(d, I, o):
    n = I(o); o += 4; out = []
    assert 0 <= n < 100000
    for _ in range(n):
        b, ms, o = read_block(d, I, o); out.append((b, ms))
    return out, o

def read_machines(d, I, o):
    n = I(o); o += 4; out = []
    assert 0 <= n < 1000000
    for _ in range(n):
        m, o = read_machine(d, I, o); out.append(m)
    return out, o

def parse_struct(d, I, p, limit):
    """p = offset of SIG. Returns dict or None."""
    nm = fstr(d, I, p + len(SIG))
    if not nm: return None
    t = find_local_table(d, I, nm[1], min(limit, len(d) - 8))
    if not t: return None
    toff, cls, o = t
    try:
        blocks, o = read_blocks(d, I, o)
        conns, o = read_blocks(d, I, o)
        machs, o = read_machines(d, I, o)
    except (AssertionError, struct.error):
        return None
    return dict(name=nm[0], sig=p, table=toff, classes=cls, blocks=blocks, connectors=conns, machines=machs, end=o)

def stations(path):
    d, I = load(path)
    top, tend = top_table(d, I)
    if STATION not in top: return []
    sidx = top.index(STATION)
    res = []
    for m in re.finditer(re.escape(SIG), d):
        p = m.start()
        h = p - 56                                   # object header: [.. 3 ints ..][classIdx][objectId] ... 56 bytes before SIG
        if h < tend or I(h) != sidx: continue
        A = parse_struct(d, I, p, p + 400000)        # copy A (live)
        B = None
        if A:
            nxt = d.find(SIG, A['end'], A['end'] + 13)       # copy B starts right where A ends (only when its name is a literal FString)
            if nxt >= 0: B = parse_struct(d, I, nxt, nxt + 400000)
        res.append(dict(objectId=I(h + 4), header=h, A=A, B=B, tail=d[A['end']:A['end'] + 12].hex(' ') if A else None))
    return res

def underground_lengths(d):
    """{MachineID: Length} for every UndergroundBeltObject world record in the save bytes d (all versions seen: v30 + older).
    Length is NOT in SerializedMachineConfig (empty unless reconfigured). It lives in the live machine object record:
    cls i32, id i32, x i32, y i32 (16.16 fixed, grid/2), then at +36 a 5-word block (w2=0, w3=6), gridX, gridY (+56,+60), 2 u32,
    inputIds TArray<i32>, outputIds TArray<i32>, 2 u32, Items (i32 n + n*{FString, i32 progress}), i32 total (=ProgressPerLength*Length, obj+0x1c0),
    i32 Length (obj+0x1c4), i32 child count (0).  Only the ENTRANCE record exists for game-built tunnels (exit is virtual);
    mod-built pairs have a second record per exit with the same Length.  Not found -> id absent."""
    I = lambda o: struct.unpack_from('<i', d, o)[0]
    t, _ = top_table(d, I); out = {}
    for ci, name in enumerate(t):
        if 'UndergroundBeltObject' not in name: continue
        for m in re.finditer(re.escape(struct.pack('<i', ci)), d):
            o = m.start(); st = o + 36
            try:
                if d[st + 8:st + 16] != b'\0\0\0\0\6\0\0\0': continue
                mid, fx, fy = struct.unpack_from('<3i', d, o + 4)
                if (fx >> 15, fy >> 15) != struct.unpack_from('<2i', d, st + 20): continue
                p = st + 36
                for _ in range(2):                                   # input / output machine id arrays
                    n = I(p); assert 0 <= n < 64; p += 4 + 4 * n
                p += 8; n = I(p); assert 0 <= n < 1000; p += 4
                for _ in range(n):                                   # Items {FString item, i32 progress}
                    r = fstr(d, I, p); p = r[1] + 4
                total, length = struct.unpack_from('<2i', d, p)
                if 0 < length <= 64 and total % length == 0: out[mid] = length
            except (AssertionError, TypeError, struct.error): pass
    return out

def get_underground_length(d, machine_id, _cache={}):
    """Length (cells entrance..exit inclusive) of underground machine_id from save bytes d, or None."""
    k = (id(d), len(d))
    if k not in _cache: _cache.clear(); _cache[k] = underground_lengths(d)
    return _cache[k].get(machine_id)

def ug_exit_dupes(machs, ug):
    """MachineIDs of mod-built exit records: a record with the same Length sitting on entrance + (Length-1) cells (raw: 2 per cell).
    They are kept as plain tiles (no Length, no ConfigHex) so they do not create a second tunnel."""
    at, dup = {}, set()
    for m in machs:
        if m['MachineID'] in ug: at.setdefault((m['X'], m['Y']), []).append(m['MachineID'])
    for m in machs:
        L = ug.get(m['MachineID'])
        if not L or m['MachineID'] in dup: continue
        dx, dy = DIRV[m['GridRotation'] % 4]
        dup.update(i for i in at.get((m['X'] + 2 * (L - 1) * dx, m['Y'] + 2 * (L - 1) * dy), []) if ug[i] == L and i != m['MachineID'])
    return dup

def site_json(A, ug=None):
    """site import format (Version 2, raw game units): Blocks = block records (no connectors); DefaultMachines = hosted + free machines."""
    C = A['classes']; skipped = 0; ug = ug or {}
    def path(i):
        return C[i] if isinstance(i, int) and 0 <= i < len(C) and C[i].startswith('/Game/') else None
    blocks, machs = [], list(A['machines'])
    for b, ms in A['blocks']:
        machs += ms
        p = path(b['cls'])
        if p: blocks.append(dict(Class=p, GridLocation=dict(X=b['X'], Y=b['Y']), Height=b['Height'], GridRotation=b['GridRotation'], BlockID=b['BlockID'], PaletteID=b['PaletteID']))
        else: skipped += 1
    dup = ug_exit_dupes(machs, ug)
    out_m = []
    for m in machs:
        p = path(m['cls'])
        if p:
            e = dict(Class=p.rsplit('/', 1)[-1].split('.')[0], Transform=dict(GridLocation=dict(X=m['X'], Y=m['Y']), Height=m['Height'], GridRotation=m['GridRotation']), MachineID=m['MachineID'], PaletteID=m['PaletteID'])
            if m['extra']:
                e['ConfigHex'] = m['extra'].hex()          # exact SerializedMachineConfig bytes
                d = config_codec.decode(e['Class'], m['extra'])   # decoded view (human; the site decodes ConfigHex itself)
                if d:
                    if 'recipe' in d: e['RecipeName'] = d['recipe']
                    if 'ports' in d: e['PortsEnabled'] = d['ports']
                    if 'filters' in d: e['Filters'] = d['filters']
                    if 'length' in d: e['Length'] = d['length']   # underground: cells entrance..exit inclusive, ONE machine at the entrance
            if m['MachineID'] in dup: e.pop('ConfigHex', None); e.pop('Length', None)   # mod-built exit record: a tile, not a second tunnel
            elif m['MachineID'] in ug: e['Length'] = ug[m['MachineID']]   # world record wins (config is empty unless reconfigured)
            out_m.append(e)
        else: skipped += 1
    out_m.sort(key=lambda m: m['MachineID'])
    return dict(Version=2, DisplayName=A['name'], Blocks=blocks, DefaultMachines=out_m), skipped

def print_list(sts):
    for s in sts:
        A = s['A']
        if not A: print('objectId %d  PARSE FAILED' % s['objectId']); continue
        print('%-16s objectId %d  blocks %d  machines %d' % (A['name'], s['objectId'], len(A['blocks']),
              len(A['machines']) + sum(len(ms) for _, ms in A['blocks'])))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Import player station from Main Sequence _S.sav')
    ap.add_argument('sav')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--station')
    ap.add_argument('-o', dest='out')
    a = ap.parse_args()
    if a.list == (a.station is not None): ap.error('give exactly one of --list or --station "NAME"')
    allst = stations(a.sav)
    if a.list:
        print_list(allst); sys.exit(0)
    hits = [s for s in allst if s['A'] and s['A']['name'].lower() == a.station.lower()]
    if len(hits) != 1:
        print('station "%s" %s' % (a.station, 'not found' if not hits else 'not unique'), file=sys.stderr)
        print_list(allst); sys.exit(1)
    out, skipped = site_json(hits[0]['A'], underground_lengths(load(a.sav)[0]))
    fn = a.out or re.sub(r'\W', '_', out['DisplayName']) + '.json'
    with open(fn, 'w', encoding='utf-8') as f: json.dump(out, f, indent=2)
    print('skipped %d' % skipped, file=sys.stderr)
    print('wrote %s: blocks %d, machines %d' % (fn, len(out['Blocks']), len(out['DefaultMachines'])), file=sys.stderr)

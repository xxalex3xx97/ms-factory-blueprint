"""SerializedMachineConfig decoder/encoder (little endian). Mirror of js/config.js (keep in sync).
Layouts: recipe (Assembler/Refinery/Enrichment/...): 01 00, FString recipe, i32 n, n*u8 ports
splitter/balancer: 01 00, i32 n, n*FString filter, i32 -1, i32 -1, i32 n, n*u8 ports
dock: 01 00, FString name, i32 n, n*{FString item, i32 bLoading}   dronebay: 01 00, FString resource
underground: 01 00, i32 Length (cells entrance..exit inclusive)
"""
import struct


def kind(cls):
    c = cls.lower()
    if 'splitter' in c or 'beltbalancer' in c: return 'splitter'
    if 'underground' in c: return 'underground'
    if 'miningdronebay' in c: return 'dronebay'
    if 'dock' in c and 'docking' not in c: return 'dock'
    if any(k in c for k in ('assembler', 'refinery', 'enrichment', 'growth', 'supercomputer', 'relicsynth')): return 'recipe'
    return None


def fs(s):
    if not s: return struct.pack('<i', 0)
    if any(ord(c) > 127 for c in s):      # UTF-16 (UE IsPureAnsi: any char > 0x7F): negative length = code units incl NUL (mirror of js/config.js cfgEnc)
        u = s.encode('utf-16-le')
        return struct.pack('<i', -(len(u) // 2 + 1)) + u + b'\0\0'
    return struct.pack('<i', len(s) + 1) + s.encode('latin-1') + b'\0'


def encode(k, d):
    o = b'\x01\x00'
    if k == 'recipe': o += fs(d.get('recipe', '')) + struct.pack('<i', len(d['ports'])) + bytes(1 if p else 0 for p in d['ports'])
    elif k == 'splitter':
        o += struct.pack('<i', len(d['filters'])) + b''.join(fs(f) for f in d['filters'])
        o += struct.pack('<ii', d.get('prioA', -1), d.get('prioB', -1)) + struct.pack('<i', len(d['ports'])) + bytes(1 if p else 0 for p in d['ports'])
    elif k == 'dock': o += fs(d.get('name', '')) + struct.pack('<i', len(d['filters'])) + b''.join(fs(f['item']) + struct.pack('<i', f['bLoading']) for f in d['filters'])
    elif k == 'dronebay': o += fs(d.get('resource', ''))
    elif k == 'underground': o += struct.pack('<i', d['length'])
    else: raise ValueError(k)
    return o


def decode(cls, b):
    """-> dict (layout, fields) or None when empty/unknown/malformed (never raises)."""
    k = kind(cls)
    if not b or not k: return None
    p = [0]

    def take(n):
        if n < 0 or p[0] + n > len(b): raise ValueError('short')
        v = b[p[0]:p[0] + n]; p[0] += n; return v
    i32 = lambda: struct.unpack('<i', take(4))[0]

    def fstr():
        n = i32()
        if n == 0: return ''
        if n > 0: return take(n)[:-1].decode('latin-1')   # bytes -> chars 1:1, as js/config.js fstr
        return take(-n * 2)[:-2].decode('utf-16-le')

    def bools(): return [bool(x) for x in take(i32())]
    try:
        if struct.unpack('<H', take(2))[0] != 1: return None
        d = {'layout': k}
        if k == 'recipe': d['recipe'] = fstr(); d['ports'] = bools()
        elif k == 'splitter': d['filters'] = [fstr() for _ in range(i32())]; d['prioA'] = i32(); d['prioB'] = i32(); d['ports'] = bools()
        elif k == 'dock': d['name'] = fstr(); d['filters'] = [{'item': fstr(), 'bLoading': i32()} for _ in range(i32())]
        elif k == 'dronebay': d['resource'] = fstr()
        else: d['length'] = i32()
        return d if p[0] == len(b) else None
    except Exception:
        return None


if __name__ == '__main__':
    r = bytes.fromhex('0100' '0f000000' + b'titaniumplates\0'.hex() + '04000000' '01010101')
    d = decode('BP_RefineryObject_C', r)
    assert d['recipe'] == 'titaniumplates' and encode('recipe', d) == r
    print('ok')

"""GLB (CUE4Parse export) -> top-down footprint. Usage: python -I mesh_outline.py <in.glb> <out.json> [cell_cm=4]
Output: bounds (UE cm, X fwd, Y right, Z up) + occupancy rows {y0,runs:[[x0,x1]..]} of the XY projection (union of triangles).
glTF is Y-up/right-handed, metres: UE x = gltf z*100? verified against ExtendedBounds by the caller (prints bounds)."""
import json, struct, sys

def load(path):
    b = open(path, 'rb').read()
    jl, = struct.unpack_from('<I', b, 12)
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl, = struct.unpack_from('<I', b, off)
    return j, b[off + 8:off + 8 + bl]

def accessor(j, bin_, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    fmt = {5126: 'f', 5125: 'I', 5123: 'H'}[a['componentType']]
    base = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride') or struct.calcsize(fmt) * n
    return [struct.unpack_from('<' + fmt * n, bin_, base + k * stride) for k in range(a['count'])]

def tris(j, bin_):
    """yield (x,y,z) triples in UE cm from every node's mesh (node transforms applied: translation/scale only)"""
    for node in j['nodes']:
        if 'mesh' not in node: continue
        t = node.get('translation', [0, 0, 0]); s = node.get('scale', [1, 1, 1])
        for p in j['meshes'][node['mesh']]['primitives']:
            pos = accessor(j, bin_, p['attributes']['POSITION'])
            idx = [i[0] for i in accessor(j, bin_, p['indices'])] if 'indices' in p else range(len(pos))
            ue = [((q[0] * s[0] + t[0]) * 100, -(q[2] * s[2] + t[2]) * 100, (q[1] * s[1] + t[1]) * 100) for q in pos]  # UE (X,Y,Z) = glTF (x,-z,y)
            for k in range(0, len(idx) - 2, 3):
                yield ue[idx[k]], ue[idx[k + 1]], ue[idx[k + 2]]

def main(src, dst, cell=4.0):
    j, bin_ = load(src)
    T = list(tris(j, bin_))
    xs = [p[0] for t in T for p in t]; ys = [p[1] for t in T for p in t]; zs = [p[2] for t in T for p in t]
    bounds = dict(x=[min(xs), max(xs)], y=[min(ys), max(ys)], z=[min(zs), max(zs)])
    print('tris', len(T), 'bounds cm', {k: [round(v, 1) for v in r] for k, r in bounds.items()})
    gx0, gy0 = bounds['x'][0], bounds['y'][0]
    W = int((bounds['x'][1] - gx0) / cell) + 1; H = int((bounds['y'][1] - gy0) / cell) + 1
    g = [bytearray(W) for _ in range(H)]
    for a, b, c in T:
        # rasterise by sampling the triangle bbox cell centres (barycentric)
        mnx = min(a[0], b[0], c[0]); mxx = max(a[0], b[0], c[0]); mny = min(a[1], b[1], c[1]); mxy = max(a[1], b[1], c[1])
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9:  # degenerate/vertical in projection: mark its bbox cells
            for yy in range(int((mny - gy0) / cell), int((mxy - gy0) / cell) + 1):
                for xx in range(int((mnx - gx0) / cell), int((mxx - gx0) / cell) + 1): g[yy][xx] = 1
            continue
        for yy in range(int((mny - gy0) / cell), int((mxy - gy0) / cell) + 1):
            py = gy0 + (yy + .5) * cell
            for xx in range(int((mnx - gx0) / cell), int((mxx - gx0) / cell) + 1):
                px = gx0 + (xx + .5) * cell
                l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d
                l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d
                if l1 >= -.02 and l2 >= -.02 and 1 - l1 - l2 >= -.02: g[yy][xx] = 1
    rows = []
    for yy, r in enumerate(g):
        runs = []; s = None
        for xx in range(W + 1):
            on = xx < W and r[xx]
            if on and s is None: s = xx
            if not on and s is not None: runs.append([round(gx0 + s * cell, 1), round(gx0 + xx * cell, 1)]); s = None
        if runs: rows.append({'y0': round(gy0 + yy * cell, 1), 'y1': round(gy0 + (yy + 1) * cell, 1), 'runs': runs})
    json.dump({'source': src.split('\\')[-1], 'units': 'UE cm, X fwd, Y right', 'cell': cell, 'bounds': bounds, 'rows': rows}, open(dst, 'w'))
    step = max(1, H // 60)  # preview: one text row per `step` Y rows
    for yy in range(0, H, step): print('%7.1f ' % (gy0 + yy * cell) + ''.join('#' if any(g[y][x] for y in range(yy, min(H, yy + step))) else '.' for x in range(W)))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 4.0)

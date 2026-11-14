// GVAS .sav writer for Designer blueprints. Port of tools/gvas_w.py.
// Plain globals (no modules). Needs SAV_TPL, SAV_PATHS, SAV_CONN, SAV_DEFCFG from sav_template.js.
// Uses only DataView, Uint8Array, atob. No DOM here.

const SAV_NATIVE = new Set(['Color', 'IntPoint', 'Guid', 'Vector', 'Rotator', 'DateTime', 'Vector2D', 'Quat', 'LinearColor', 'Transform']);

function savDV(u8) { return new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }

function savCat(parts) {
  const o = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const x of parts) { o.set(x, p); p += x.length; }
  return o;
}

function savI32(...vals) {
  const o = new Uint8Array(4 * vals.length), v = savDV(o);
  vals.forEach((x, i) => v.setInt32(4 * i, x, true));
  return o;
}

function savFstrR(u8, p) {
  const n = savDV(u8).getInt32(p, true); p += 4;
  if (n === 0) return ['', p];
  if (n > 0) {
    let s = '';
    for (let i = 0; i < n - 1; i++) s += String.fromCharCode(u8[p + i]);
    return [s, p + n];
  }
  let s = '';
  for (let i = 0; i < -n - 1; i++) s += String.fromCharCode(u8[p + 2 * i] | (u8[p + 2 * i + 1] << 8));
  return [s, p - 2 * n];
}

function savFstrW(s) {
  if (s === '') return savI32(0);
  if (/^[\x00-\xff]*$/.test(s)) {
    const o = new Uint8Array(4 + s.length + 1);
    savDV(o).setInt32(0, s.length + 1, true);
    for (let i = 0; i < s.length; i++) o[4 + i] = s.charCodeAt(i);
    return o;
  }
  const o = new Uint8Array(4 + 2 * (s.length + 1));
  savDV(o).setInt32(0, -(s.length + 1), true);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o[4 + 2 * i] = c & 255; o[5 + 2 * i] = c >> 8; }
  return o;
}

function savTnR(u8, p) {
  const [n, p1] = savFstrR(u8, p);
  const c = savDV(u8).getInt32(p1, true);
  let q = p1 + 4;
  const ch = [];
  for (let i = 0; i < c; i++) { const [x, q2] = savTnR(u8, q); ch.push(x); q = q2; }
  return [[n, ch], q];
}

function savTnW(t) { return savCat([savFstrW(t[0]), savI32(t[1].length), ...t[1].map(savTnW)]); }

function savStructName(t) { return t[1].length ? t[1][0][0] : ''; }

function savPropsR(u8, p) {
  const v = savDV(u8), out = [];
  for (;;) {
    const [name, p1] = savFstrR(u8, p);
    if (name === 'None') return [out, p1];
    const [t, p2] = savTnR(u8, p1);
    const size = v.getInt32(p2, true), flags = u8[p2 + 4];
    let q = p2 + 5;
    const n = (flags & 2 ? 16 : 0) + (flags & 1 ? 4 : 0) + (flags & 4 ? 1 : 0);
    const extra = u8.slice(q, q + n);
    q += n;
    const end = q + size;
    let val, qe;
    if (t[0] === 'StructProperty' && !SAV_NATIVE.has(savStructName(t))) {
      const [sub, qq] = savPropsR(u8, q);
      val = ['props', sub]; qe = qq;
    } else if (t[0] === 'ArrayProperty' && t[1][0][0] === 'StructProperty' && !SAV_NATIVE.has(savStructName(t[1][0]))) {
      const c = v.getInt32(q, true);
      let r = q + 4;
      const els = [];
      for (let i = 0; i < c; i++) { const [e, r2] = savPropsR(u8, r); els.push(e); r = r2; }
      val = ['sarr', els]; qe = r;
    } else {
      val = ['raw', u8.slice(q, end)]; qe = end;
    }
    if (qe !== end) throw new Error(`sav: ${name} parse ended at ${qe}, expected ${end}`);
    out.push({ name, t, flags, extra, val });
    p = end;
  }
}

function savPayload(val) {
  if (val[0] === 'raw') return val[1];
  if (val[0] === 'props') return savPropsW(val[1]);
  return savCat([savI32(val[1].length), ...val[1].map(savPropsW)]);
}

function savPropsW(props) {
  const parts = [];
  for (const x of props) {
    const pl = savPayload(x.val);
    parts.push(savFstrW(x.name), savTnW(x.t), savI32(pl.length), Uint8Array.of(x.flags), x.extra, pl);
  }
  parts.push(savFstrW('None'));
  return savCat(parts);
}

function savLoad(u8) {
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'GVAS') throw new Error('sav: not GVAS');
  const v = savDV(u8);
  let p = 16 + 6 + 4;
  p = savFstrR(u8, p)[1];
  p += 4;
  p += 4 + v.getInt32(p, true) * 20;
  p = savFstrR(u8, p)[1] + 1;
  const hdr = u8.slice(0, p);
  const [props, e] = savPropsR(u8, p);
  return { hdr, props, tail: u8.slice(e) };
}

function savDump(o) { return savCat([o.hdr, savPropsW(o.props), o.tail]); }

function savFind(props, name) {
  const r = props.find(x => x.name === name);
  if (!r) throw new Error('sav: missing ' + name);
  return r;
}

function savClone(p) {
  const val = p.val[0] === 'raw' ? ['raw', p.val[1].slice()]
    : p.val[0] === 'props' ? ['props', p.val[1].map(savClone)]
    : ['sarr', p.val[1].map(e => e.map(savClone))];
  return { name: p.name, t: p.t, flags: p.flags, extra: p.extra.slice(), val };
}

// Fixed-size raw sub-prop: bytes must match the template's size.
function savSetFixed(list, name, bytes) {
  const p = savFind(list, name);
  if (p.val[0] !== 'raw' || p.val[1].length !== bytes.length) {
    throw new Error(`sav: ${name} template size ${p.val[1] && p.val[1].length} != export size ${bytes.length}`);
  }
  p.val = ['raw', bytes];
}

// Variable-size raw sub-prop (FString class path, config bytes): no size check.
function savSetVar(list, name, bytes) { savFind(list, name).val = ['raw', bytes]; }

function savSetXform(entry, x, y, h, r) {
  const tr = savFind(entry, 'Transform').val[1];
  savSetFixed(tr, 'GridLocation', savI32(x, y));
  savSetFixed(tr, 'Height', savI32(h));
  savSetFixed(tr, 'GridRotation', savI32(r));
}

function savCfgBytes(hex) {
  const b = hex ? Uint8Array.from(hex.match(/../g), h => parseInt(h, 16)) : new Uint8Array(0);
  return savCat([savI32(b.length), b]);
}

// Clone of a template entry (props list) with Class, Transform, id and palette set.
function savEntry(proto, path, x, y, h, r, pal, idName, id) {
  const e = proto.map(savClone);
  savSetVar(e, 'Class', savFstrW(path));
  savSetXform(e, x, y, h, r);
  savSetFixed(e, idName, savI32(id));
  savSetFixed(e, 'PaletteID', savI32(pal));
  return e;
}

function savExport(j) {
  const o = savLoad(Uint8Array.from(atob(SAV_TPL), c => c.charCodeAt(0)));
  const bp = savFind(o.props, 'Blueprint').val[1];
  const warn = [];

  // Name: keep the 9-byte FText header from the template, new FString after it.
  const name = String(j.DisplayName || 'blueprint');
  const dn = savFind(bp, 'DisplayName');
  dn.val = ['raw', savCat([dn.val[1].slice(0, 9), savFstrW(name)])];

  // Blank thumbnail on purpose: 65536 greyscale ints, all 0.
  const px = new Uint8Array(4 + 65536 * 4);
  savDV(px).setInt32(0, 65536, true);
  savFind(savFind(bp, 'Screenshot').val[1], 'GreyscaleValues').val = ['raw', px];

  // Prototypes: first template entry of each list (already trimmed to one entry).
  const protoBlk = savFind(bp, 'Blocks').val[1][0];
  const protoCon = savFind(bp, 'Connectors').val[1][0];
  const protoMac = savFind(bp, 'Machines').val[1][0];

  let nextId = 1;
  const blocks = [], conns = [], machines = [];

  // Blocks and connectors. Prototype already has empty DefaultMachines, so none are written.
  // Default machines inside blocks are not generated (in-block offsets vary per instance).
  for (const b of j.Blocks || []) {
    const short = b.Class.split('/').pop().split('.')[0];
    let path = b.Class;
    if (!b.Class.startsWith('/Game/')) {
      path = SAV_PATHS[short];
      if (!path) { path = `/Game/Blueprints/BuildingBlocks/${short}.${short}_C`; warn.push('guessed path ' + short); }
    }
    const isConn = SAV_CONN.includes(short);
    const e = savEntry(isConn ? protoCon : protoBlk, path, b.GridLocation.X, b.GridLocation.Y,
      b.Height, b.GridRotation, b.PaletteID || 0, 'BlockID', nextId++);
    (isConn ? conns : blocks).push(e);
  }

  // Flat machines. Config from site ConfigHex; underground exit has none, so empty config (unverified in game).
  for (const m of j.DefaultMachines || []) {
    const s = m.Class.split('/').pop().split('.')[0];
    let path = SAV_PATHS[s];
    if (!path) { path = `/Game/Blueprints/Machines/${s}.${s}_C`; warn.push('guessed path ' + s); }
    const t = m.Transform;
    const e = savEntry(protoMac, path, t.GridLocation.X, t.GridLocation.Y, t.Height, t.GridRotation,
      m.PaletteID || 0, 'MachineID', nextId++);
    savSetVar(e, 'SerializedMachineConfig', savCfgBytes(m.ConfigHex || SAV_DEFCFG[s] || ''));
    machines.push(e);
  }

  savFind(bp, 'Blocks').val = ['sarr', blocks];
  savFind(bp, 'Connectors').val = ['sarr', conns];
  savFind(bp, 'Machines').val = ['sarr', machines];
  return { bytes: savDump(o), warn: [...new Set(warn)] };
}

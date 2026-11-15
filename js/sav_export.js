// GVAS .sav writer for Designer blueprints. Port of tools/gvas_w.py.
// Plain globals (no modules). Needs SAV_TPL, SAV_PATHS, SAV_CONN, SAV_DEFM, SAV_DEFCFG from sav_template.js.
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
  if (Math.abs(n) * (n < 0 ? 2 : 1) > u8.length - p) throw new Error('sav: bad string length');
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
  if (/^[\x00-\x7f]*$/.test(s)) {
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

const savShort = c => String(c).split('/').pop().split('.')[0];
const savKey = (s, x, y, h) => s + '|' + x + '|' + y + '|' + h;
// Config hex for an in-block default machine. A matching flat machine (fm) wins; else the template hex
// with its name and filters reset (dock) or the empty named form (elevator/teleporter).
function savInCfg(s, tpl, fm, blockName, res, bf) {
  const k = cfgKind(s); let hex = fm && fm.ConfigHex ? fm.ConfigHex : tpl;
  if (!(fm && fm.ConfigHex)) {
    if (k === 'dock') { const d = cfgDec(s, tpl); hex = d ? cfgEnc('dock', {name: '', filters: d.filters.map(() => ({item: '', bLoading: 0}))}) : tpl; }
    else if (k === 'named') hex = cfgEnc('named', {name: ''});
  }
  if (k === 'dronebay' && res) return cfgEnc('dronebay', {resource: res});
  const nm = ((k === 'dock' || k === 'named') && blockName) || (fm && fm.Name) || '';
  const out = nm && (k === 'dock' || k === 'named') ? cfgWithName(s, hex, nm) : hex;
  const d = k === 'dock' && bf && bf.length ? cfgDec(s, out) : null;   // block Filters (site b.df) fill the dock's slots
  return d ? cfgEnc('dock', {name: d.name, filters: d.filters.map((f, i) => bf[i] || f)}) : out;
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

// Icon from the site's own block drawing (browser only): paintFloorBase (shape floors, walls, hatch, port bars) of the
// scene's non-machine blocks on an offscreen 256x256 canvas. cx/V/W/H/layer are swapped and restored in finally.
// Pass 1 at 0.5 px/floor cell finds the drawn bbox; pass 2 scales it so the longest side is 250 px, centred.
// Grey: g=round(.299r+.587g+.114b); v = |g-bg|<6 ? 0 : g>=90 ? 255 : max(20,g). Returns Uint8Array(65536) or null (caller falls back to savIcon).
function savIconCanvas() {
  try {
    if (typeof document === 'undefined' || typeof paintFloorBase !== 'function') return null;
    const bl = S.blocks.filter(b => !isM(b));
    if (!bl.length) return null;
    const lays = [...new Set(bl.map(b => b.h))];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of bl) { const d = dim(b); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + d.w); y1 = Math.max(y1, b.y + d.h); }
    const g = document.createElement('canvas'); g.width = g.height = 256;
    const cg = g.getContext('2d', {willReadFrequently: true});
    const sv = {cx, V, W, H, layer};
    const pass = (s, ox, oy) => {
      cx = cg; W = H = 256; V = {ox, oy, z: 1};
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.fillStyle = '#000'; cg.fillRect(0, 0, 256, 256);
      for (const L of lays) { layer = L; paintFloorBase(s); }
      return cg.getImageData(0, 0, 256, 256).data;
    };
    let d1, d2;
    try {
      const s0 = 0.5, cxm = (x0 + x1) / 2 * FC, cym = (y0 + y1) / 2 * FC;   // paintFloorBase works in floor cells (FC per block cell)
      d1 = pass(s0, 128 - cxm * s0, 128 - cym * s0);
      let mnx = 256, mny = 256, mxx = -1, mxy = -1;
      for (let i = 0; i < 65536; i++) if (d1[4 * i] + d1[4 * i + 1] + d1[4 * i + 2] > 0) {
        const x = i & 255, y = i >> 8;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
      }
      if (mxx < 0) return null;
      const longest = Math.max(mxx - mnx + 1, mxy - mny + 1);
      const s1 = s0 * 250 / longest;
      const ccx = ((mnx + mxx + 1) / 2 - (128 - cxm * s0)) / s0, ccy = ((mny + mxy + 1) / 2 - (128 - cym * s0)) / s0;
      d2 = pass(s1, 127.5 - ccx * s1, 127.5 - ccy * s1);
    } finally { ({cx, V, W, H, layer} = sv); }
    const bgG = Math.round(.299 * d2[0] + .587 * d2[1] + .114 * d2[2]);
    const out = new Uint8Array(65536);
    for (let i = 0; i < 65536; i++) {
      const q = 4 * i, gr = Math.round(.299 * d2[q] + .587 * d2[q + 1] + .114 * d2[q + 2]);
      out[i] = Math.abs(gr - bgG) < 6 ? 0 : gr >= 90 ? 255 : Math.max(20, gr);   // 90: outline grey (~98) -> 255, dock/prop fills (~45..70) stay dark
    }
    return out;
  } catch (e) { return null; }
}

function savExport(j, opts) {
  const o = savLoad(Uint8Array.from(atob(SAV_TPL), c => c.charCodeAt(0)));
  const bp = savFind(o.props, 'Blueprint').val[1];
  const warn = [];

  // Name: keep the 9-byte FText header from the template, new FString after it.
  const name = String(j.DisplayName || 'blueprint');
  const dn = savFind(bp, 'DisplayName');
  dn.val = ['raw', savCat([dn.val[1].slice(0, 9), savFstrW(name)])];

  // Screenshot: 65536 greyscale ints from the pure icon renderer (count i32, then i32 per pixel).
  const ic = opts && opts.icon && opts.icon.length === 65536 ? opts.icon : savIcon(j, opts && opts.size), px = new Uint8Array(4 + 65536 * 4), dv = savDV(px);
  dv.setInt32(0, 65536, true);
  for (let i = 0; i < 65536; i++) dv.setInt32(4 + 4 * i, ic[i], true);
  savFind(savFind(bp, 'Screenshot').val[1], 'GreyscaleValues').val = ['raw', px];

  // Prototypes: first template entry of each list (already trimmed to one entry).
  const protoBlk = savFind(bp, 'Blocks').val[1][0];
  const protoCon = savFind(bp, 'Connectors').val[1][0];
  const protoMac = savFind(bp, 'Machines').val[1][0];

  let nextId = 1;
  const blocks = [], conns = [], machines = [];

  // Flat machines that an in-block default machine will reproduce are emitted once, in-block (deduped).
  const flat = new Map(), used = new Set();
  for (const m of j.DefaultMachines || []) {
    const t = m.Transform;
    if (t && t.GridLocation) flat.set(savKey(savShort(m.Class), t.GridLocation.X, t.GridLocation.Y, t.Height), m);
  }

  // Blocks and connectors. In-block default machines (docks, elevators) from SAV_DEFM (FIX-1).
  // Template block DefaultMachines is emptied, so protoMac (a MachineEntry) is the element prototype.
  for (const b of j.Blocks || []) {
    const short = savShort(b.Class);
    let path = b.Class;
    if (!b.Class.startsWith('/Game/')) {
      path = SAV_PATHS[short];
      if (!path) { path = `/Game/Blueprints/BuildingBlocks/${short}.${short}_C`; warn.push('guessed path ' + short); }
    }
    const isConn = SAV_CONN.includes(short);
    const e = savEntry(isConn ? protoCon : protoBlk, path, b.GridLocation.X, b.GridLocation.Y,
      b.Height, b.GridRotation, b.PaletteID || 0, 'BlockID', nextId++);
    // FIX-1: machine pos = 8*block + rotated offset; Height = 8*block Height + dh; rot = block rot + dr.
    // Config is the template hex as-is (dock name not re-encoded).
    const br = ((b.GridRotation % 4) + 4) % 4;
    savFind(e, 'DefaultMachines').val = ['sarr', (SAV_DEFM[short] || (b.Resource && /^BPO_MiningDroneBayBlock(_2)?$/.test(short) && !(j.DefaultMachines || []).some(m => /^BPO_MiningDroneBay(_2)?$/.test(m.Class) && m.Transform && Math.abs(m.Transform.GridLocation.X - 8 * b.GridLocation.X) <= 24 && Math.abs(m.Transform.GridLocation.Y - 8 * b.GridLocation.Y) <= 24) ? [{c: '/Game/Blueprints/Machines/' + short.replace('Block', '') + '.' + short.replace('Block', '') + '_C', dx: 0, dy: 0, dh: 0, dr: 0, hex: ''}] : [])).map(m => {
      let dx = m.dx, dy = m.dy;
      for (let i = 0; i < br; i++) [dx, dy] = [-dy, dx];
      const X = 8 * b.GridLocation.X + dx, Y = 8 * b.GridLocation.Y + dy, H = 8 * b.Height + m.dh;
      const s = savShort(m.c), fm = flat.get(savKey(s, X, Y, H));
      if (fm) used.add(savKey(s, X, Y, H));
      const q = savEntry(protoMac, m.c, X, Y, H, (m.dr + br) & 3, 0, 'MachineID', nextId++);
      savSetVar(q, 'SerializedMachineConfig', savCfgBytes(savInCfg(s, m.hex, fm, b.Name, b.Resource, b.Filters)));
      return q;
    })];
    (isConn ? conns : blocks).push(e);
  }

  // Flat machines. Config from site ConfigHex; underground exit has none, so empty config (unverified in game).
  for (const m of j.DefaultMachines || []) {
    const s = savShort(m.Class);
    let path = SAV_PATHS[s] || (s === 'DAT_Teleporter' && '/Game/Blueprints/Machines/BPO_Teleporter.BPO_Teleporter_C');   // class path seen in a real save
    if (!path) { path = `/Game/Blueprints/Machines/${s}.${s}_C`; warn.push('guessed path ' + s); }
    const t = m.Transform;
    if (used.has(savKey(s, t.GridLocation.X, t.GridLocation.Y, t.Height))) continue;
    const e = savEntry(protoMac, path, t.GridLocation.X, t.GridLocation.Y, t.Height, t.GridRotation,
      m.PaletteID || 0, 'MachineID', nextId++);
    let hx = m.ConfigHex || SAV_DEFCFG[s] || '';
    if (cfgKind(s) === 'dronebay') { const bb = (j.Blocks || []).find(b => b.Resource && /MiningDroneBayBlock/.test(b.Class) && Math.abs(t.GridLocation.X - 8 * b.GridLocation.X) <= 24 && Math.abs(t.GridLocation.Y - 8 * b.GridLocation.Y) <= 24); if (bb) hx = cfgEnc('dronebay', {resource: bb.Resource}); }
    const k = cfgKind(s);
    if (typeof m.Name === 'string' && m.Name && (k === 'dock' || k === 'named')) hx = cfgWithName(s, hx, m.Name);
    savSetVar(e, 'SerializedMachineConfig', savCfgBytes(hx));
    machines.push(e);
  }

  savFind(bp, 'Blocks').val = ['sarr', blocks];
  savFind(bp, 'Connectors').val = ['sarr', conns];
  savFind(bp, 'Machines').val = ['sarr', machines];
  return { bytes: savDump(o), warn: [...new Set(warn)] };
}
// ---- Design .sav import (inverse of savExport): GVAS design file -> site JSON (Version 2). Returns null when u8 is not a design file.
// Machines inside blocks become flat DefaultMachines (as parseSav does for world saves); dock/elevator names and drone bay resource are read from their child configs.
function savImport(u8) { try { return savImport0(u8); } catch (e) { return null; } }
function savImport0(u8) {
  const o = savLoad(u8);
  const bpp = o.props.find(x => x.name === 'Blueprint');
  if (!bpp || bpp.val[0] !== 'props') return null;
  const bp = bpp.val[1], get = (l, n) => { const r = l.find(x => x.name === n); return r && r.val; };
  const bl = get(bp, 'Blocks'), cn = get(bp, 'Connectors'), ma = get(bp, 'Machines'), dn = get(bp, 'DisplayName');
  if (!bl || bl[0] !== 'sarr') return null;   // ship designs have no Machines list
  const i32 = (l, n) => { const v = get(l, n); return v && v[0] === 'raw' && v[1].length >= 4 ? savDV(v[1]).getInt32(0, true) : 0; };
  const fs_ = (l, n) => { const v = get(l, n); return v && v[0] === 'raw' ? savFstrR(v[1], 0)[0] : ''; };
  const xf = l => { const t = get(l, 'Transform'), g = t && get(t[1], 'GridLocation'); const dv = g && savDV(g[1]);
    return { GridLocation: { X: dv ? dv.getInt32(0, true) : 0, Y: dv ? dv.getInt32(4, true) : 0 }, Height: i32(t[1], 'Height'), GridRotation: i32(t[1], 'GridRotation') }; };
  const hexOf = l => { const v = get(l, 'SerializedMachineConfig'); if (!v || v[0] !== 'raw' || v[1].length < 4) return ''; const n = savDV(v[1]).getInt32(0, true);
    return Array.from(v[1].slice(4, 4 + n), b => b.toString(16).padStart(2, '0')).join(''); };
  const mach = (l, bn) => { const c = savShort(fs_(l, 'Class')), t = xf(l), hx = hexOf(l);
    return { Class: c, Transform: { GridLocation: t.GridLocation, Height: t.Height, GridRotation: t.GridRotation }, MachineID: i32(l, 'MachineID'), PaletteID: i32(l, 'PaletteID'), ...(hx ? cfgView(c, hx) : {}) }; };
  const blocks = [], machs = [];
  const addBlock = l => {
    const cls = fs_(l, 'Class'), t = xf(l), e = { Class: cls, GridLocation: t.GridLocation, Height: t.Height, GridRotation: t.GridRotation, BlockID: i32(l, 'BlockID'), PaletteID: i32(l, 'PaletteID') };
    const dm = get(l, 'DefaultMachines');
    for (const m of (dm && dm[0] === 'sarr' ? dm[1] : [])) {
      const q = mach(m), d = q.ConfigHex && cfgDec(q.Class, q.ConfigHex);
      if (d && d.name && (cfgKind(q.Class) === 'dock' || cfgKind(q.Class) === 'named')) e.Name = d.name;
      if (d && d.resource) e.Resource = d.resource;
      machs.push(q);
    }
    blocks.push(e);
  };
  bl[1].forEach(addBlock);
  if (cn && cn[0] === 'sarr') cn[1].forEach(addBlock);
  if (ma && ma[0] === 'sarr') ma[1].forEach(m => machs.push(mach(m)));
  machs.sort((a, b) => a.MachineID - b.MachineID);
  const name = dn && dn[0] === 'raw' && dn[1].length > 9 ? savFstrR(dn[1], 9)[0] : 'Imported';
  return blocks.length ? { Version: 2, DisplayName: name, Blocks: blocks, DefaultMachines: machs } : null;
}
// S4: Download .sav button (browser only). Same name rules as the .json download.
if(typeof document!=="undefined"&&document.getElementById("expSav")){
  document.getElementById("expSav").onclick=()=>{
    let nm=String(S.name||"blueprint").replace(/[<>:"\/\\|?*]+/g,"_");
    if(nm.toLowerCase()==="presets")nm="Presets BP";
    try{
      const j=build();j.DisplayName=nm;
      const r=savExport(j,{size:b=>{const f=dim({cls:b.Class,rot:b.GridRotation});return[f.w,f.h]},icon:savIconCanvas()});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(new Blob([r.bytes],{type:"application/octet-stream"}));
      a.download=nm+".sav";a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      if(r.warn.length)toast("Exported, "+r.warn.length+" class path(s) guessed");
    }catch(e){console.error(e);toast(".sav export failed: "+(e&&e.message||e))}
  };
}

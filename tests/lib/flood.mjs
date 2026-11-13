// Generic connectivity flood for a placed layout (page side). Usage: const r = await page.evaluate(floodPage, {items, finalItems}); items = placed machines (belts, UG, splitters, containers, crafters) in tile coords.
// Nodes: belts, UG pairs (ugPairs), splitters (enabled non-'in' ports, so outputs disabled by off do not carry), containers = junctions (enter via a port -> leave through every other enabled port that has an outgoing belt/UG/splitter).
// Sources: raw containers (ct with inf/n>0 item) and every crafter output belt (tag = recipe output item). Checks: each crafter input port receives exactly one item, which is one of its recipe inputs;
// every recipe input item reaches the crafter; every crafter output reaches a container; no flow into a disabled/non-port of a crafter; UG without partner.
// Returns {errs, machines, containers, reach:[cells 'x,y' reached by any source], ozReach:[container ids reached by flows of finalItems], ozAll} (all JSON).
export const floodPage = a => {
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const isB = b => PLC_BELT.includes(b.cls), isU = b => PLC_UG.includes(b.cls), isP = b => PLC_SPL.includes(b.cls);
  const isL = b => isB(b) || isU(b) || isP(b);
  let nid = 700000;
  const its = a.items.map(b => ({...b, id: ++nid, h: 0}));
  const occ = new Map();
  its.forEach(b => { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) });
  const exitOf = new Map(ugPairs(its.filter(isU)).map(p => [p.u, p.t]));
  const isExit = new Set(exitOf.values());
  const stores = its.filter(b => !isL(b) && isStore(b));
  const mach = its.filter(b => !isL(b) && !isStore(b));
  const ports = new Map([...mach, ...stores, ...its.filter(isP)].map(m => [m, portsOf({...m, off: m.off || []})]));
  const errs = [], hits = new Map(), reach = new Set(), outReach = new Map();
  const flood = (sx, sy, tag) => {
    const seen = new Set(), q = [[sx, sy, false]], got = new Set();
    const step = (x, y, nx, ny, dx, dy) => {
      const mm = occ.get(nx + ',' + ny);
      if (mm && !isL(mm)) {
        const p = ports.get(mm).find(p => p.x + p.nx === x && p.y + p.ny === y && p.nx === -dx && p.ny === -dy);
        if (!p || !p.en) { errs.push('flow into disabled/non-port of ' + mm.cls + ' @' + mm.x + ',' + mm.y + ' from ' + x + ',' + y); return }
        if (stores.includes(mm)) {   // container = junction
          got.add(mm);
          ports.get(mm).forEach(o => {
            if (o === p || !o.en) return;
            const c = occ.get((o.x + o.nx) + ',' + (o.y + o.ny));
            if (c && c !== mm && away(c, o.nx, o.ny)) q.push([o.x + o.nx, o.y + o.ny, false]);
          });
          return;
        }
        if (!hits.has(mm)) hits.set(mm, new Map());
        const h = hits.get(mm); if (!h.has(p.key)) h.set(p.key, new Set()); h.get(p.key).add(tag);
        return;
      }
      q.push([nx, ny, false]);
    };
    while (q.length) {
      const [x, y, jumped] = q.pop(), key = x + ',' + y + ',' + (jumped ? 1 : 0);
      if (seen.has(key)) continue; seen.add(key);
      const it = occ.get(x + ',' + y);
      if (!it || !isL(it)) continue;
      reach.add(x + ',' + y);
      if (isB(it)) { const [dx, dy] = DIRS[it.rot]; step(x, y, x + dx, y + dy, dx, dy) }
      else if (isU(it)) {
        const [dx, dy] = DIRS[it.rot];
        if (isExit.has(it)) step(x, y, x + dx, y + dy, dx, dy);
        else if (exitOf.has(it)) { const t = exitOf.get(it); q.push([t.x, t.y, true]) }
        else errs.push('UG without partner at ' + x + ',' + y);
      } else ports.get(it).filter(p => p.en && p.dir !== 'in').forEach(p => step(p.x, p.y, p.x + p.nx, p.y + p.ny, p.nx, p.ny));
    }
    return got;
  };
  const nameOf = i => (typeof plnNm === 'function' ? plnNm(i) : i);
  const away = (b, nx, ny) => (isB(b) || isU(b)) && !(DIRS[b.rot][0] === -nx && DIRS[b.rot][1] === -ny);   // links1 rule: a belt on an enabled port that does not point into the machine takes its output
  const outBelt = p => { const b = occ.get((p.x + p.nx) + ',' + (p.y + p.ny)); return b && away(b, p.nx, p.ny) ? b : null };
  // sources: raw containers
  stores.forEach(c => {
    const it = (c.ct || []).find(x => x.inf || x.n > 0); if (!it) return;
    ports.get(c).forEach(p => { if (p.en && outBelt(p)) flood(p.x + p.nx, p.y + p.ny, it.item) });
  });
  // sources: crafter outputs (a belt on a port pointing away)
  mach.forEach(m => {
    const r = recOf(m); if (!r) return;
    let n = 0; const got = new Set();
    ports.get(m).forEach(p => { if (p.en && outBelt(p)) { n++; flood(p.x + p.nx, p.y + p.ny, r.o[0]).forEach(c => got.add(c)) } });
    outReach.set(m, got);
    if (!n) errs.push('machine @' + m.x + ',' + m.y + ' has no output belt');
    else if (!got.size) errs.push('machine @' + m.x + ',' + m.y + ' output reaches no container');
  });
  // inputs
  mach.forEach(m => {
    const r = recOf(m); if (!r) return;
    const want = new Set(r.i.map(x => x[0])), h = hits.get(m) || new Map(), seen = new Set();
    h.forEach((tags, k) => {
      if (tags.size > 1) errs.push('machine @' + m.x + ',' + m.y + ' port ' + k + ' gets several items: ' + [...tags].map(nameOf).join('/'));
      tags.forEach(t => { seen.add(t); if (!want.has(t)) errs.push('machine @' + m.x + ',' + m.y + ' receives foreign item ' + nameOf(t)) });
    });
    want.forEach(t => { if (!seen.has(t)) errs.push('machine @' + m.x + ',' + m.y + ' never receives ' + nameOf(t)) });
  });
  const fin = new Set(a.finalItems || []), oz = new Set();
  mach.forEach(m => { const r = recOf(m); if (r && fin.has(r.o[0])) (outReach.get(m) || []).forEach(c => oz.add(c.id)) });
  return {errs: [...new Set(errs)], machines: mach.length, containers: stores.length, reach: [...reach], ozReach: [...oz], ozAll: stores.filter(c => !(c.ct || []).length).length};
};

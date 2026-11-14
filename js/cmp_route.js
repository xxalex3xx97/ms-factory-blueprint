// CMP S5: lane router for the merge region (composer-trees spec section 5). Page globals: PLC_BELT, PLC_UG, def.
// cmpRoute({W,H,rowsN,mk,sources:[{x,y,item}],sinks:[{x,y,item?}],blocked:Set('x,y'),ugMax}) -> {ok,why,items,nets}
// Coords: x 0..W-1, y absolute = block*(H+2)+local (floor local 0..H-1, 2 wall cells between blocks). Sources are rot-0 lane cells at x=0 (item arrives from the west),
// sinks are plain rot-0 belts at x=W-1 (assembler wall step turns them into UGs). Sinks without item match any source.
// Moves: step to a free floor cell, or straight UG hop (entrance = current cell, exit free floor cell, n=exit-entrance+1 <= ugMax) over perpendicular straight belts of other nets,
// or over a wall (entrance last floor cell, exit first floor cell of the next block, vertical only). No same-axis UG end inside any span (ugPairs pairs consecutive ends of a line).
// A belt's rot points to the next cell of its own path only. Greedy per lane (longest first, 3 shuffles); nets = [{id,item,src,sink,cells:['x,y',..]}].
var CMPR_D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function cmpRoute(o) {
  const {W, H, rowsN, mk, sources, sinks, ugMax} = o, blocked = new Set(o.blocked || []), P = H + 2, HT = rowsN * P;
  const key = (x, y) => x + ',' + y, floor = (x, y) => x >= 0 && x < W && y >= 0 && y < HT && y % P < H;
  const sinkAt = new Set(sinks.map(s => key(s.x, s.y))), srcAt = new Set(sources.map(s => key(s.x, s.y)));
  const attempt = (order, noise) => {
    const occ = new Map(), ugEnd = new Set(), spans = [];   // occ: cell -> axis of its straight belt (0/1) or 2 (corner); ugEnd: cell of UG ends; spans: {ax,line,lo,hi}
    const used = new Set(), items = [], nets = [], cn = new Map(), joined = new Set();   // JOIN (o.join): cn cell->lane tag of placed belts, joined cells already side-loaded
    const inSpan = (ax, line, p) => spans.some(s => s.ax === ax && s.line === line && p > s.lo && p < s.hi);
    for (const si of order) {
      const s = sources[si];
      const free = k => !occ.has(k) && !blocked.has(k);
      const N = W * HT * 8, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Int8Array(N);   // via: 0 start, 1 step, 2 hop-exit
      const id = (x, y, d, f) => ((y * W + x) * 4 + d) * 2 + f;
      const heap = [];
      const push = (c, i) => { heap.push([c, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p } };
      const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let k = 0; for (;;) { let a = 2 * k + 1, b = a + 1, m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m } } return t };
      const st = id(s.x, s.y, s.sd || 0, 0); dist[st] = 0; push(0, st);
      const relax = (from, c, x, y, d, f, v) => { c += noise ? rnd() * noise : 0; const i = id(x, y, d, f); if (c < dist[i]) { dist[i] = c; prev[i] = from; via[i] = v; push(c, i) } };
      let goal = -1, jd = -1;
      while (heap.length) {
        const [c, i] = pop(); if (c > dist[i]) continue;
        const f = i & 1, d = (i >> 1) & 3, cell = i >> 3, x = cell % W, y = (cell / W) | 0;
        { const k = key(x, y); if (x === W - 1 && f === 0 && sinkAt.has(k) && !used.has(k)) { const t = sinks.find(t => t.x === x && t.y === y); if (t.item === undefined || s.item === undefined || t.item === s.item) { goal = i; break } } }
        if (s.j && f === 0 && x < W - 1) {   // JOIN: side-load this lane into a straight belt of the same sink's lane (perpendicular, not UG, once per cell)
          for (let nd = 0; nd < 4; nd++) { if (nd === (d + 2) % 4) continue; const tx = x + CMPR_D[nd][0], tk = key(tx, y + CMPR_D[nd][1]), ax = occ.get(tk);
            if (tx > 0 && tx < W - 1 && cn.get(tk) === s.item && ax !== undefined && ax !== 2 && ax !== (nd & 1) && !ugEnd.has(tk) && !joined.has(tk)) { goal = i; jd = nd; break } }
          if (goal >= 0) break;
        }
        if (x === W - 1) continue;   // a sink cell is terminal: never route through it
        for (let nd = 0; nd < 4; nd++) {
          if (f && nd !== d) continue;
          if (nd === (d + 2) % 4) continue;
          const [dx, dy] = CMPR_D[nd], nx = x + dx, ny = y + dy, nk = key(nx, ny);
          if (o.eastStart && i === st && nd !== (s.sd || 0)) continue;   // lane cell at x=0 must stay a rot-0 belt (the wall swap makes it a UG exit)
          const turn = nd === d || i === st ? 0 : 0.2;
          if (floor(nx, ny) && nx > 0 && free(nk) && !srcAt.has(nk) && (nx < W - 1 || sinkAt.has(nk))) relax(i, c + 1 + turn + (nx === W - 2 && nd && sinkAt.has(key(W - 1, ny)) ? 4 : 0), nx, ny, nd, 0, 1);   // soft: do not park a bend on the cell in front of a sink lane
          // hop: entrance = this cell, must arrive straight (or the start cell heading east)
          if (nd !== d || f || x === 0 || x === W - 1) continue;
          const ax = nd & 1, line = ax ? x : y, ps = ax ? y : x, sg = dx + dy;
          if (inSpan(ax, line, ps)) continue;
          for (let k = 2; k <= ugMax - 1; k++) {
            const ex = x + dx * k, ey = y + dy * k, ek = key(ex, ey);
            if (ey < 0 || ey >= HT) break; if (!floor(ex, ey) || ex <= 0 || ex >= W - 1) continue;
            const wall = Math.floor(y / P) !== Math.floor(ey / P);
            if (wall && !ax) break;   // walls only separate block rows; a vertical hop may start anywhere (game: UGs cross walls anywhere)
            // cells between: wall cells, empty, or perpendicular straight belts; stop at anything else (corner / same-axis / blocked)
            let ok = true;
            for (let j = 1; j < k; j++) { const bx = x + dx * j, by = y + dy * j, bk = key(bx, by); if (!floor(bx, by)) continue; if (occ.has(bk) ? occ.get(bk) === ax : blocked.has(bk) || srcAt.has(bk) || sinkAt.has(bk)) { ok = false; break } }
            if (!ok) break;   // (wall hop has no floor cells between; longer spans cannot jump past a non-crossable cell)
            if (!free(ek) || srcAt.has(ek) || sinkAt.has(ek) || ugEnd.has(ek) || (ax && ex === W - 2 && sinkAt.has(key(W - 1, ey)))) continue;
            if (inSpan(ax, line, ax ? ey : ex)) continue;
            // new span must not contain a same-axis UG end
            let bad = false; for (let j = 1; j < k; j++) if (ugEnd.has(key(x + dx * j, y + dy * j))) bad = true;
            if (bad) continue;
            relax(i, c + 2.5, ex, ey, nd, 1, 2);   // SHAPE2: flat hop cost (items count, not length): a straight run is a chain of long hops
          }
        }
      }
      if (goal < 0) { if (globalThis.__rtlog) globalThis.__rtlog.push(si+":"+nets.map(n=>n.item+" "+n.cells.join(" ")).join("|")); return null }
      // reconstruct
      const path = []; for (let i = goal; i >= 0; i = prev[i]) path.push(i); path.reverse();
      const cells = [], nid = nets.length;
      path.forEach((i, n) => {
        const f = i & 1, d = (i >> 1) & 3, cell = i >> 3, x = cell % W, y = (cell / W) | 0, nx = path[n + 1];
        const last = n === path.length - 1, hopOut = nx !== undefined && via[nx] === 2;
        let rot, cls = PLC_BELT[mk];
        if (last) rot = jd >= 0 ? jd : 0;
        else if (hopOut) { rot = (nx >> 1) & 3; cls = PLC_UG[mk] }
        else { const c2 = nx >> 3; rot = (c2 % W > x) ? 0 : (c2 % W < x) ? 2 : (((c2 / W) | 0) > y) ? 1 : 3 }
        if (f) cls = PLC_UG[mk], rot = d;
        const ug = cls === PLC_UG[mk];
        const k = key(x, y);
        occ.set(k, ug ? rot & 1 : (n === 0 || (d & 1) === (rot & 1)) ? rot & 1 : 2); if (!ug) cn.set(k, s.item);
        if (ug) ugEnd.add(k);
        items.push({cls, x, y, rot, h: 0, pid: 0}); cells.push(k);
        if (hopOut) { const e = nx >> 3, ex = e % W, ey = (e / W) | 0, ax = rot & 1; spans.push({ax, line: ax ? x : y, lo: Math.min(ax ? y : x, ax ? ey : ex), hi: Math.max(ax ? y : x, ax ? ey : ex)}) }
      });
      const gx = (goal >> 3) % W, gy = (((goal >> 3) / W) | 0);
      if (jd >= 0) { const tk = key(gx + CMPR_D[jd][0], gy + CMPR_D[jd][1]); joined.add(tk); nets.push({id: nid, item: s.item, src: {x: s.x, y: s.y}, sink: {x: gx + CMPR_D[jd][0], y: gy + CMPR_D[jd][1]}, join: true, cells}); continue }
      used.add(key(gx, gy));
      nets.push({id: nid, item: s.item, src: {x: s.x, y: s.y}, sink: {x: gx, y: gy}, cells});
    }
    return {items, nets};
  };
  const idx = sources.map((_, i) => i), dmin = i => Math.min(...sinks.filter(t => !o.tagged || t.item === sources[i].item).map(t => Math.abs(t.x - sources[i].x) + Math.abs(t.y - sources[i].y)));
  const str = i => sinks.some(t => t.y === sources[i].y && (t.item === undefined || sources[i].item === undefined || t.item === sources[i].item));   // lane already level with its sink: route it first (straight), it must not be pushed aside
  const ord0 = idx.slice().sort((a, b) => dmin(b) - dmin(a)), ord1 = idx.slice().sort((a, b) => str(b) - str(a) || dmin(b) - dmin(a));
  if (!o.join && sources.length > sinks.length) return {ok: false, why: 'merge routing failed', items: [], nets: []};
  let sd = 12345; const rnd = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;   // seeded: deterministic
  for (let t = 0; t < (globalThis.CMPR_TRIES || (W < 20 ? 300 : 40)); t++) {   // narrow merge region: more shuffles; ponytail: spec said 3 shuffles; greedy order is fragile at 8 lanes, 40 is cheap
    const ord = t === 1 ? ord1 : t ? idx.map(i => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(a => a[1]) : ord0;
    const r = attempt(ord, t > 1 ? 0.6 : 0); if (r) return {ok: true, items: r.items, nets: r.nets};
  }
  return {ok: false, why: 'merge routing failed', items: [], nets: []};
}

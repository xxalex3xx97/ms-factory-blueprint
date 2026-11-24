// Touch UI (m.html only): bottom toolbar, sheets, Pan/Select toggle. No business logic; proxies click the real buttons.
(function () {
  if (!document.documentElement.classList.contains('mob')) return;
  const $ = id => document.getElementById(id);
  const ic = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const mk = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
  const proxies = (list) => list.map(([id, t, cls]) => `<button type="button" data-p="${id}"${cls ? ` class="${cls}"` : ''}>${t}</button>`).join('');

  // palette/inspector collapsed state from desktop is meaningless here
  try { if (typeof palFold === 'function') palFold(false); if (typeof dockFold === 'function') dockFold(false); } catch (e) {}

  // desktop restores some floating windows (Flow...) open; on a phone they would cover the canvas
  // (boot opens Flow after an async restore, so keep closing until the first user tap)
  let usr = false;
  addEventListener('pointerdown', () => { usr = true; }, true);
  const shut = () => { if (!usr) document.querySelectorAll('#fms .fm:not([hidden]) .fmh button, #dProd:not([hidden]) #prodX, #dTheo:not([hidden]) #thX').forEach(b => b.click()); };
  shut();
  new MutationObserver(shut).observe($('stage'), {subtree: true, attributes: true, attributeFilter: ['hidden']});

  const bk = mk('<div id="mbk"></div>');
  const mtb = mk(`<nav id="mtb" aria-label="Toolbar">
    <button type="button" data-s="pal" aria-expanded="false" aria-controls="pal">${ic('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')}Palette</button>
    <button type="button" data-s="dock" aria-expanded="false" aria-controls="dock">${ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>')}Inspect</button>
    <button type="button" data-s="mTools" aria-expanded="false" aria-controls="mTools">${ic('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="8" cy="17" r="2" fill="var(--panel)"/>')}Tools</button>
    <button type="button" data-s="mMenu" aria-expanded="false" aria-controls="mMenu">${ic('<path d="M5 7h14M5 12h14M5 17h14"/>')}Menu</button>
  </nav>`);
  const sheet = (id, title, body) => mk(`<section id="${id}" class="msh" role="dialog" aria-label="${title}"><div class="mgrab"><span>${title}</span><button type="button" class="mx" aria-label="Close ${title}">&times;</button></div>${body}</section>`);
  const tools = sheet('mTools', 'Tools', `<h4>Edit modes</h4><div class="mgrid">${[['del', 'Delete mode'], ['copy', 'Copy mode'], ['paste', 'Paste mode'], ['cfgcopy', 'Copy config'], ['cfgpaste', 'Paste config']].map(([m, t]) => `<button type="button" data-m="${m}">${t}</button>`).join('')}</div><h4>Windows</h4><div class="mgrid">${proxies([['stB', 'Settings'], ['shB', 'Screenshot'], ['simB', 'Simulation'], ['thB', 'Theoretical'], ['plnB', 'Planner'], ['lvB', 'Level'], ['flwB', 'Flow']])}</div>`);
  const menu = sheet('mMenu', 'Menu', `<h4>File</h4><div class="mgrid">${proxies([['nw', 'New / Clear'], ['fOpen', 'Open'], ['fSaveAs', 'Save as'], ['fSave', 'Save', 'pri'], ['exp', 'Export', 'pri']])}</div><h4>Import</h4><div class="mgrid">${proxies([['impSav', 'Import save'], ['imp', 'Import JSON']])}</div><h4>Help</h4><div class="mgrid">${proxies([['fit', 'Zoom to fit'], ['help', 'Help and controls']])}</div>`);
  const sel = mk(`<button type="button" id="mSel" aria-pressed="false" aria-label="Touch mode: Pan. Tap to switch to Select">${ic('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>')}<b>Pan</b></button>`);
  document.querySelector('main').after(mtb);
  document.body.append(bk, tools, menu);
  const fit = mk(`<button type="button" id="mFit" aria-label="Zoom to fit">${ic('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>`);
  fit.addEventListener('click', () => $('fit').click());
  $('stage').append(sel, fit);

  // grab bars inside palette + inspector
  [['pal', 'Palette'], ['dock', 'Inspector']].forEach(([id, t]) => {
    const g = mk(`<div class="mgrab"><span>${t}</span><button type="button" class="mx" aria-label="Close ${t}">&times;</button></div>`);
    $(id).prepend(g);
  });

  const SH = ['pal', 'dock', 'mTools', 'mMenu'];
  function open(id) {
    SH.forEach(s => $(s).classList.toggle('mopen', s === id));
    mtb.querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-expanded', b.dataset.s === id));
    bk.classList.toggle('on', !!id);
  }
  mtb.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) open($(b.dataset.s).classList.contains('mopen') ? null : b.dataset.s); });
  bk.addEventListener('click', () => open(null));
  document.addEventListener('click', e => { if (e.target.closest('.mgrab .mx')) open(null); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') open(null); });
  // proxy buttons: click the real (hidden) header button, then close the sheet
  [tools, menu].forEach(s => s.addEventListener('click', e => {
    const m = e.target.closest('[data-m]');
    if (m) { open(null); const k = m.dataset.m; if (k === 'paste') paste(); else if (k === 'cfgpaste') cfgPasteMode(); else setMode(k); return; }
    const b = e.target.closest('[data-p]'); if (!b) return;
    open(null); const r = $(b.dataset.p); if (r) r.click();
  }));
  // picking a palette item = ready to tap-place: get the sheet out of the way
  $('palList').addEventListener('click', e => { if (e.target.closest('.item')) open(null); });

  // touch placing bar: shown while a palette tool is active. Place = a synthetic mouse click at the canvas centre (the ghost cell), so every tool kind reuses the desktop code
  const bar = mk('<div id="mPlace" role="toolbar" aria-label="Placing" hidden><button type="button" data-a="go" class="pri">Place</button><button type="button" data-a="rot">Rotate</button><button type="button" data-a="flip">Flip</button><button type="button" data-a="stop">Stop</button><button type="button" data-a="done" class="pri">Done</button></div>');
  const hint = mk('<span class="mh" hidden></span>'); bar.prepend(hint);
  const HINT = {del: 'Delete: tap a building or drag a box', copy: 'Copy: drag a box over buildings', cfgcopy: 'Copy config: tap one building', cfgpaste: 'Paste config: drag a box over same-type buildings'};
  $('stage').append(bar);
  const bb = a => bar.querySelector(`[data-a=${a}]`);
  bar.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
    if (k === 'stop') { tb.tr = []; active = null; ugCancel(); all(); return; }
    if (k === 'done') { tbCancel(); exitAll(); return; }
    if (k === 'flip') { if (pasting) { pasting.fl = !pasting.fl; all(); } return; }
    if (k === 'rot') { if (pasting) rotate(); else { placeRot = (placeRot + 1) & 3; all(); } return; }
    if (tbBelt()) { if (k === 'go') tbAnchor(); else if (k === 'ok') tbConfirm(); else if (k === 'cancel') tbCancel(); return; }
    const r = $('cv').getBoundingClientRect(), o = {pointerType: 'mouse', pointerId: 77, button: 0, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true};
    $('cv').dispatchEvent(new PointerEvent('pointerdown', o)); $('cv').dispatchEvent(new PointerEvent('pointerup', {...o, buttons: 0}));
  });
  window.mPlaceSync = () => {
    const md = touchModal(), on = touchPlace() || md, belt = on && tbBelt(), h = md && !pasting ? HINT[mode] : '';
    bar.hidden = !on; document.documentElement.classList.toggle('placing', on); document.documentElement.classList.toggle('mh', !!h);
    if (!on) return;
    const n = belt ? tb.tr.length : 0;
    hint.textContent = h; hint.hidden = !h;
    bb('go').textContent = belt ? 'Anchor' : 'Place';
    bb('go').hidden = md && !pasting;   // del / copy / config modes: only Done
    bb('rot').hidden = (md && !pasting) || n > 0; bb('stop').hidden = md || n > 0;   // anchored belt: Anchor / Confirm / Cancel only
    bb('flip').hidden = !pasting; bb('done').hidden = !md;
    let ok = bar.querySelector('[data-a=ok]'), cn = bar.querySelector('[data-a=cancel]');
    if (!ok) { ok = mk('<button type="button" data-a="ok" class="pri">Confirm</button>'); cn = mk('<button type="button" data-a="cancel">Cancel</button>'); bar.append(ok, cn); }
    ok.hidden = cn.hidden = !(belt && n > 0);
  };

  // Pan / Select
  let on = false;
  const apply = v => {
    on = v; sel.setAttribute('aria-pressed', on);
    sel.querySelector('b').textContent = on ? 'Select' : 'Pan';
    sel.setAttribute('aria-label', 'Touch mode: ' + (on ? 'Select. Tap to switch to Pan' : 'Pan. Tap to switch to Select'));
    if (typeof setTouchSel === 'function') setTouchSel(on);
  };
  sel.addEventListener('click', () => apply(!on));
  apply(false);
})();

// Downloads every media file listed in precache.json into the browser's Cache Storage when the page opens,
// eight at a time, in slide order; sw.js then serves media from that cache.
//   ?cache=N  number of parallel downloads (default 8)      ?cache=0  do not cache
// Media lives on another origin that sends no CORS headers, so the files are read through this site's own
// /media/<path> (a reverse proxy to the same objects) and stored under the URL the page uses.
(function () {
  const MEDIA = 'deck-media-v1', SHELL = 'deck-shell-v1';
  // The gateway in front of the site cuts a response short when it is large and the connection is slow
  // (measured: a 34 MB video stopped after about 0.9 MB), so files are read as byte ranges of this size,
  // each checked for length and asked for again if it came back short.
  const CHUNK = 256 * 1024;
  const box = document.getElementById('mcache');
  const param = new URLSearchParams(location.search).get('cache');
  const parallel = param === null || isNaN(parseInt(param, 10)) ? 8 : Math.max(0, Math.min(32, parseInt(param, 10)));
  const state = window.deckCache = { state: 'idle', parallel: parallel, total: 0, done: 0, failed: 0, bytes: 0, active: 0, peak: 0, seconds: 0 };
  if (!box || !parallel || !('serviceWorker' in navigator) || !('caches' in window)) { state.state = 'off'; return; }

  const text = box.querySelector('.mc-text'), bar = box.querySelector('.mc-bar b'), retry = box.querySelector('.mc-retry');
  const pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  let fadeTimer = 0;

  function show(kind) {
    state.state = kind;
    clearTimeout(fadeTimer);
    box.hidden = false; box.classList.remove('fade'); box.dataset.state = kind;
    retry.hidden = kind !== 'failed';
    bar.style.width = (state.total ? state.done / state.total * 100 : 0).toFixed(1) + '%';
    if (kind === 'ready') {
      text.textContent = 'Assets cached — plays offline';
      fadeTimer = setTimeout(function () { box.classList.add('fade'); fadeTimer = setTimeout(function () { box.hidden = true; }, 1300); }, 4000);
    } else if (kind === 'failed') {
      text.textContent = 'Asset cache ' + state.done + ' / ' + state.total + '，' + state.failed + '  failed';
    } else {
      text.textContent = 'Asset cache ' + state.done + ' / ' + state.total;
    }
  }

  // At most `parallel` requests are on the wire at any time, whether they belong to eight small files
  // or to eight pieces of one large file; the rest wait their turn in order.
  let busy = 0; const waiting = [];
  function enter() { if (busy < parallel) { busy++; return Promise.resolve(); } return new Promise(function (r) { waiting.push(r); }); }
  function leave() { const next = waiting.shift(); if (next) next(); else busy--; }

  // One request; counts how many are on the wire at once.
  async function get(url, range) {
    await enter();
    state.active++; state.peak = Math.max(state.peak, state.active);
    try {
      const response = await fetch(url, { cache: 'no-store', headers: range ? { Range: range } : {} });
      if (response.status !== 200 && response.status !== 206) throw new Error('status ' + response.status);
      return { type: response.headers.get('Content-Type'), status: response.status, body: await response.arrayBuffer() };
    } finally { state.active--; leave(); }
  }

  async function download(url, size) {
    const parts = [];
    let type = '';
    if (size <= CHUNK) {
      const whole = await get(url);
      parts.push(whole.body); type = whole.type;
    } else {
      const piece = async function (start) {
        const end = Math.min(start + CHUNK, size) - 1;
        let error;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt) await pause(400 * Math.pow(2, attempt - 1));
          try {
            const got = await get(url, 'bytes=' + start + '-' + end);
            if (got.status !== 206 || got.body.byteLength !== end - start + 1) throw new Error('short read');
            return got;
          } catch (e) { error = e; }
        }
        throw error;
      };
      const starts = [];
      for (let start = 0; start < size; start += CHUNK) starts.push(start);
      const got = await Promise.all(starts.map(piece));
      got.forEach(function (g) { parts.push(g.body); });
      type = got[0].type;
    }
    const blob = new Blob(parts, { type: type || 'application/octet-stream' });
    if (blob.size !== size) throw new Error('size mismatch');
    return new Response(blob, { status: 200, headers: { 'Content-Type': blob.type, 'Content-Length': String(size) } });
  }

  // Keep a copy of the page, styles, scripts and fonts too, so a reload works without the network.
  async function saveShell() {
    try {
      const cache = await caches.open(SHELL);
      const urls = [location.origin + location.pathname];
      performance.getEntriesByType('resource').forEach(function (entry) {
        const u = new URL(entry.name);
        if (u.origin === location.origin && !u.pathname.startsWith('/media/') && !/\/(sw\.js|precache\.json)$/.test(u.pathname)) urls.push(u.origin + u.pathname);
      });
      await Promise.all(Array.from(new Set(urls)).map(async function (u) {
        if (await cache.match(u)) return;
        const response = await fetch(u, { cache: 'no-cache' });
        if (response.status === 200) await cache.put(u, response);
      }));
    } catch (e) { /* the shell copy is a convenience */ }
  }

  // A video that started loading straight from the media origin cannot continue from the cached copy:
  // the browser remembers, per page and per URL, where a media file came from and refuses to mix the two
  // sources (read error, or "format not supported" on a later load of the same URL). Such an element is
  // started again under a new query string (sw.js ignores the query), keeping its position; `resume`
  // continues playback. Pages opened after caching has finished never need this.
  const firstVisit = !navigator.serviceWorker.controller;  // this page started without the service worker
  const cached = new Set(), direct = new Set();  // files in the cache; files this page may have read directly
  let bump = 0;
  function rearm(el, resume) {
    const at = el.currentTime || 0;
    el.src = (el.currentSrc || el.src).split('?')[0] + '?c=' + (++bump);
    if (at > 0) el.addEventListener('loadedmetadata', function () { el.currentTime = at; if (resume) el.play().catch(function () {}); }, { once: true });
    else if (resume) el.play().catch(function () {});
  }
  function isCached(el) { return cached.has((el.currentSrc || el.src || '').split('?')[0]); }
  document.addEventListener('error', function (e) {
    const el = e.target;
    if (!(el instanceof HTMLMediaElement) || !el.error || !isCached(el)) return;
    const now = Date.now();
    if (el._mcRetry && now - el._mcRetry < 5000) return;
    el._mcRetry = now;
    rearm(el, !el.paused);
  }, true);
  function rearmIdle() {
    document.querySelectorAll('video, audio').forEach(function (el) {
      const url = (el.currentSrc || el.src || '').split('?')[0];
      if (cached.has(url) && (firstVisit || direct.has(url)) && el.paused && (el.readyState > 0 || el.error) && !/[?]c=\d+$/.test(el.currentSrc)) rearm(el, false);
    });
  }

  let running = false;
  async function fill() {
    if (running) return;
    running = true;
    const began = performance.now();
    try {
      const manifest = await fetch('precache.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('manifest ' + r.status)); });
      const files = manifest.files, base = manifest.base + '/';
      const key = function (f) { return base + f[0] + '?v=' + f[2]; };
      const cache = await caches.open(MEDIA);
      const have = new Set((await cache.keys()).map(function (r) { return r.url; }));
      const want = new Set(files.map(key));
      const todo = files.filter(function (f) { return !have.has(key(f)); });
      files.forEach(function (f) { (have.has(key(f)) ? cached : direct).add(base + f[0]); });
      state.total = files.length; state.done = files.length - todo.length; state.failed = 0;
      if (todo.length) {
        // No same-origin media path (plain local preview): leave the deck reading media directly.
        try { await get('media/' + todo[0][0], 'bytes=0-0'); }
        catch (e) { state.state = 'unavailable'; box.hidden = true; console.info('Asset caching unavailable: this site has no /media/ proxy'); return; }
      }
      show(todo.length ? 'saving' : 'ready');
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      const queue = todo.slice();
      async function worker() {
        for (let f = queue.shift(); f; f = queue.shift()) {
          let ok = false;
          for (let attempt = 0; attempt < 3 && !ok; attempt++) {
            if (attempt) await pause(1000 * Math.pow(2, attempt - 1));
            try { await cache.put(key(f), await download('media/' + f[0], f[1])); ok = true; }
            catch (e) { if (attempt === 2) console.warn('Asset caching failed', f[0], e && e.message); }
          }
          if (ok) { state.done++; state.bytes += f[1]; cached.add(base + f[0]); } else state.failed++;
          show('saving');
        }
      }
      await Promise.all(Array.from({ length: parallel }, worker));
      // Drop copies of files the deck no longer uses or that have changed.
      if (!state.failed) await Promise.all(Array.from(have).filter(function (k) { return !want.has(k); }).map(function (k) { return cache.delete(k); }));
      state.seconds = Math.round((performance.now() - began) / 100) / 10;
      if ((firstVisit || todo.length) && !state.rearmed) { state.rearmed = true; rearmIdle(); }
      show(state.failed ? 'failed' : 'ready');
    } catch (e) {
      console.warn('Asset caching incomplete', e && e.message);
      state.failed = state.failed || 1; show('failed');
    } finally { running = false; }
  }

  retry.addEventListener('mousedown', function (e) { e.preventDefault(); });  // keep keyboard focus where it is
  retry.addEventListener('click', function () { fill(); });
  window.addEventListener('online', function () { if (state.state === 'failed') fill(); });

  navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () {
    saveShell();
    fill();
  }).catch(function (e) { console.warn('Asset caching unavailable', e && e.message); });
})();

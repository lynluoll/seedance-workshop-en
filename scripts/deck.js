(function () {
  const stage = document.getElementById('stage');
  const slides = Array.from(document.querySelectorAll('.slide'));
  const progress = document.getElementById('progress');
  const counter = document.getElementById('counter');
  const promptOverlay = document.getElementById('prompt-overlay');
  const menuOverlay = document.getElementById('menu-overlay');
  const prompts = JSON.parse(document.getElementById('prompts').textContent);
  let index = 0;
  const demos = JSON.parse(document.getElementById('demos').textContent);
  const theater = document.getElementById('theater');
  const thVideo = document.getElementById('th-video');
  let demoIndex = -1;

  function openDemo(i) {
    const d = demos[i];
    if (!d) return;
    demoIndex = i;
    theater.className = d.model;
    document.getElementById('th-model').textContent = d.modelName;
    document.getElementById('th-title').textContent = d.title;
    document.getElementById('th-meta').textContent = d.meta;
    const list = document.getElementById('th-points');
    list.textContent = '';
    d.points.forEach(function (pt) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      const s = document.createElement('span');
      b.textContent = pt.k; s.textContent = pt.v;
      li.appendChild(b); li.appendChild(s); list.appendChild(li);
    });
    // Previous / next stay within the same model's demos.
    document.getElementById('th-prev').disabled = !demos[i - 1] || demos[i - 1].model !== d.model;
    document.getElementById('th-next').disabled = !demos[i + 1] || demos[i + 1].model !== d.model;
    thVideo.poster = d.poster;
    thVideo.src = d.src;
    theater.hidden = false;
    document.body.classList.add('demo-open');
    thVideo.play().catch(function () {});
  }

  function closeDemo() {
    if (theater.hidden) return;
    thVideo.pause();
    thVideo.removeAttribute('src');
    thVideo.load();
    theater.hidden = true;
    document.body.classList.remove('demo-open');
    demoIndex = -1;
  }

  function stepDemo(delta) {
    const n = demos[demoIndex + delta];
    if (n && n.model === demos[demoIndex].model) openDemo(demoIndex + delta);
  }

  document.getElementById('th-close').addEventListener('click', closeDemo);

  // ---- Pixel comparison overlay
  const compare = document.getElementById('compare');
  const cmpView = compare.querySelector('.cmp-view');
  const cmpRange = compare.querySelector('.cmp-range');
  function cmpMode(mode) {
    compare.querySelectorAll('[data-cmp]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cmp === mode)); });
    cmpView.classList.toggle('diff', mode === 'diff');
    compare.querySelector('.cmp-d').hidden = mode !== 'diff';
  }
  function openCompare() {
    cmpRange.value = 50; cmpView.style.setProperty('--cut', '50%'); cmpMode('wipe');
    compare.hidden = false; document.body.classList.add('demo-open');
  }
  function closeCompare() {
    if (compare.hidden) return;
    compare.hidden = true; document.body.classList.remove('demo-open');
  }
  cmpRange.addEventListener('input', function () { cmpView.style.setProperty('--cut', cmpRange.value + '%'); });
  compare.querySelectorAll('[data-cmp]').forEach(function (b) { b.addEventListener('click', function () { cmpMode(b.dataset.cmp); }); });
  document.getElementById('cmp-close').addEventListener('click', closeCompare);
  document.getElementById('th-prev').addEventListener('click', function () { stepDemo(-1); });
  document.getElementById('th-next').addEventListener('click', function () { stepDemo(1); });

  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  function show(i, replace) {
    closeDemo();
    closeCompare();
    index = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (el, n) {
      const on = n === index;
      el.classList.toggle('active', on);
      if (!on) el.querySelectorAll('video, audio').forEach(function (m) { m.pause(); });
    });
    progress.style.width = ((index + 1) / slides.length * 100) + '%';
    counter.textContent = (index + 1) + ' / ' + slides.length;
    const hash = '#' + (index + 1);
    if (location.hash !== hash) {
      if (replace) history.replaceState(null, '', hash); else history.pushState(null, '', hash);
    }
  }

  function fromHash() {
    const n = parseInt(location.hash.slice(1), 10);
    show(isNaN(n) ? 0 : n - 1, true);
  }

  function closeOverlays() {
    promptOverlay.classList.remove('open');
    menuOverlay.classList.remove('open');
  }
  function anyOverlay() {
    return promptOverlay.classList.contains('open') || menuOverlay.classList.contains('open');
  }

  function openPrompt(key, title) {
    document.getElementById('prompt-title').textContent = title;
    document.getElementById('prompt-text').textContent = prompts[key] || '';
    document.getElementById('prompt-copy').textContent = 'Copy';
    promptOverlay.classList.add('open');
  }

  function openMenu() {
    menuOverlay.querySelectorAll('button[data-go]').forEach(function (b) {
      b.setAttribute('aria-current', String(parseInt(b.dataset.go, 10) === index));
    });
    menuOverlay.classList.add('open');
  }

  // ---- Interactive layer demo
  document.querySelectorAll('[data-ldemo]').forEach(function (demo) {
    const stage = demo.querySelector('.lstage');
    const layers = Array.from(demo.querySelectorAll('.llayer'));
    const chips = Array.from(demo.querySelectorAll('.lchip'));
    const presets = Array.from(demo.querySelectorAll('.lpre'));
    const diff = demo.querySelector('.ldiff');
    const exact = Array.from(demo.querySelectorAll('.lexact'));
    const slider = demo.querySelector('[data-explode]');
    const PRESETS = {
      orig: ['back', 'splash_left', 'splash_right', 'balls', 'front'],
      delete: ['back', 'balls', 'front'],
      modify: ['back', 'balls_edited', 'front']
    };

    function layout() {
      const t = slider.value / 100;
      stage.classList.toggle('exploded', t > 0.02);
      stage.style.transform = 'rotateX(' + (t * 52) + 'deg) rotateZ(' + (t * -28) + 'deg) scale(' + (1 - t * 0.36) + ')';
      const visible = layers.filter(function (l) { return !l.hidden; });
      const mid = (visible.length - 1) / 2;
      visible.forEach(function (l, i) { l.style.transform = 'translateZ(' + ((i - mid) * t * 150) + 'px)'; });
      // Flat and on a preset: show the pixel-checked composite instead of the stacked layers.
      const key = visible.map(function (l) { return l.dataset.layer; }).join(',');
      let state = '';
      if (t === 0) Object.keys(PRESETS).forEach(function (k) { if (PRESETS[k].join(',') === key) state = k; });
      exact.forEach(function (im) { im.hidden = im.dataset.state !== state; });
    }

    function setVisible(names) {
      layers.forEach(function (l) { l.hidden = names.indexOf(l.dataset.layer) === -1; });
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(names.indexOf(c.dataset.toggle) !== -1)); });
      layout();
    }

    function markPreset(name) {
      presets.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === name)); });
      diff.hidden = name !== 'diff';
    }

    presets.forEach(function (b) {
      b.addEventListener('click', function () {
        const name = b.dataset.preset;
        if (name !== 'diff') setVisible(PRESETS[name]);
        else { slider.value = 0; setVisible(PRESETS.modify); }
        markPreset(name);
      });
    });

    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        const on = c.getAttribute('aria-pressed') !== 'true';
        let names = layers.filter(function (l) { return !l.hidden; }).map(function (l) { return l.dataset.layer; });
        names = names.filter(function (n) { return n !== c.dataset.toggle; });
        if (on) {
          // layers in one group replace each other (original vs edited baseballs)
          if (c.dataset.group) {
            chips.forEach(function (o) {
              if (o !== c && o.dataset.group === c.dataset.group) names = names.filter(function (n) { return n !== o.dataset.toggle; });
            });
          }
          names.push(c.dataset.toggle);
        }
        setVisible(names);
        markPreset('');
      });
    });

    slider.addEventListener('input', function () { if (!diff.hidden) markPreset(''); layout(); });
    layout();
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-compare]')) { openCompare(); return; }
    const dm = e.target.closest('[data-demo]');
    if (dm) { openDemo(parseInt(dm.dataset.demo, 10)); return; }
    const p = e.target.closest('[data-prompt]');
    if (p) { openPrompt(p.dataset.prompt, p.dataset.title); return; }
    const g = e.target.closest('[data-go]');
    if (g) { closeOverlays(); show(parseInt(g.dataset.go, 10)); return; }
    if (e.target.closest('[data-close]') || e.target === promptOverlay || e.target === menuOverlay) closeOverlays();
  });

  document.getElementById('prompt-copy').addEventListener('click', function () {
    const node = document.getElementById('prompt-text');
    const text = node.textContent;
    const btn = this;
    // Fallback when the async clipboard is unavailable or refuses (no focus, no permission):
    // select the whole prompt and try the legacy copy; if that fails too, leave it selected.
    function fallback() {
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      btn.textContent = ok ? 'Copied' : 'Selected — press Ctrl/⌘+C';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { btn.textContent = 'Copied'; }, fallback);
    } else {
      fallback();
    }
  });

  document.getElementById('prev').addEventListener('click', function () { show(index - 1); });
  document.getElementById('next').addEventListener('click', function () { show(index + 1); });
  document.getElementById('menu').addEventListener('click', openMenu);
  document.getElementById('full').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('[data-keys="own"]')) return;
    if (!compare.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeCompare(); }
      return;
    }
    if (!theater.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeDemo(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepDemo(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepDemo(-1); }
      else if (e.key === ' ' && e.target !== thVideo) { e.preventDefault(); if (thVideo.paused) thVideo.play(); else thVideo.pause(); }
      return;
    }
    if (e.key === 'Escape') { closeOverlays(); return; }
    if (anyOverlay() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('[data-keys="own"]')) return;
    if (e.target.matches && e.target.matches('input, textarea, select')) return;
    const media = e.target.closest && e.target.closest('video, audio');
    if (media && (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); show(index + 1); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); show(index - 1); break;
      case 'Home': show(0); break;
      case 'End': show(slides.length - 1); break;
      case 'm': case 'M': openMenu(); break;
      case 'f': case 'F': document.getElementById('full').click(); break;
    }
  });

  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', fromHash);
  fit();
  fromHash();
})();

/* Chapter 04: interactive layer stack for the ad showcase. Self-contained; does not depend on deck.js.
   Layers can be switched, pulled apart, and dragged on the stage. */
(function () {
  'use strict';
  var SIZE = 740; // stage size in slide pixels; layer offsets are stored in this unit
  var PRESETS = {
    orig: ['bg', 'headline', 'product', 'offer', 'cta'],
    cta: ['bg', 'headline', 'product', 'offer', 'cta_cn'],
    product: ['bg', 'product'],
    bg: ['bg']
  };
  var STATUS = {
    orig: 'Showing: the original image itself. Drag an element, use a toggle or pull the layers apart to see the separated layers.',
    cta: 'Showing: layers stacked. The button layer swapped for a locally typeset Chinese button; all other layers unchanged.',
    product: 'Showing: layers stacked. Title, offer copy and button turned off — product and background only.',
    bg: 'Showing: the separately generated empty background — swap in any other background directly.'
  };

  document.querySelectorAll('[data-c4demo]').forEach(function (demo) {
    var view = demo.querySelector('.c4-view');
    var stage = demo.querySelector('.c4-stage');
    var layers = Array.prototype.slice.call(demo.querySelectorAll('.c4-layer'));
    var chips = Array.prototype.slice.call(demo.querySelectorAll('.c4-chip'));
    var presets = Array.prototype.slice.call(demo.querySelectorAll('.c4-pre'));
    var exact = demo.querySelector('.c4-exact');
    var slider = demo.querySelector('[data-c4explode]');
    var status = demo.querySelector('[data-c4status]');
    var sel = demo.querySelector('.c4-sel');
    var selName = sel.querySelector('span');
    var resetBtn = demo.querySelector('[data-c4reset]');
    var offsets = {}; // slot -> {x, y}; an original and its replacement share one slot
    var drag = null;

    function slot(l) { return l.dataset.slot || l.dataset.layer; }
    function off(l) { return offsets[slot(l)] || { x: 0, y: 0 }; }
    function box(l) { // element's box inside the stage, in stage pixels, at its original position
      var b = l.dataset.box.split(',').map(function (v) { return parseFloat(v) * SIZE; });
      return { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
    }
    function byName(name) { return layers.filter(function (l) { return l.dataset.layer === name; })[0]; }
    function visibleLayers() { return layers.filter(function (l) { return !l.hidden; }); }
    function visibleNames() { return visibleLayers().map(function (l) { return l.dataset.layer; }); }
    function movedNames() {
      var names = [];
      visibleLayers().forEach(function (l) {
        var o = off(l);
        if (o.x || o.y) names.push(l.dataset.label);
      });
      return names;
    }

    function showSel(l) {
      if (!l) { sel.hidden = true; return; }
      var b = box(l), o = off(l);
      sel.hidden = false;
      sel.style.left = (b.x0 + o.x) + 'px';
      sel.style.top = (b.y0 + o.y) + 'px';
      sel.style.width = (b.x1 - b.x0) + 'px';
      sel.style.height = (b.y1 - b.y0) + 'px';
      selName.textContent = l.dataset.label;
    }

    function layout() {
      var t = slider.value / 100;
      var visible = visibleLayers();
      var mid = (visible.length - 1) / 2;
      stage.classList.toggle('c4-exploded', t > 0.02);
      // Tilt back and turn slightly; scale down so five separated sheets stay inside the stage.
      stage.style.transform = 'rotateX(' + (t * 66) + 'deg) rotateZ(' + (t * 18) + 'deg) scale(' + (1 - t * 0.62) + ')';
      visible.forEach(function (l, i) {
        var o = off(l);
        l.style.transform = 'translate3d(' + o.x + 'px,' + o.y + 'px,' + ((i - mid) * t * 150) + 'px)';
      });

      // Which preset does the current set of layers match?
      var key = visibleNames().join(',');
      var match = '';
      Object.keys(PRESETS).forEach(function (k) { if (PRESETS[k].join(',') === key) match = k; });
      var moved = movedNames();
      presets.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.preset === match && !moved.length));
      });
      resetBtn.disabled = !moved.length;

      // Flat, complete and untouched: show the original image itself, not the stacked model layers.
      exact.hidden = !(t === 0 && match === 'orig' && !moved.length);

      if (t > 0.02) status.textContent = 'Showing: separated layers, pulled apart back to front,  ' + visible.length + '  layers. Pulls back when you drag an element.';
      else if (moved.length) status.textContent = 'Showing: separated layers. Moved: ' + moved.join('、') + '. All other layers stay in place.';
      else if (match) status.textContent = STATUS[match];
      else status.textContent = 'Showing: layers stacked,  ' + visible.length + ' layer(s).';
    }

    function setVisible(names) {
      layers.forEach(function (l) { l.hidden = names.indexOf(l.dataset.layer) === -1; });
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(names.indexOf(c.dataset.toggle) !== -1)); });
      layout();
    }

    function resetPositions() { offsets = {}; showSel(null); }

    function moveTo(l, x, y) {
      // Keep at least part of the element inside the stage.
      var b = box(l), m = 40;
      x = Math.max(m - b.x1, Math.min(SIZE - m - b.x0, x));
      y = Math.max(m - b.y1, Math.min(SIZE - m - b.y0, y));
      offsets[slot(l)] = { x: Math.round(x), y: Math.round(y) };
    }

    presets.forEach(function (b) {
      b.addEventListener('click', function () { resetPositions(); setVisible(PRESETS[b.dataset.preset]); });
    });
    resetBtn.addEventListener('click', function () { resetPositions(); layout(); });

    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var on = c.getAttribute('aria-pressed') !== 'true';
        var names = visibleNames().filter(function (n) { return n !== c.dataset.toggle; });
        if (on) {
          // Layers in one group replace each other (original vs replacement).
          if (c.dataset.group) {
            chips.forEach(function (o) {
              if (o !== c && o.dataset.group === c.dataset.group) {
                names = names.filter(function (n) { return n !== o.dataset.toggle; });
              }
            });
          }
          names.push(c.dataset.toggle);
        }
        setVisible(names);
      });
      // Arrow keys on a focused chip nudge its layer; Shift moves 10 px.
      c.addEventListener('keydown', function (ev) {
        var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
        if (!d) return;
        ev.preventDefault();
        ev.stopPropagation();
        var l = byName(c.dataset.toggle);
        if (!l || l.hidden || l.dataset.layer === 'bg') return;
        if (slider.value !== '0') slider.value = 0;
        var step = ev.shiftKey ? 10 : 1, o = off(l);
        moveTo(l, o.x + d[0] * step, o.y + d[1] * step);
        stage.classList.add('c4-dragging');
        layout();
        showSel(l);
      });
      c.addEventListener('blur', function () { if (!drag) { showSel(null); stage.classList.remove('c4-dragging'); } });
    });

    // ---- Dragging on the stage
    function local(ev) { // pointer position in stage pixels; the deck scales the 1920x1080 stage with CSS
      var r = view.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * SIZE / r.width, y: (ev.clientY - r.top) * SIZE / r.height };
    }
    function hit(p) { // top-most visible element whose box contains the point; the background never moves
      var vis = visibleLayers();
      for (var i = vis.length - 1; i >= 0; i--) {
        var l = vis[i];
        if (l.dataset.layer === 'bg') continue;
        var b = box(l), o = off(l);
        if (p.x >= b.x0 + o.x && p.x <= b.x1 + o.x && p.y >= b.y0 + o.y && p.y <= b.y1 + o.y) return l;
      }
      return null;
    }

    view.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;
      // The pulled-apart view is for looking; a drag returns the stack to flat first.
      if (slider.value !== '0') { slider.value = 0; layout(); }
      var p = local(ev), l = hit(p);
      if (!l) return;
      ev.preventDefault();
      ev.stopPropagation();
      var o = off(l);
      drag = { layer: l, id: ev.pointerId, px: p.x, py: p.y, ox: o.x, oy: o.y };
      try { view.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic pointers cannot be captured */ }
      stage.classList.add('c4-dragging');
      view.classList.add('c4-grabbing');
      showSel(l);
    });
    view.addEventListener('pointermove', function (ev) {
      var p = local(ev);
      if (!drag) { view.classList.toggle('c4-grab', slider.value === '0' ? !!hit(p) : false); return; }
      if (ev.pointerId !== drag.id) return;
      ev.preventDefault();
      moveTo(drag.layer, drag.ox + p.x - drag.px, drag.oy + p.y - drag.py);
      layout();
      showSel(drag.layer);
    });
    function endDrag(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      try { view.releasePointerCapture(ev.pointerId); } catch (e) { /* not captured */ }
      drag = null;
      stage.classList.remove('c4-dragging');
      view.classList.remove('c4-grabbing');
      showSel(null);
      layout();
    }
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);
    view.addEventListener('dragstart', function (ev) { ev.preventDefault(); });

    slider.addEventListener('input', layout);
    // Arrow keys on the slider adjust it; keep them from reaching the deck's page navigation.
    slider.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    layout();
  });
})();

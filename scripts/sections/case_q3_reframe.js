/* Problem 3 landscape & square split: three videos play from 0s together. */
(function () {
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-q3r-sync]') : null;
    if (!b) return;
    var slide = b.closest('.slide');
    if (!slide) return;
    var vids = Array.prototype.slice.call(slide.querySelectorAll('.q3r-row video'));
    vids.forEach(function (v) { v.pause(); v.loop = false; v.muted = true; try { v.currentTime = 0; } catch (e) {} });
    var ready = vids.map(function (v) {
      if (v.readyState >= 3) return Promise.resolve();
      return new Promise(function (res) {
        var done = function () { v.removeEventListener('canplay', done); res(); };
        v.addEventListener('canplay', done);
        v.load();
        setTimeout(res, 4000);
      });
    });
    Promise.all(ready).then(function () {
      vids.forEach(function (v) { try { v.currentTime = 0; } catch (e) {} });
      vids.forEach(function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); });
    });
  });
})();

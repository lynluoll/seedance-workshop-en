// Chapter 03: overview tiles jump to their category slide by menu title.
(function () {
  document.addEventListener('click', function (ev) {
    var tile = ev.target.closest('[data-jump-title]');
    if (!tile) return;
    var title = tile.getAttribute('data-jump-title');
    var buttons = document.querySelectorAll('#menu-overlay button[data-go]');
    for (var i = 0; i < buttons.length; i++) {
      var label = buttons[i].lastChild ? buttons[i].lastChild.textContent : '';
      if (label === title) { buttons[i].click(); return; }
    }
  });
})();

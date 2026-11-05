/*
 * ui_enhancements.js — theme, wayfinding and polish layer.
 * It never modifies VLab state, calculations, packet timing, fragmentation,
 * header inspection, reassembly or quiz evaluation. It only reads input values
 * (for the fragment map) and clicks existing navigation buttons.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var storageKey = 'dcn-vlab-theme';
  var themeButton = document.getElementById('theme-toggle');
  var themeSymbol = themeButton && themeButton.querySelector('.theme-toggle-symbol');
  var themeLabel = themeButton && themeButton.querySelector('.theme-toggle-label');
  var pageLabel = document.getElementById('portal-page-name');
  var navButtons = Array.prototype.slice.call(document.querySelectorAll('.nav-btn[data-section]')).filter(function (b) { return b.getAttribute('data-section') !== 'settings'; });
  var settingsButton = document.querySelector('.nav-btn[data-section="settings"]');
  function lab() { return window.VLab && window.VLab.Settings; }          // settings.js is optional
  function shortcutsOn() { return !lab() || lab().get().shortcuts; }
  var progressFill = document.getElementById('reading-progress-fill');
  var scrollPending = false;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(id) { return document.getElementById(id); }
  function isEditing(target) {
    return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  /* ───────── Theme ───────── */
  function readTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function updateThemeControl(theme) {
    if (!themeButton) return;
    var dark = theme === 'dark';
    var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    themeButton.setAttribute('aria-pressed', dark ? 'true' : 'false');
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label + ' (D)');
    if (themeSymbol) themeSymbol.textContent = dark ? '☀' : '☾';
    if (themeLabel) themeLabel.textContent = dark ? 'Light mode' : 'Dark mode';
  }

  function applyTheme(theme, persist) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    updateThemeControl(next);
    if (persist) {
      try { localStorage.setItem(storageKey, next); } catch (error) { /* still works for this page view */ }
    }
  }

  applyTheme(readTheme(), false);
  if (themeButton) {
    themeButton.addEventListener('click', function () {
      if (lab()) lab().toggleTheme(); else applyTheme(readTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  /* ───────── Page context (header title, aria-current) ───────── */
  function simulationVisible() {
    var sim = $('sec-simulation');
    return !!sim && sim.classList.contains('active');
  }

  /** A running animation keeps playing (and narrating) unseen if the student leaves its page: hold it instead. */
  function holdSimulationIfHidden() {
    var anim = window.VLab && window.VLab.Animation;
    if (anim && anim.getState() === 'running' && (!simulationVisible() || (document.hidden && (!lab() || lab().get().pauseHidden)))) anim.pause();
  }
  document.addEventListener('visibilitychange', holdSimulationIfHidden);

  function refreshPortalContext() {
    holdSimulationIfHidden();
    var active = document.querySelector('.lab-section.active');
    if (!active) return;
    var activeNav = document.querySelector('.nav-btn.active');
    var heading = active.querySelector('h1');
    var title = activeNav ? activeNav.textContent.trim()
      : (heading ? heading.textContent.replace(/\s+/g, ' ').trim() : 'Overview');
    if (pageLabel) pageLabel.textContent = title;
    document.title = title + ' | DCN Virtual Laboratory';
    navButtons.forEach(function (button) {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  if (window.MutationObserver) {
    var sectionObserver = new MutationObserver(refreshPortalContext);
    Array.prototype.forEach.call(document.querySelectorAll('.lab-section'), function (section) {
      sectionObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
    });
  }
  window.addEventListener('hashchange', refreshPortalContext);
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-section], [data-goto]')) window.requestAnimationFrame(refreshPortalContext);
  });
  refreshPortalContext();

  /* ───────── Reading progress ───────── */
  function updateReadingProgress() {
    scrollPending = false;
    if (!progressFill) return;
    var doc = document.documentElement;
    var maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
    var ratio = Math.max(0, Math.min(1, (window.scrollY || doc.scrollTop) / maxScroll));
    progressFill.style.transform = 'scaleX(' + ratio + ')';
  }
  window.addEventListener('scroll', function () {
    if (!scrollPending) { scrollPending = true; window.requestAnimationFrame(updateReadingProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateReadingProgress);
  updateReadingProgress();

  /* ───────── Button ripple ───────── */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.btn, .nav-btn, .theme-toggle');
    if (!button || button.disabled || reduceMotion || root.getAttribute('data-motion') === 'reduce' || !event.clientX) return;
    var rect = button.getBoundingClientRect();
    var ripple = document.createElement('span');
    var size = Math.max(rect.width, rect.height) * 1.15;
    ripple.className = 'ui-ripple';
    ripple.style.width = size + 'px';
    ripple.style.height = size + 'px';
    ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
    button.appendChild(ripple);
    ripple.addEventListener('animationend', function () { ripple.remove(); }, { once: true });
  });

  /* ───────── Range sliders: paint the filled track ───────── */
  function paintRange(input) {
    var min = Number(input.min) || 0;
    var max = Number(input.max) || 100;
    var pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--pct', Math.max(0, Math.min(100, pct)) + '%');
  }
  var ranges = Array.prototype.slice.call(document.querySelectorAll('input[type="range"]'));
  ranges.forEach(function (input) {
    paintRange(input);
    input.addEventListener('input', function () { paintRange(input); });
  });

  /* ───────── Fragment map (live preview on the setup page) ───────── */
  function checkedValue(name) {
    var node = document.querySelector('input[name="' + name + '"]:checked');
    return node ? Number(node.value) : null;
  }
  function mk(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderFragmentMap() {
    var box = $('split-viz');
    var sizeInput = $('in-size');
    var mtuInput = $('in-mtu');
    var Frag = window.VLab && window.VLab.Fragmentation;
    if (!box || !sizeInput || !mtuInput || !Frag) return;

    ranges.forEach(paintRange);
    box.textContent = '';

    var params = {
      datagramSize: Number(sizeInput.value), mtu: Number(mtuInput.value),
      headerLength: checkedValue('header-len'), df: checkedValue('df')
    };
    if (!Frag.validateInputs(params).valid) return;

    var payload = params.datagramSize - params.headerLength;
    var pmax = Frag.computeMaxFragmentPayload(params.mtu, params.headerLength);
    var bar = mk('div', 'sv-bar');
    var headRight;
    var footLeft = 'Max payload per fragment = ' + pmax + ' B';
    var footRight = '';

    if (params.datagramSize <= params.mtu) {
      var whole = mk('div', 'sv-seg is-whole', payload + ' B · fits');
      whole.style.flex = '1 1 0';
      bar.appendChild(whole);
      headRight = 'No fragmentation';
      footRight = 'D ≤ MTU';
    } else if (params.df === 1) {
      var dropped = mk('div', 'sv-seg is-drop', 'Dropped · ICMP type 3, code 4');
      dropped.style.flex = '1 1 0';
      bar.appendChild(dropped);
      headRight = 'DF = 1 · dropped';
      footRight = 'Next-hop MTU ' + params.mtu;
    } else {
      var count = Math.ceil(payload / pmax);
      var left = payload;
      for (var i = 0; i < count; i++) {
        var len = Math.min(pmax, left);
        left -= len;
        var seg = mk('div', 'sv-seg fc-' + (i % 8), (len / payload) > 0.085 ? String(len) : '');
        seg.style.flex = len + ' 1 0';
        seg.title = 'Fragment ' + (i + 1) + ': ' + len + ' bytes';
        bar.appendChild(seg);
      }
      headRight = count + ' fragments';
      footRight = 'Last: ' + (payload - (count - 1) * pmax) + ' B';
    }

    var head = mk('div', 'sv-head');
    var l = mk('span', '', 'Original payload '); l.appendChild(mk('b', '', payload + ' B'));
    var r = mk('span'); r.appendChild(mk('b', '', headRight));
    head.appendChild(l); head.appendChild(r);
    var foot = mk('div', 'sv-foot');
    foot.appendChild(mk('span', '', footLeft));
    foot.appendChild(mk('span', '', footRight));
    box.appendChild(head); box.appendChild(bar); box.appendChild(foot);
  }

  var previewBox = $('setup-preview');
  if (previewBox && window.MutationObserver) {
    // app.js rebuilds the preview on every input and every scenario load; follow it.
    new MutationObserver(renderFragmentMap).observe(previewBox, { childList: true });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#in-size, #in-mtu, input[name="header-len"], input[name="df"]'), function (input) {
    input.addEventListener('input', renderFragmentMap);
    input.addEventListener('change', renderFragmentMap);
  });
  renderFragmentMap();

  /* ───────── Previous / next pager ───────── */
  function navFor(section) {
    return navButtons.filter(function (b) { return b.getAttribute('data-section') === section; })[0];
  }
  navButtons.forEach(function (button, index) {
    var name = button.getAttribute('data-section');
    var section = $('sec-' + name);
    if (!section) return;
    var pager = mk('nav', 'pager');
    pager.setAttribute('aria-label', 'Previous and next section');
    function link(target, cls, hint) {
      var b = mk('button', cls);
      b.type = 'button';
      b.appendChild(mk('small', '', hint));
      b.appendChild(mk('strong', '', target.textContent.trim()));
      b.addEventListener('click', function () { target.click(); });
      return b;
    }
    if (index > 0) pager.appendChild(link(navButtons[index - 1], 'pager-prev', 'Previous'));
    if (index < navButtons.length - 1) pager.appendChild(link(navButtons[index + 1], 'pager-next', 'Next'));
    if (pager.children.length) section.appendChild(pager);
  });

  /* ───────── Command palette (Ctrl/Cmd + K or /) ───────── */
  var palette = mk('div', 'cmdk');
  palette.setAttribute('role', 'dialog');
  palette.setAttribute('aria-modal', 'true');
  palette.setAttribute('aria-label', 'Jump to a section');
  var panel = mk('div', 'cmdk-panel');
  var field = mk('input', 'cmdk-input');
  field.type = 'text';
  field.placeholder = 'Jump to a section or action…';
  field.setAttribute('aria-label', 'Search sections and actions');
  var list = mk('ul', 'cmdk-list');
  list.setAttribute('role', 'listbox');
  var foot = mk('div', 'cmdk-foot');
  foot.innerHTML = '<span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>';
  panel.appendChild(field); panel.appendChild(list); panel.appendChild(foot);
  palette.appendChild(panel);
  document.body.appendChild(palette);

  var items = [];
  var visible = [];
  var selected = 0;
  var returnFocus = null;

  navButtons.forEach(function (button, i) {
    items.push({ label: button.textContent.trim(), hint: 'Section ' + (i + 1), run: function () { button.click(); } });
  });
  if (settingsButton) items.push({ label: 'Settings', hint: '0', run: function () { settingsButton.click(); } });
  items.push({ label: 'Show or hide the sidebar', hint: 'B', run: function () { if (lab()) lab().toggleSidebar(); } });
  items.push({ label: 'Toggle light / dark theme', hint: 'D', run: function () { if (themeButton) themeButton.click(); } });

  function draw() {
    list.textContent = '';
    if (!visible.length) { list.appendChild(mk('li', 'cmdk-empty', 'Nothing matches that search.')); return; }
    visible.forEach(function (item, i) {
      var li = mk('li', i === selected ? 'sel' : '');
      li.setAttribute('role', 'option');
      li.appendChild(mk('span', '', item.label));
      li.appendChild(mk('small', '', item.hint));
      li.addEventListener('mousemove', function () { if (selected !== i) { selected = i; draw(); } });
      li.addEventListener('click', function () { choose(i); });
      list.appendChild(li);
    });
    var current = list.querySelector('.sel');
    if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
  }
  function filter() {
    var q = field.value.trim().toLowerCase();
    visible = items.filter(function (item) { return !q || item.label.toLowerCase().indexOf(q) !== -1; });
    selected = 0;
    draw();
  }
  function openPalette() {
    returnFocus = document.activeElement;
    palette.classList.add('open');
    field.value = '';
    filter();
    field.focus();
  }
  function closePalette() {
    palette.classList.remove('open');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }
  function choose(i) {
    var item = visible[i];
    if (!item) return;
    closePalette();
    item.run();
  }

  field.addEventListener('input', filter);
  field.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(visible.length - 1, selected + 1); draw(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(selected); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePalette(); }
    else if (event.key === 'Tab') { event.preventDefault(); }
  });
  palette.addEventListener('mousedown', function (event) { if (event.target === palette) closePalette(); });
  var openButton = $('cmdk-open');
  if (openButton) openButton.addEventListener('click', openPalette);

  /* ───────── Keyboard shortcuts ───────── */
  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.repeat) return;
    var key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault();
      if (palette.classList.contains('open')) closePalette(); else openPalette();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'b' && lab()) { event.preventDefault(); lab().toggleSidebar(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isEditing(event.target) || palette.classList.contains('open')) return;
    if (!shortcutsOn()) return;
    if (simulationVisible()) {
      var focused = document.activeElement;
      var onControl = focused && /^(BUTTON|A|SUMMARY)$/.test(focused.tagName);
      var press = function (id) { var b = $(id); if (b && !b.disabled) { b.click(); return true; } return false; };
      if (key === ' ' && !onControl) {                      // a focused button keeps its native Space behaviour
        event.preventDefault();
        if (!press('btn-sim-resume') && !press('btn-sim-pause')) press('btn-sim-start');
        return;
      }
      if (key === 'arrowright' && !onControl) { event.preventDefault(); press('btn-sim-step'); return; }
      if (key === 'r') { event.preventDefault(); press('btn-sim-reset'); return; }
    }
    if (key === 'd' && themeButton) { event.preventDefault(); themeButton.click(); }
    else if (key === '/') { event.preventDefault(); openPalette(); }
    else if (key === 'b' && lab()) { event.preventDefault(); lab().toggleSidebar(); }
    else if (key === '0' && settingsButton) { settingsButton.click(); }
    else if (/^[1-9]$/.test(key) && navButtons[Number(key) - 1]) { navButtons[Number(key) - 1].click(); }
  });
}());

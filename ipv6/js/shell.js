/* shell.js · Experiment 05 (IPv6): shared configuration store, theme, navigation, jump palette, pager.
 * It never changes calculations; those live in model.js. Uses the same theme key as Experiment 04. */
(function () {
  'use strict';
  var V6 = window.V6 = window.V6 || {};
  var root = document.documentElement;
  var CFG_KEY = 'dcn-vlab-ipv6-config-v27';
  var ID_KEY = 'dcn-vlab-ipv6-identification-v27';
  var THEME_KEY = 'dcn-vlab-theme';
  var DEFAULTS = { packetSize: 4000, mtu: 1500, speed: 1, nextHeader: 17, scenario: 0 };

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { v = Number(v); return Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min)); }

  /* ───────── Configuration shared by all pages ───────── */
  function normalise(c) {
    c = Object.assign({}, DEFAULTS, c || {});
    c.packetSize = clamp(c.packetSize, 40, 9000);
    c.mtu = clamp(c.mtu, 1280, 9000);
    var sp = Number(c.speed);
    c.speed = Number.isFinite(sp) ? Math.max(0.25, Math.min(3, Math.round(sp * 4) / 4)) : 1;
    c.nextHeader = [6, 17, 58].indexOf(Number(c.nextHeader)) !== -1 ? Number(c.nextHeader) : 17;
    c.scenario = clamp(c.scenario, 0, 6);
    return c;
  }
  var memory = null;
  V6.config = {
    defaults: DEFAULTS,
    clamp: clamp,
    read: function () {
      try { var x = JSON.parse(localStorage.getItem(CFG_KEY)); if (x) memory = x; } catch (e) { /* use memory / defaults */ }
      return normalise(memory);
    },
    save: function (c) {
      memory = normalise(c);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(memory)); } catch (e) { /* still works for this page view */ }
      return memory;
    }
  };

  /* One 32-bit Identification per run, shared by every fragment of that packet */
  function fmtId(n) { return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
  var idMemory = null;
  V6.newId = function () {
    var n = Math.floor(Math.random() * 0x100000000);
    idMemory = n >>> 0;
    try { localStorage.setItem(ID_KEY, fmtId(idMemory)); } catch (e) { /* ignore */ }
    return idMemory;
  };
  V6.getId = function () {
    try { var s = localStorage.getItem(ID_KEY); if (s && /^0x[0-9A-F]{8}$/i.test(s)) return parseInt(s, 16) >>> 0; } catch (e) { /* ignore */ }
    return idMemory !== null ? idMemory : V6.newId();
  };
  V6.fmtId = fmtId;

  /* ───────── Theme ───────── */
  var themeButton = $('theme-toggle');
  function readTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function applyTheme(theme, persist) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    if (themeButton) {
      var dark = next === 'dark', label = dark ? 'Switch to light mode' : 'Switch to dark mode';
      themeButton.setAttribute('aria-pressed', dark ? 'true' : 'false');
      themeButton.setAttribute('aria-label', label);
      themeButton.setAttribute('title', label + ' (D)');
      var sym = themeButton.querySelector('.theme-toggle-symbol'), lab = themeButton.querySelector('.theme-toggle-label');
      if (sym) sym.textContent = dark ? '☀' : '☾';
      if (lab) lab.textContent = dark ? 'Light mode' : 'Dark mode';
    }
    if (persist) { try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ } }
  }
  applyTheme(readTheme(), false);
  if (themeButton) themeButton.addEventListener('click', function () { applyTheme(readTheme() === 'dark' ? 'light' : 'dark', true); });

  /* ───────── Mobile menu ───────── */
  var app = $('app'), menuBtn = $('menu-toggle');
  function setMenu(open) { if (!app) return; app.classList.toggle('menu-open', open); if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(!app.classList.contains('menu-open')); });
  if (app) app.addEventListener('click', function (e) { if (e.target === app) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ───────── Reading progress ───────── */
  var fill = $('reading-progress-fill'), pending = false;
  function updateProgress() {
    pending = false;
    if (!fill) return;
    var d = document.documentElement, max = Math.max(1, d.scrollHeight - window.innerHeight);
    fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (window.scrollY || d.scrollTop) / max)) + ')';
  }
  window.addEventListener('scroll', function () { if (!pending) { pending = true; requestAnimationFrame(updateProgress); } }, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ───────── Navigation list, pager, jump palette ───────── */
  var pages = Array.prototype.slice.call(document.querySelectorAll('.nav-list a.nav-btn'))
    .map(function (a) { return { href: a.getAttribute('href'), name: a.textContent.replace('↗', '').trim(), index: a.dataset.index, active: a.classList.contains('active') }; });
  var core = pages.filter(function (p) { return p.index !== 'E4'; });
  var at = core.findIndex(function (p) { return p.active; });

  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  var section = document.querySelector('.lab-section.active');
  if (section && at !== -1) {
    var pager = mk('nav', 'pager'); pager.setAttribute('aria-label', 'Previous and next page');
    function link(p, cls, dir) { var a = mk('a', cls); a.href = p.href; a.appendChild(mk('small', '', dir)); a.appendChild(mk('strong', '', p.name)); return a; }
    if (at > 0) pager.appendChild(link(core[at - 1], 'pager-prev', 'Previous'));
    if (at < core.length - 1) pager.appendChild(link(core[at + 1], 'pager-next', 'Next'));
    if (pager.children.length) section.appendChild(pager);
  }

  var palette = mk('div', 'cmdk'); palette.setAttribute('role', 'dialog'); palette.setAttribute('aria-modal', 'true'); palette.setAttribute('aria-label', 'Jump to a page');
  var panel = mk('div', 'cmdk-panel');
  var field = mk('input', 'cmdk-input'); field.type = 'text'; field.placeholder = 'Jump to a page…'; field.setAttribute('aria-label', 'Search pages');
  var list = mk('ul', 'cmdk-list');
  var foot = mk('div', 'cmdk-foot'); foot.innerHTML = '<span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>';
  panel.appendChild(field); panel.appendChild(list); panel.appendChild(foot); palette.appendChild(panel); document.body.appendChild(palette);
  var visible = [], sel = 0;
  function renderList() {
    var q = field.value.trim().toLowerCase();
    visible = pages.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) !== -1; });
    sel = Math.min(sel, Math.max(0, visible.length - 1));
    list.textContent = '';
    if (!visible.length) { list.appendChild(mk('li', 'cmdk-empty', 'Nothing matches that search.')); return; }
    visible.forEach(function (p, i) {
      var li = mk('li', i === sel ? 'sel' : ''); li.appendChild(mk('span', '', p.name)); li.appendChild(mk('small', '', p.index === 'E4' ? 'IPv4 lab' : p.index));
      li.addEventListener('mousemove', function () { sel = i; renderList(); });
      li.addEventListener('click', function () { window.location.href = p.href; });
      list.appendChild(li);
    });
  }
  function openPalette() { palette.classList.add('open'); field.value = ''; sel = 0; renderList(); setTimeout(function () { field.focus(); }, 0); }
  function closePalette() { palette.classList.remove('open'); }
  palette.addEventListener('click', function (e) { if (e.target === palette) closePalette(); });
  field.addEventListener('input', function () { sel = 0; renderList(); });
  field.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(visible.length - 1, sel + 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); renderList(); }
    else if (e.key === 'Enter' && visible[sel]) { window.location.href = visible[sel].href; }
    else if (e.key === 'Escape') { closePalette(); }
  });
  var openBtn = $('cmdk-open');
  if (openBtn) openBtn.addEventListener('click', openPalette);

  function editing(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && palette.classList.contains('open')) { closePalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (editing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key.toLowerCase() === 'd') { applyTheme(readTheme() === 'dark' ? 'light' : 'dark', true); }
    else if (/^[1-8]$/.test(e.key) && core[Number(e.key) - 1]) { window.location.href = core[Number(e.key) - 1].href; }
  });

  /* ───────── Slider fill (same look as Experiment 04) ───────── */
  V6.paintRange = function (input) {
    if (!input) return;
    var min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value);
    input.style.setProperty('--pct', (max > min ? ((v - min) / (max - min)) * 100 : 0) + '%');
  };
  Array.prototype.forEach.call(document.querySelectorAll('input[type="range"]'), function (r) {
    V6.paintRange(r); r.addEventListener('input', function () { V6.paintRange(r); });
  });
}());

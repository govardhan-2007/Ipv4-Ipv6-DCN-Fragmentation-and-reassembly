/* shell.js · Experiment 05 (IPv6): settings store, theme, sidebar (expand / compact / hidden, collapsible
 * groups), progress tracking, jump palette, pager, toasts. It never changes calculations (see model.js). */
(function () {
  'use strict';
  var V6 = window.V6 = window.V6 || {};
  var root = document.documentElement;
  var CFG_KEY = 'dcn-vlab-ipv6-config-v27', ID_KEY = 'dcn-vlab-ipv6-identification-v27';
  var THEME_KEY = 'dcn-vlab-theme', SET_KEY = 'dcn-vlab-ipv6-settings-v1', PROG_KEY = 'dcn-vlab-ipv6-progress-v1';
  var DEFAULTS = { packetSize: 4000, mtu: 1500, speed: 1, nextHeader: 17, scenario: 0 };
  var MOBILE = '(max-width: 1020px)';

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { v = Number(v); return Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min)); }
  function pick(v, list, d) { return list.indexOf(v) !== -1 ? v : d; }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* page still works */ } }
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }

  /* ───────── Experiment configuration (packet size, MTU, protocol) ───────── */
  function normalise(c) {
    c = Object.assign({}, DEFAULTS, c || {});
    c.packetSize = clamp(c.packetSize, 40, 9000);
    c.mtu = clamp(c.mtu, 1280, 9000);
    c.nextHeader = [6, 17, 58].indexOf(Number(c.nextHeader)) !== -1 ? Number(c.nextHeader) : 17;
    c.scenario = clamp(c.scenario, 0, 6);
    c.speed = V6.settings ? V6.settings.get().speed : 1;
    return c;
  }
  var cfgMemory = null;
  V6.config = {
    defaults: DEFAULTS, clamp: clamp,
    read: function () { var x = load(CFG_KEY); if (x) cfgMemory = x; return normalise(cfgMemory); },
    save: function (c) { cfgMemory = normalise(c); store(CFG_KEY, cfgMemory); return cfgMemory; },
    reset: function () { cfgMemory = null; try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ } }
  };

  /* ───────── Settings ───────── */
  var SET_DEFAULTS = {
    theme: 'light', accent: 'green', text: 'medium', contrast: 'normal', motion: 'system',
    sidebar: 'expanded', groups: {}, rememberGroups: true, showCourse: true, showVoice: true,
    speed: 1, autoStart: false, showWorkings: true, showLog: true, pauseHidden: true, shortcuts: true,
    idFormat: 'hex', hopLimit: 64, timeout: 60
  };
  function normSettings(s) {
    s = Object.assign({}, SET_DEFAULTS, s || {});
    s.theme = pick(s.theme, ['light', 'dark', 'system'], 'light');
    s.accent = pick(s.accent, ['green', 'teal', 'blue', 'violet'], 'green');
    s.text = pick(s.text, ['small', 'medium', 'large'], 'medium');
    s.contrast = pick(s.contrast, ['normal', 'high'], 'normal');
    s.motion = pick(s.motion, ['system', 'on', 'off'], 'system');
    s.sidebar = pick(s.sidebar, ['expanded', 'compact', 'hidden'], 'expanded');
    s.groups = s.groups && typeof s.groups === 'object' ? s.groups : {};
    ['rememberGroups', 'showCourse', 'showVoice', 'autoStart', 'showWorkings', 'showLog', 'pauseHidden', 'shortcuts'].forEach(function (k) { s[k] = !!s[k]; });
    var sp = Number(s.speed); s.speed = Number.isFinite(sp) ? Math.max(0.25, Math.min(3, Math.round(sp * 4) / 4)) : 1;
    s.idFormat = pick(s.idFormat, ['hex', 'dec'], 'hex');
    s.hopLimit = pick(Number(s.hopLimit), [64, 128, 255], 64);
    s.timeout = clamp(s.timeout, 5, 120);
    return s;
  }
  var current = normSettings(load(SET_KEY)), listeners = [];
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var mqMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqMobile = window.matchMedia ? window.matchMedia(MOBILE) : { matches: false };

  function resolvedTheme() { return current.theme === 'system' ? (mqDark && mqDark.matches ? 'dark' : 'light') : current.theme; }
  function reduced() { return current.motion === 'on' || (current.motion === 'system' && !!(mqMotion && mqMotion.matches)); }

  function apply() {
    var theme = resolvedTheme();
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', current.accent);
    root.setAttribute('data-text', current.text);
    root.setAttribute('data-contrast', current.contrast);
    root.setAttribute('data-motion', reduced() ? 'reduce' : 'full');
    root.setAttribute('data-sidebar', current.sidebar);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
    document.body.classList.toggle('hide-course', !current.showCourse);
    document.body.classList.toggle('hide-voice', !current.showVoice);
    syncThemeButton(); syncSidebarButtons();
  }
  V6.settings = {
    defaults: SET_DEFAULTS,
    get: function () { return current; },
    set: function (patch) { current = normSettings(Object.assign({}, current, patch)); store(SET_KEY, current); apply(); listeners.forEach(function (f) { f(current, patch); }); return current; },
    reset: function () { current = normSettings(null); store(SET_KEY, current); apply(); listeners.forEach(function (f) { f(current, {}); }); },
    replace: function (obj) { current = normSettings(obj); store(SET_KEY, current); apply(); listeners.forEach(function (f) { f(current, {}); }); },
    onChange: function (fn) { listeners.push(fn); },
    reducedMotion: reduced
  };
  if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', function () { if (current.theme === 'system') apply(); });
  if (mqMotion && mqMotion.addEventListener) mqMotion.addEventListener('change', function () { if (current.motion === 'system') apply(); });

  /* One 32-bit Identification per run, shared by every fragment of that packet */
  function hex32(n) { return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
  var idMemory = null;
  V6.newId = function () { idMemory = Math.floor(Math.random() * 0x100000000) >>> 0; try { localStorage.setItem(ID_KEY, hex32(idMemory)); } catch (e) { /* ignore */ } return idMemory; };
  V6.getId = function () {
    try { var s = localStorage.getItem(ID_KEY); if (s && /^0x[0-9A-F]{8}$/i.test(s)) return parseInt(s, 16) >>> 0; } catch (e) { /* ignore */ }
    return idMemory !== null ? idMemory : V6.newId();
  };
  V6.fmtId = function (n) { return current.idFormat === 'dec' ? String(n >>> 0) : hex32(n); };

  /* ───────── Toast ───────── */
  var toastTimer = null;
  V6.toast = function (msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.hidden = true; }, 250); }, 2200);
  };

  /* ───────── Theme toggle ───────── */
  var themeButton = $('theme-toggle');
  function syncThemeButton() {
    if (!themeButton) return;
    var dark = resolvedTheme() === 'dark', label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    themeButton.setAttribute('aria-pressed', dark ? 'true' : 'false'); themeButton.setAttribute('aria-label', label); themeButton.setAttribute('title', label + ' (D)');
    var sym = themeButton.querySelector('.theme-toggle-symbol'), lab = themeButton.querySelector('.theme-toggle-label');
    if (sym) sym.textContent = dark ? '☀' : '☾'; if (lab) lab.textContent = dark ? 'Light mode' : 'Dark mode';
  }
  function toggleTheme() { V6.settings.set({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }); }
  if (themeButton) themeButton.addEventListener('click', toggleTheme);

  /* ───────── Sidebar: expanded / compact / hidden, plus mobile drawer ───────── */
  var app = $('app'), sidebar = $('sidebar'), menuBtn = $('menu-toggle'), sbToggle = $('sb-toggle'), sbCollapse = $('sb-collapse'), sbClose = $('sb-close');
  function isMobile() { return !!mqMobile.matches; }
  function setDrawer(open) { if (!app) return; app.classList.toggle('menu-open', open); if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); syncSidebarButtons(); }
  function sidebarVisible() { return isMobile() ? app.classList.contains('menu-open') : current.sidebar !== 'hidden'; }
  function syncSidebarButtons() {
    if (!sidebar) return;
    var vis = sidebarVisible();
    if (sbToggle) { sbToggle.setAttribute('aria-expanded', vis ? 'true' : 'false'); sbToggle.setAttribute('aria-label', vis ? 'Hide sidebar' : 'Show sidebar'); sbToggle.title = (vis ? 'Hide sidebar' : 'Show sidebar') + ' (B)'; }
    if (sbCollapse) { var compact = current.sidebar === 'compact'; sbCollapse.setAttribute('aria-expanded', compact ? 'false' : 'true'); sbCollapse.setAttribute('aria-label', compact ? 'Expand sidebar' : 'Collapse sidebar to icons'); sbCollapse.title = compact ? 'Expand sidebar' : 'Collapse sidebar'; sbCollapse.firstElementChild.textContent = compact ? '›' : '‹'; }
    if (!isMobile()) { sidebar.inert = current.sidebar === 'hidden'; } else { sidebar.inert = !app.classList.contains('menu-open'); }
  }
  function toggleSidebar() {
    if (isMobile()) { setDrawer(!app.classList.contains('menu-open')); return; }
    V6.settings.set({ sidebar: current.sidebar === 'hidden' ? 'expanded' : 'hidden' });
  }
  if (sbToggle) sbToggle.addEventListener('click', toggleSidebar);
  if (sbCollapse) sbCollapse.addEventListener('click', function () { V6.settings.set({ sidebar: current.sidebar === 'compact' ? 'expanded' : 'compact' }); });
  if (sbClose) sbClose.addEventListener('click', function () { setDrawer(false); });
  if (menuBtn) menuBtn.addEventListener('click', function () { setDrawer(!app.classList.contains('menu-open')); });
  if (app) app.addEventListener('click', function (e) { if (e.target === app) setDrawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', function () { setDrawer(false); syncSidebarButtons(); });

  /* ───────── Collapsible menu groups ───────── */
  var navList = $('nav-list');
  function groupItems(g) { return Array.prototype.filter.call(navList.children, function (li) { return li.dataset.group === g && !li.classList.contains('nav-group-head'); }); }
  function setGroup(g, open, persist) {
    var head = navList.querySelector('.nav-group-head[data-group="' + g + '"]'); if (!head) return;
    head.querySelector('.nav-toggle').setAttribute('aria-expanded', open ? 'true' : 'false'); head.classList.toggle('is-closed', !open);
    groupItems(g).forEach(function (li) { li.hidden = !open; });
    if (persist && current.rememberGroups) { var m = Object.assign({}, current.groups); if (open) delete m[g]; else m[g] = true; V6.settings.set({ groups: m }); }
  }
  if (navList) {
    var activeGroup = (navList.querySelector('.nav-btn.active') || {}).parentNode;
    activeGroup = activeGroup ? activeGroup.dataset.group : null;
    Array.prototype.forEach.call(navList.querySelectorAll('.nav-group-head'), function (head) {
      var g = head.dataset.group;
      if (current.rememberGroups && current.groups[g] && g !== activeGroup) setGroup(g, false, false);
      head.querySelector('.nav-toggle').addEventListener('click', function () { setGroup(g, head.classList.contains('is-closed'), true); });
    });
  }
  V6.expandGroups = function () { Array.prototype.forEach.call(navList.querySelectorAll('.nav-group-head'), function (h) { setGroup(h.dataset.group, true, false); }); V6.settings.set({ groups: {} }); };

  /* ───────── Progress tracking ───────── */
  var PAGES = ['index', 'theory', 'setup', 'simulation', 'headers', 'reassembly', 'results', 'quiz'];
  var PAGE_NAMES = { index: 'Overview', theory: 'Theory', setup: 'Setup', simulation: 'Simulation', headers: 'Headers', reassembly: 'Reassembly', results: 'Results', quiz: 'Quiz' };
  function progress() { var p = load(PROG_KEY) || {}; p.visited = p.visited || {}; return p; }
  V6.progress = {
    pages: PAGES, names: PAGE_NAMES, read: progress,
    saveQuiz: function (score, total) { var p = progress(); if (!p.quizBest || score / total > p.quizBest.score / p.quizBest.total) p.quizBest = { score: score, total: total }; store(PROG_KEY, p); },
    clear: function () { try { localStorage.removeItem(PROG_KEY); } catch (e) { /* ignore */ } }
  };
  (function trackProgress() {
    var page = document.body.dataset.page, p = progress();
    if (PAGES.indexOf(page) !== -1) { p.visited[page] = Date.now(); p.last = page; store(PROG_KEY, p); }
    var count = PAGES.filter(function (k) { return p.visited[k]; }).length;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn[href]'), function (a) {
      var k = a.getAttribute('href').replace('.html', ''); if (p.visited[k] && k !== page) a.classList.add('visited');
    });
    var t = $('sb-progress-title'), s = $('sb-progress-sub');
    if (t && count) { t.textContent = count === PAGES.length ? 'Experiment complete' : count + ' of ' + PAGES.length + ' pages visited'; if (s) s.textContent = p.quizBest ? 'Best quiz score ' + p.quizBest.score + '/' + p.quizBest.total : 'Keep going'; }
  }());

  /* ───────── Reading progress ───────── */
  var fill = $('reading-progress-fill'), pending = false;
  function updateProgress() { pending = false; if (!fill) return; var d = document.documentElement, max = Math.max(1, d.scrollHeight - window.innerHeight); fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (window.scrollY || d.scrollTop) / max)) + ')'; }
  window.addEventListener('scroll', function () { if (!pending) { pending = true; requestAnimationFrame(updateProgress); } }, { passive: true });
  window.addEventListener('resize', updateProgress); updateProgress();

  /* ───────── Pager and jump palette ───────── */
  var pages = Array.prototype.slice.call(document.querySelectorAll('.nav-list a.nav-btn')).map(function (a) { return { href: a.getAttribute('href'), name: a.title || a.textContent.replace('↗', '').trim(), index: a.dataset.index, active: a.classList.contains('active') }; });
  var core = pages.filter(function (q) { return q.index !== 'E4' && q.index !== '09'; });
  var at = core.findIndex(function (q) { return q.active; });
  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  var section = document.querySelector('.lab-section.active');
  if (section && at !== -1) {
    var pager = mk('nav', 'pager'); pager.setAttribute('aria-label', 'Previous and next page');
    var link = function (q, cls, dir) { var a = mk('a', cls); a.href = q.href; a.appendChild(mk('small', '', dir)); a.appendChild(mk('strong', '', q.name)); return a; };
    if (at > 0) pager.appendChild(link(core[at - 1], 'pager-prev', 'Previous'));
    if (at < core.length - 1) pager.appendChild(link(core[at + 1], 'pager-next', 'Next'));
    if (pager.children.length) section.appendChild(pager);
  }
  var palette = mk('div', 'cmdk'); palette.setAttribute('role', 'dialog'); palette.setAttribute('aria-modal', 'true'); palette.setAttribute('aria-label', 'Jump to a page');
  var panel = mk('div', 'cmdk-panel'), field = mk('input', 'cmdk-input'); field.type = 'text'; field.placeholder = 'Jump to a page…'; field.setAttribute('aria-label', 'Search pages');
  var list = mk('ul', 'cmdk-list'), foot = mk('div', 'cmdk-foot'); foot.innerHTML = '<span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>';
  panel.appendChild(field); panel.appendChild(list); panel.appendChild(foot); palette.appendChild(panel); document.body.appendChild(palette);
  var visible = [], sel = 0;
  function renderList() {
    var q = field.value.trim().toLowerCase();
    visible = pages.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) !== -1; });
    sel = Math.min(sel, Math.max(0, visible.length - 1)); list.textContent = '';
    if (!visible.length) { list.appendChild(mk('li', 'cmdk-empty', 'Nothing matches that search.')); return; }
    visible.forEach(function (p, i) {
      var li = mk('li', i === sel ? 'sel' : ''); li.appendChild(mk('span', '', p.name)); li.appendChild(mk('small', '', p.index === 'E4' ? 'IPv4 lab' : p.index));
      li.addEventListener('mousemove', function () { sel = i; renderList(); }); li.addEventListener('click', function () { window.location.href = p.href; }); list.appendChild(li);
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
  if ($('cmdk-open')) $('cmdk-open').addEventListener('click', openPalette);

  function editing(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && palette.classList.contains('open')) { closePalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); return; }
    if (!current.shortcuts || editing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (k === 'd') toggleTheme();
    else if (k === 'b') toggleSidebar();
    else if (/^[1-8]$/.test(e.key) && core[Number(e.key) - 1]) window.location.href = core[Number(e.key) - 1].href;
    else if (e.key === '9') window.location.href = 'settings.html';
  });

  /* ───────── Slider fill ───────── */
  V6.paintRange = function (input) { if (!input) return; var min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value); input.style.setProperty('--pct', (max > min ? ((v - min) / (max - min)) * 100 : 0) + '%'); };
  Array.prototype.forEach.call(document.querySelectorAll('input[type="range"]'), function (r) { V6.paintRange(r); r.addEventListener('input', function () { V6.paintRange(r); }); });

  /* Compact mode needs the page names as tooltips (already in title attributes) */
  apply();
}());

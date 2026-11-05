/* settings.js · Experiment 04 (IPv4): settings store, sidebar (expanded / compact / hidden, collapsible groups),
 * progress tracking and the Settings page. Mirrors the Experiment 05 (IPv6) settings tab.
 * It never changes fragmentation or reassembly calculations; app.js reads the protocol values it exposes. */
(function () {
  'use strict';
  var VLab = window.VLab = window.VLab || {};
  var root = document.documentElement;
  var THEME_KEY = 'dcn-vlab-theme', SET_KEY = 'dcn-vlab-ipv4-settings-v1', PROG_KEY = 'dcn-vlab-ipv4-progress-v1', PARAMS_KEY = 'vlab.params';
  var MOBILE = '(max-width: 1020px)';
  var PAGES = ['home', 'theory', 'setup', 'simulation', 'inspector', 'reassembly', 'results', 'quiz', 'resources'];
  var PAGE_NAMES = { home: 'Overview', theory: 'Theory', setup: 'Setup', simulation: 'Simulation', inspector: 'Inspector', reassembly: 'Reassembly', results: 'Results', quiz: 'Quiz', resources: 'Resources' };

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { v = Number(v); return Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min)); }
  function pick(v, list, d) { return list.indexOf(v) !== -1 ? v : d; }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* the page still works without storage */ } }
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }

  /* ───────── Settings ───────── */
  var DEFAULTS = {
    theme: 'light', accent: 'indigo', text: 'medium', contrast: 'normal', motion: 'system',
    sidebar: 'expanded', groups: {}, rememberGroups: true, showCourse: true, showVoice: true,
    speed: 1, autoStart: true, showWorkings: true, showLog: true, pauseHidden: true, shortcuts: true,
    idFormat: 'dec', ttl: 64, timeout: 15
  };
  function normalise(s) {
    s = Object.assign({}, DEFAULTS, s || {});
    s.theme = pick(s.theme, ['light', 'dark', 'system'], 'light');
    s.accent = pick(s.accent, ['indigo', 'teal', 'green', 'violet'], 'indigo');
    s.text = pick(s.text, ['small', 'medium', 'large'], 'medium');
    s.contrast = pick(s.contrast, ['normal', 'high'], 'normal');
    s.motion = pick(s.motion, ['system', 'on', 'off'], 'system');
    s.sidebar = pick(s.sidebar, ['expanded', 'compact', 'hidden'], 'expanded');
    s.groups = s.groups && typeof s.groups === 'object' ? s.groups : {};
    ['rememberGroups', 'showCourse', 'showVoice', 'autoStart', 'showWorkings', 'showLog', 'pauseHidden', 'shortcuts'].forEach(function (k) { s[k] = !!s[k]; });
    var sp = Number(s.speed); s.speed = Number.isFinite(sp) ? Math.max(0.25, Math.min(3, Math.round(sp * 4) / 4)) : 1;
    s.idFormat = pick(s.idFormat, ['dec', 'hex'], 'dec');
    s.ttl = pick(Number(s.ttl), [64, 128, 255], 64);
    s.timeout = clamp(s.timeout, 5, 120);
    return s;
  }
  var current = normalise(load(SET_KEY)), listeners = [];
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
    document.body.classList.toggle('hide-workings', !current.showWorkings);
    document.body.classList.toggle('hide-log', !current.showLog);
    syncThemeButton(); syncSidebarButtons();
  }
  function notify(patch) { listeners.forEach(function (f) { f(current, patch || {}); }); }
  var S = VLab.Settings = {
    defaults: DEFAULTS,
    get: function () { return current; },
    set: function (patch) { current = normalise(Object.assign({}, current, patch)); store(SET_KEY, current); apply(); notify(patch); return current; },
    reset: function () { current = normalise(null); store(SET_KEY, current); apply(); notify({}); },
    replace: function (obj) { current = normalise(obj); store(SET_KEY, current); apply(); notify({}); },
    onChange: function (fn) { listeners.push(fn); },
    reducedMotion: reduced
  };
  if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', function () { if (current.theme === 'system') apply(); });
  if (mqMotion && mqMotion.addEventListener) mqMotion.addEventListener('change', function () { if (current.motion === 'system') apply(); });

  /* Identification is 16 bits in IPv4 */
  S.fmtId = function (n) {
    n = Number(n);
    return current.idFormat === 'hex' ? '0x' + ('0000' + (n >>> 0).toString(16).toUpperCase()).slice(-4) : String(n);
  };

  /* ───────── Toast ───────── */
  var toastTimer = null;
  S.toast = function (msg) {
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
    if (sym) sym.textContent = dark ? '☀' : '☾';
    if (lab) lab.textContent = dark ? 'Light mode' : 'Dark mode';
  }
  S.toggleTheme = function () { S.set({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }); };

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
    if (!isMobile()) sidebar.inert = current.sidebar === 'hidden'; else sidebar.inert = !app.classList.contains('menu-open');
  }
  S.toggleSidebar = function () {
    if (isMobile()) { setDrawer(!app.classList.contains('menu-open')); return; }
    S.set({ sidebar: current.sidebar === 'hidden' ? 'expanded' : 'hidden' });
  };
  if (sbToggle) sbToggle.addEventListener('click', S.toggleSidebar);
  if (sbCollapse) sbCollapse.addEventListener('click', function () { S.set({ sidebar: current.sidebar === 'compact' ? 'expanded' : 'compact' }); });
  if (sbClose) sbClose.addEventListener('click', function () { setDrawer(false); });
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', function () { setDrawer(false); syncSidebarButtons(); });
  /* app.js owns the Menu button and Escape; keep the inert flag and button state in step with it */
  if (menuBtn) menuBtn.addEventListener('click', function () { setTimeout(syncSidebarButtons, 0); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setTimeout(syncSidebarButtons, 0); });
  if (app) app.addEventListener('click', function (e) { if (e.target === app) setDrawer(false); });
  if (app && window.MutationObserver) new MutationObserver(syncSidebarButtons).observe(app, { attributes: true, attributeFilter: ['class'] });

  /* ───────── Collapsible menu groups ───────── */
  var navList = $('nav-list');
  function groupItems(g) { return Array.prototype.filter.call(navList.children, function (li) { return li.dataset.group === g && !li.classList.contains('nav-group-head'); }); }
  function setGroup(g, open, persist) {
    var head = navList.querySelector('.nav-group-head[data-group="' + g + '"]'); if (!head) return;
    head.querySelector('.nav-toggle').setAttribute('aria-expanded', open ? 'true' : 'false'); head.classList.toggle('is-closed', !open);
    groupItems(g).forEach(function (li) { li.hidden = !open; });
    if (persist && current.rememberGroups) { var m = Object.assign({}, current.groups); if (open) delete m[g]; else m[g] = true; S.set({ groups: m }); }
  }
  function activeGroup() { var a = navList && navList.querySelector('.nav-btn.active'); return a && a.parentNode ? a.parentNode.dataset.group : null; }
  if (navList) {
    Array.prototype.forEach.call(navList.querySelectorAll('.nav-group-head'), function (head) {
      var g = head.dataset.group;
      if (current.rememberGroups && current.groups[g] && g !== activeGroup()) setGroup(g, false, false);
      head.querySelector('.nav-toggle').addEventListener('click', function () { setGroup(g, head.classList.contains('is-closed'), true); });
    });
  }
  S.expandGroups = function () { Array.prototype.forEach.call(navList.querySelectorAll('.nav-group-head'), function (h) { setGroup(h.dataset.group, true, false); }); S.set({ groups: {} }); };

  /* ───────── Progress tracking (visited pages, best quiz score) ───────── */
  function progress() { var p = load(PROG_KEY) || {}; p.visited = p.visited || {}; return p; }
  function paintProgress() {
    var p = progress(), active = document.querySelector('.lab-section.active'), page = active ? active.id.replace('sec-', '') : '';
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn[data-section]'), function (b) {
      var k = b.getAttribute('data-section'); b.classList.toggle('visited', !!p.visited[k] && k !== page);
    });
    var count = PAGES.filter(function (k) { return p.visited[k]; }).length, t = $('sb-progress-title'), s = $('sb-progress-sub');
    if (!t) return;
    if (count) {
      t.textContent = count === PAGES.length ? 'Experiment complete' : count + ' of ' + PAGES.length + ' pages visited';
      if (s) s.textContent = p.quizBest ? 'Best quiz score ' + p.quizBest.score + '/' + p.quizBest.total : 'Keep going';
    } else { t.textContent = 'Ready for self-study'; if (s) s.textContent = 'Runs in a modern browser'; }
  }
  S.progress = { pages: PAGES, names: PAGE_NAMES, read: progress, clear: function () { try { localStorage.removeItem(PROG_KEY); } catch (e) { /* ignore */ } paintProgress(); } };
  S.saveQuiz = function (score, total) {
    var p = progress(); if (!p.quizBest || score / total > p.quizBest.score / p.quizBest.total) p.quizBest = { score: score, total: total };
    store(PROG_KEY, p); paintProgress();
  };
  /* Called by app.js whenever a section is shown */
  S.visit = function (name) {
    var p = progress();
    if (PAGES.indexOf(name) !== -1) { p.visited[name] = Date.now(); p.last = name; store(PROG_KEY, p); }
    var g = activeGroup(); if (g) setGroup(g, true, false);   // never leave the open page inside a closed group
    paintProgress();
  };

  /* ───────── Settings page ───────── */
  function initSettingsPage() {
    var page = $('sec-settings'); if (!page) return;
    function value(key) { var s = S.get(); return key === 'contrastHigh' ? s.contrast === 'high' : s[key]; }
    function write(key, v) {
      var o = {};
      if (key === 'contrastHigh') o.contrast = v ? 'high' : 'normal'; else o[key] = v;
      S.set(o);
    }
    function paintRange(el) { var min = Number(el.min || 0), max = Number(el.max || 100); el.style.setProperty('--pct', (max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0) + '%'); }
    function sync() {
      Array.prototype.forEach.call(page.querySelectorAll('[data-setting]'), function (el) {
        var key = el.dataset.setting, v = value(key);
        if (el.classList.contains('seg') || el.classList.contains('swatches')) Array.prototype.forEach.call(el.querySelectorAll('[role="radio"]'), function (b) { b.setAttribute('aria-checked', String(b.dataset.value) === String(v) ? 'true' : 'false'); });
        else if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'range') { el.value = v; paintRange(el); var out = $('out-speed'); if (out) out.textContent = v + '×'; }
        else el.value = v;
      });
    }
    Array.prototype.forEach.call(page.querySelectorAll('.seg, .swatches'), function (g) {
      Array.prototype.forEach.call(g.querySelectorAll('[role="radio"]'), function (b) {
        b.addEventListener('click', function () { var v = b.dataset.value; write(g.dataset.setting, /^\d+$/.test(v) ? Number(v) : v); sync(); });
      });
      g.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var items = Array.prototype.slice.call(g.querySelectorAll('[role="radio"]')), i = items.findIndex(function (x) { return x.getAttribute('aria-checked') === 'true'; });
        i = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length; items[i].click(); items[i].focus(); e.preventDefault();
      });
    });
    Array.prototype.forEach.call(page.querySelectorAll('input[data-setting]'), function (el) {
      el.addEventListener(el.type === 'number' ? 'change' : 'input', function () {
        write(el.dataset.setting, el.type === 'checkbox' ? el.checked : Number(el.value)); sync();
      });
    });
    S.onChange(sync);   // the simulation speed slider and the header toggle also change settings
    $('btn-expand-groups').addEventListener('click', function () { S.expandGroups(); S.toast('All menu groups opened'); });
    $('btn-export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(S.get(), null, 2)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'dcn-vlab-ipv4-settings.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 500); S.toast('Settings exported');
    });
    $('file-import').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { try { var o = JSON.parse(rd.result); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('bad'); S.replace(o); sync(); S.toast('Settings imported'); } catch (x) { S.toast('That file is not a settings export'); } };
      rd.readAsText(f); e.target.value = '';
    });
    $('btn-reset-config').addEventListener('click', function () {
      if (VLab.App && VLab.App.resetParams) VLab.App.resetParams();
      else { try { localStorage.removeItem(PARAMS_KEY); } catch (e) { /* ignore */ } }
      S.toast('Experiment values reset to 4000 B / 1500 B');
    });
    $('btn-reset-progress').addEventListener('click', function () { S.progress.clear(); S.toast('Progress cleared'); });
    $('btn-reset-all').addEventListener('click', function () { if (window.confirm('Reset every setting to its default?')) { S.reset(); sync(); S.toast('All settings reset'); } });
    sync();
  }

  /* Keep the simulation speed slider and the settings in step */
  S.onChange(function (s, patch) {
    var slider = $('sim-speed');
    if (patch && 'speed' in patch || !patch || !Object.keys(patch).length) {
      if (slider && Number(slider.value) !== s.speed) { slider.value = s.speed; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });

  apply();
  initSettingsPage();
  S.visit((document.querySelector('.lab-section.active') || { id: 'sec-home' }).id.replace('sec-', ''));
}());

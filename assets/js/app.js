/* Shell: navigation, hash routing, the clock, and first-run setup. */
window.DX = window.DX || {};

DX.app = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;

  var ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    collection: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l-1 3H9L8 3z"/><path d="M7 6h10l1.2 13a2 2 0 0 1-2 2.2H7.8a2 2 0 0 1-2-2.2L7 6z"/><path d="M9 13h6"/></svg>',
    suppliers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.5 6.2a3 3 0 0 1 0 5.6"/><path d="M18 20a5.6 5.6 0 0 0-2.2-4.5"/></svg>',
    advances: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/></svg>',
    payments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8V6.5A1.5 1.5 0 0 0 18.5 5H5a2 2 0 0 0 0 4h14a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 19H5a2 2 0 0 1-2-2V7"/><circle cx="16.5" cy="14" r="1.3"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="12" width="3" height="5" rx="1"/><rect x="13" y="8" width="3" height="9" rx="1"/><rect x="18" y="14" width="2.5" height="3" rx="1"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>'
  };

  var ROUTES = [
    { path: 'dashboard', label: 'Dashboard', short: 'Home', page: 'dashboard' },
    { path: 'collection', label: 'Daily entry', short: 'Entry', page: 'collection' },
    { path: 'suppliers', label: 'Suppliers', short: 'People', page: 'suppliers' },
    { path: 'advances', label: 'Advances', short: 'Advances', page: 'advances' },
    { path: 'payments', label: 'Payments', short: 'Pay', page: 'payments' },
    { path: 'reports', label: 'Reports', short: 'Reports', page: 'reports' }
  ];

  var view, titleNode, subtitleNode, clockNode, navNodes = [];

  function currentPath() {
    var hash = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.concat([{ path: 'settings' }]).some(function (r) { return r.path === hash; }) ? hash : 'dashboard';
  }

  function pageFor(path) {
    return DX.pages[path === 'settings' ? 'settings' : (ROUTES.filter(function (r) { return r.path === path; })[0] || {}).page];
  }

  function buildNav() {
    var nav = document.getElementById('nav');
    var tabs = document.getElementById('tabbar');
    util.clear(nav); util.clear(tabs);
    navNodes = [];

    ROUTES.concat([{ path: 'settings', label: 'Settings', short: 'Setup' }]).forEach(function (route) {
      var link = util.el('a', { href: '#/' + route.path }, [
        util.el('span', { html: ICONS[route.path] }),
        route.label
      ]);
      link.dataset.path = route.path;
      nav.appendChild(link);
      navNodes.push(link);

      var tab = util.el('a', { href: '#/' + route.path, 'aria-label': route.label }, [
        util.el('span', { html: ICONS[route.path] }),
        route.short
      ]);
      tab.dataset.path = route.path;
      tabs.appendChild(tab);
      navNodes.push(tab);
    });
  }

  function markActive(path) {
    navNodes.forEach(function (node) {
      if (node.dataset.path === path) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
  }

  /* Painting the clock must never change the shift: applyShift emits 'shift',
     which repaints the clock, which would call applyShift again. */
  function paintClock() {
    if (!clockNode) return;
    clockNode.textContent = util.clockLabel() + ' · ' + store.state.shift + ' round' +
      (store.state.shiftIsAuto ? '' : ' · set by hand');
  }

  function tickClock() {
    if (store.state.shiftIsAuto) store.autoShift();
    paintClock();
  }

  function renderRoute() {
    var path = currentPath();
    var page = pageFor(path);
    markActive(path);
    DX.charts.hideTip();

    if (!page) { location.hash = '#/dashboard'; return; }

    titleNode.textContent = page.title;
    subtitleNode.textContent = typeof page.subtitle === 'function' ? page.subtitle() : (page.subtitle || '');

    if (path !== 'settings' && !store.state.ready) {
      util.clear(view);
      view.appendChild(util.el('div.card', [util.el('div.card__body', [
        util.el('div.skeleton', { style: 'height:22px;width:40%;margin-bottom:12px' }),
        util.el('div.skeleton', { style: 'height:120px' })
      ])]));
      return;
    }

    if (page.reset) page.reset();
    util.clear(view);
    try {
      page.render(view);
    } catch (err) {
      console.error(err);
      util.clear(view);
      view.appendChild(ui.empty('This page could not be drawn', err.message || String(err),
        util.el('button.btn', { type: 'button', onclick: function () { renderRoute(); } }, 'Try again')));
    }
  }

  /* ---------------------------------------------------------------- *
   * First run
   * ---------------------------------------------------------------- */
  function showWelcome() {
    document.getElementById('shell').hidden = true;
    var host = document.getElementById('welcome');
    host.hidden = false;
    util.clear(host);

    var urlField = ui.field({
      label: 'Apps Script web-app link', name: 'apiUrl',
      placeholder: 'https://script.google.com/macros/s/…/exec',
      hint: 'Copy it from Deploy → Manage deployments in the Apps Script editor.'
    });
    var connectBtn = util.el('button.btn.btn--primary.btn--block', { type: 'submit' }, 'Connect this device');
    var form = util.el('form', { novalidate: true }, [urlField, util.el('div.form-actions', [connectBtn])]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var url = urlField.control.value.trim();
      if (!DX.config.looksValid(url)) {
        ui.setFieldError(urlField.control, 'The link should start with https://script.google.com/macros/s/ and end in /exec.');
        return;
      }
      DX.config.set(url);
      ui.busy(connectBtn, true, 'Connecting…');
      DX.api.ping().then(function () {
        location.reload();
      }).catch(function (err) {
        DX.config.clear();
        ui.reportError(err, form);
        ui.busy(connectBtn, false);
      });
    });

    host.appendChild(util.el('div.setup', [
      util.el('div.card', [
        util.el('div.card__head', [
          util.el('h1', 'Connect to your milk register'),
          util.el('p', 'One link, once per phone.')
        ]),
        util.el('div.card__body', [
          util.el('ol', [
            util.el('li', [util.el('b', 'Create the sheet.'), ' A blank Google Sheet, named however you like.']),
            util.el('li', [util.el('b', 'Add the script.'), ' Extensions → Apps Script, paste in Code.gs from this repo, save.']),
            util.el('li', [util.el('b', 'Build the tabs.'), ' Run ', util.el('code', 'setup'), ' once and approve the permission prompt.']),
            util.el('li', [util.el('b', 'Deploy it.'), ' Deploy → New deployment → Web app. Execute as ', util.el('code', 'Me'), ', access ', util.el('code', 'Anyone'), '.']),
            util.el('li', [util.el('b', 'Paste the link below.'), ' It ends in ', util.el('code', '/exec'), '.'])
          ]),
          form
        ]),
        util.el('div.card__foot', 'The full walkthrough is in docs/SETUP.md in this repository.')
      ])
    ]));
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */
  function start() {
    view = document.getElementById('view');
    titleNode = document.getElementById('page-title');
    subtitleNode = document.getElementById('page-subtitle');
    clockNode = document.getElementById('clock-label');

    document.body.dataset.shift = util.detectShift(12);

    if (!DX.config.get()) { showWelcome(); return; }

    buildNav();
    window.addEventListener('hashchange', renderRoute);

    document.getElementById('refresh').addEventListener('click', function () {
      var btn = this;
      ui.busy(btn, true, 'Refreshing…');
      store.refresh().then(function () {
        renderRoute();
        ui.say.ok('Up to date', 'Read straight from the sheet.');
      }).then(function () { ui.busy(btn, false); });
    });

    store.on('shift', paintClock);
    setInterval(tickClock, 60000);

    if (!location.hash) location.hash = '#/dashboard';
    renderRoute();
    tickClock();

    store.load().then(function () {
      document.getElementById('brand-name').textContent = store.businessName();
      renderRoute();
      tickClock();
    }).catch(function (err) {
      util.clear(view);
      view.appendChild(util.el('div.banner.banner--error', [
        util.el('div.banner__body', [
          util.el('strong', ui.explain(err).title),
          util.el('p', { text: ui.explain(err).detail, style: 'margin:2px 0 10px' }),
          util.el('a.btn.btn--sm', { href: '#/settings' }, 'Open Settings')
        ])
      ]));
    });
  }

  return { start: start, renderRoute: function () { renderRoute(); } };
})();

document.addEventListener('DOMContentLoaded', DX.app.start);

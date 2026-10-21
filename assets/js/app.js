/* The shell: navigation, routing, the sync pill, language and appearance.
 *
 * Every page draw gets a "ticket". When you move to another page the old
 * ticket is torn up, so anything the old page was still waiting for can never
 * draw itself over the new one. (That was the "tap Home, see the entry form"
 * bug.) Sub-views such as Suppliers/Customers live in the address, so the
 * page you tap is always the page you get.
 */
window.DX = window.DX || {};

DX.theme = (function () {
  var KEY = 'dakotax.theme';
  var VALUES = ['system', 'light', 'dark'];

  function get() {
    var stored = DX.util.storageGet(KEY);
    return VALUES.indexOf(stored) > -1 ? stored : 'system';
  }

  function apply(choice) {
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1720' : '#0b6b5f');
  }

  function set(choice) {
    if (VALUES.indexOf(choice) < 0) choice = 'system';
    DX.util.storageSet(KEY, choice);
    apply(choice);
    return choice;
  }

  return { get: get, set: set, apply: apply, values: VALUES };
})();

DX.app = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }

  var ROUTES = [
    { path: 'home', page: 'home', icon: 'home', label: 'Home', tab: true },
    { path: 'in', page: 'milkin', icon: 'in', label: 'Milk In', tab: true, tone: 'in', tabTa: 'வரவு' },
    { path: 'out', page: 'milkout', icon: 'out', label: 'Milk Out', tab: true, tone: 'out', tabTa: 'விற்பனை' },
    { path: 'people', page: 'people', icon: 'people', label: 'People', tab: true },
    { path: 'pay', page: 'pay', icon: 'pay', label: 'Pay supplier', more: true, desc: 'Settle a supplier’s milk bill' },
    { path: 'collect', page: 'collect', icon: 'collect', label: 'Collect money', more: true, desc: 'Money received from a customer' },
    { path: 'advances', page: 'advances', icon: 'advance', label: 'Advances', more: true, desc: 'Money given to a supplier before the bill' },
    { path: 'reports', page: 'reports', icon: 'reports', label: 'Reports', more: true, desc: 'Totals for any dates, and CSV files' },
    { path: 'settings', page: 'settings', icon: 'settings', label: 'Settings', more: true, desc: 'Rates, language, appearance, sheet link' }
  ];

  /* Old links keep working. */
  var ALIASES = {
    '': 'home', dashboard: 'home', entry: 'in', collection: 'in', 'entry/in': 'in', 'entry/out': 'out', sales: 'out',
    suppliers: 'people/suppliers', customers: 'people/customers',
    money: 'pay', payments: 'pay', 'money/pay': 'pay', 'money/collect': 'collect', receipts: 'collect'
  };

  var SYNC_ON_VISIT = { home: 1, people: 1, pay: 1, collect: 1, advances: 1, reports: 1 };

  var view, titleNode, subNode, pillNode, langNode, railNode, tabNode;
  var current = { token: 0, ctx: null, path: null };

  function routeFor(path) {
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].path === path) return ROUTES[i];
    return null;
  }

  function parseHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
    if (Object.prototype.hasOwnProperty.call(ALIASES, raw)) raw = ALIASES[raw];
    var parts = raw.split('/');
    var route = routeFor(parts[0]);
    if (!route) return { route: routeFor('home'), sub: '', unknown: !!raw };
    return { route: route, sub: parts.slice(1).join('/') };
  }

  /** Go to a page. Works even when you are already on it. */
  function go(path) {
    var target = '#/' + path;
    if (location.hash === target) renderRoute();
    else location.hash = target;
  }

  /* ------------------------------------------------------------------ *
   * Shell
   * ------------------------------------------------------------------ */
  function navLink(route, compact) {
    // Tamil words are long; the bottom tabs use the short form next to the icon.
    var label = compact && route.tabTa && DX.i18n.get() === 'ta' ? route.tabTa : t(route.label);
    var a = el('a.nav__link' + (route.tone ? '.tone-' + route.tone : ''), { href: '#/' + route.path, 'aria-label': t(route.label) }, [
      el('span.nav__icon', ui.icon(route.icon)),
      el('span.nav__label', { text: label })
    ]);
    a.dataset.path = route.path;
    if (compact) a.classList.add('tab');
    return a;
  }

  function buildShell() {
    util.clear(railNode);
    railNode.appendChild(el('div.brand', [
      el('span.brand__mark', { 'aria-hidden': 'true' }, ui.icon('in')),
      el('span.brand__text', [el('b#brand-name', { text: store.businessName() }), el('small', { text: t('Milk register') })])
    ]));
    railNode.appendChild(el('nav.rail__nav', { 'aria-label': t('Pages') }, ROUTES.map(function (r) { return navLink(r); })));

    util.clear(tabNode);
    ROUTES.filter(function (r) { return r.tab; }).forEach(function (r) { tabNode.appendChild(navLink(r, true)); });
    var moreBtn = el('button.nav__link.tab.tab--more', { type: 'button', onclick: openMore, 'aria-haspopup': 'dialog' }, [
      el('span.nav__icon', ui.icon('grid')),
      el('span.nav__label', { text: t('More') })
    ]);
    moreBtn.dataset.path = 'more';
    tabNode.appendChild(moreBtn);

    paintLang();
    paintPill();
  }

  function paintNav(route) {
    document.querySelectorAll('.nav__link').forEach(function (node) {
      var on = node.dataset.path === route.path || (node.dataset.path === 'more' && route.more);
      if (on) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    });
    document.body.dataset.route = route.path;
  }

  function paintTitle(route, ctx) {
    var page = DX.pages[route.page];
    var title = page && page.title ? page.title(ctx) : t(route.label);
    var sub = page && page.subtitle ? page.subtitle(ctx) : '';
    titleNode.textContent = title;
    subNode.textContent = sub || '';
    subNode.hidden = !sub;
    document.title = title + ' · ' + store.businessName();
  }

  function paintLang() {
    var ta = DX.i18n.get() === 'ta';
    util.clear(langNode);
    langNode.appendChild(el('span', { text: ta ? 'EN' : 'த' }));
    langNode.setAttribute('aria-label', ta ? 'Switch to English' : 'தமிழுக்கு மாற்று');
    langNode.title = ta ? 'English' : 'தமிழ்';
  }

  function setLanguage(lang) {
    DX.i18n.set(lang);
    buildShell();
    renderRoute({ keepScroll: true });
    ui.say.ok(lang === 'ta' ? 'தமிழ்' : 'English', lang === 'ta' ? 'திரை தமிழில் காட்டப்படுகிறது.' : 'Screens are now in English.');
  }

  function paintPill() {
    if (!pillNode) return;
    var s = store.status();
    var tone, glyph, text, spin = false;
    if (s.failed) { tone = 'error'; glyph = 'alert'; text = t('{n} not saved', { n: s.failed }); }
    else if (s.pending && s.offline) { tone = 'warn'; glyph = 'cloudOff'; text = t('Offline · {n} waiting', { n: s.pending }); }
    else if (s.pending) { tone = 'busy'; spin = true; text = t('Sending {n}…', { n: s.pending }); }
    else if (s.syncing) { tone = 'busy'; spin = true; text = t('Updating…'); }
    else if (s.syncError) { tone = 'warn'; glyph = 'cloudOff'; text = t('Offline'); }
    else if (s.lastSync) { tone = 'ok'; glyph = 'check'; text = t('Saved'); }
    else { tone = 'busy'; spin = true; text = t('Loading…'); }
    util.clear(pillNode);
    pillNode.className = 'pill pill--' + tone;
    pillNode.appendChild(spin ? el('span.spinner', { 'aria-hidden': 'true' }) : ui.icon(glyph));
    pillNode.appendChild(el('span.pill__text', { text: text }));
    var when = s.lastSync ? t('Last updated {time}', { time: util.clockLabel(new Date(s.lastSync)) }) : '';
    pillNode.title = [text, when].filter(Boolean).join(' · ');
    pillNode.setAttribute('aria-label', pillNode.title);
  }

  function onPill() {
    var s = store.status();
    if (s.failed || s.pending) { openQueue(); return; }
    store.sync().then(function (ok) {
      if (ok) ui.say.ok(t('Up to date'), t('Read fresh from the sheet.'));
      else ui.reportError(store.status().syncError);
    });
  }

  /** The list of saves still on this phone: waiting, or refused by the sheet. */
  function openQueue() {
    var items = store.queue();
    var body = el('div.queue');
    function describe(item) {
      var spec = store.spec(item.kind);
      var d = item.data || item.prev || {};
      var who = '';
      if (spec.person) who = d.name || item.ref;
      else {
        var p = store.person(spec.partyList === 'customers' ? 'customer' : 'supplier', d[spec.party]);
        who = p ? p.name : (d[spec.partyName] || d[spec.party] || '');
      }
      var what = {
        collection: t('Milk In'), sale: t('Milk Out'), advance: t('Advance'), payment: t('Payment'),
        receipt: t('Money received'), supplier: t('Supplier'), customer: t('Customer')
      }[item.kind];
      var verb = item.op === 'delete' ? t('Delete') : item.op === 'status' ? t('Status') : (item.isNew ? t('New') : t('Change'));
      var bits = [];
      if (d.date) bits.push(util.fmtDate(d.date, 'short'));
      if (d.shift) bits.push(t(d.shift));
      if (d.litres) bits.push(util.fmtLitres(d.litres));
      if (d.amount) bits.push(store.money(d.amount));
      return { title: what + ' · ' + who, sub: verb + (bits.length ? ' · ' + bits.join(' · ') : '') };
    }
    function draw() {
      util.clear(body);
      items = store.queue();
      if (!items.length) { body.appendChild(ui.empty(t('Everything is saved'), t('Nothing is waiting on this phone.'), null, 'check')); return; }
      items.forEach(function (item) {
        var info = describe(item);
        var failed = item.status === 'failed';
        body.appendChild(el('div.queue__item' + (failed ? '.queue__item--failed' : ''), [
          el('div.queue__text', [
            el('b', { text: info.title }),
            el('small', { text: info.sub }),
            failed ? el('p.queue__error', { text: item.error ? item.error.message : t('Not saved') }) : el('p.queue__wait', { text: item.status === 'sending' ? t('Sending…') : t('Waiting to send') })
          ]),
          failed ? el('div.queue__actions', [
            el('button.btn.btn--sm', { type: 'button', onclick: function () { store.retry(item.qid); draw(); } }, t('Try again')),
            el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { store.discard(item.qid); draw(); } }, t('Remove'))
          ]) : null
        ]));
      });
    }
    draw();
    var off = store.on('change', draw);
    ui.sheet({
      title: t('Saves on this phone'),
      content: [
        el('p.sheet__message', { text: t('Entries are kept on this phone until the sheet confirms them. Waiting ones are sent by themselves when there is signal.') }),
        body
      ],
      footer: [el('button.btn.btn--primary', { type: 'button', onclick: function () { store.kick(); } }, [ui.icon('refresh'), el('span', { text: t('Send now') })])],
      onClose: off
    });
  }

  function openMore() {
    var s = ui.sheet({
      title: t('More'),
      content: [
        el('div.morelist', ROUTES.filter(function (r) { return r.more; }).map(function (r) {
          return el('button.morelist__item' + (current.path === r.path ? '.is-on' : ''), {
            type: 'button', onclick: function () { s.close(function () { go(r.path); }); }
          }, [
            el('span.morelist__icon', ui.icon(r.icon)),
            el('span.morelist__text', [el('b', { text: t(r.label) }), el('small', { text: t(r.desc) })]),
            ui.icon('right', 'morelist__chev')
          ]);
        })),
        el('div.more-quick', [
          ui.choice({
            label: t('Language'), name: 'more-lang', value: DX.i18n.get(), columns: 2, compact: true,
            options: [{ value: 'en', label: 'English' }, { value: 'ta', label: 'தமிழ்' }],
            onChange: function (v) { s.close(function () { setLanguage(v); }); }
          }),
          themeChoice('more-theme')
        ])
      ]
    });
  }

  function themeChoice(name) {
    return ui.choice({
      label: t('Appearance'), name: name, value: DX.theme.get(), columns: 3, compact: true,
      options: [
        { value: 'system', label: t('Phone setting'), icon: 'theme' },
        { value: 'light', label: t('Light'), icon: 'sun' },
        { value: 'dark', label: t('Dark'), icon: 'moon' }
      ],
      onChange: function (v) { DX.theme.set(v); }
    });
  }

  /* ------------------------------------------------------------------ *
   * Drawing a page
   * ------------------------------------------------------------------ */
  function makeCtx(route, sub, token) {
    var ctx = {
      route: route.path, sub: sub, token: token,
      _cleanups: [], _onChange: null, _onRound: null, waiting: false,
      alive: function () { return current.token === token; },
      onChange: function (fn) { ctx._onChange = fn; },
      onRound: function (fn) { ctx._onRound = fn; },
      cleanup: function (fn) { ctx._cleanups.push(fn); },
      rerender: function () { if (ctx.alive()) renderRoute({ keepScroll: true }); },
      retitle: function () { if (ctx.alive()) paintTitle(route, ctx); },
      /** Changes the part after the page name without adding a Back step. */
      setSub: function (next) {
        ctx.sub = next || '';
        var hash = '#/' + route.path + (ctx.sub ? '/' + ctx.sub : '');
        try { history.replaceState(history.state, '', hash); } catch (err) { /* ignore */ }
        paintTitle(route, ctx);
      },
      go: go
    };
    return ctx;
  }

  function loading() {
    return el('div.loading', [
      el('div.skeleton', { style: 'height:110px' }),
      el('div.skeleton', { style: 'height:64px' }),
      el('div.skeleton', { style: 'height:220px' })
    ]);
  }

  function renderRoute(opts) {
    opts = opts || {};
    var parsed = parseHash();
    var route = parsed.route;
    var samePage = current.path === route.path;
    var scrollY = window.scrollY;

    if (current.ctx) {
      current.ctx._cleanups.forEach(function (fn) { try { fn(); } catch (err) { /* ignore */ } });
    }
    DX.charts.hideTip();

    current.token++;
    var ctx = makeCtx(route, parsed.sub, current.token);
    current.ctx = ctx;
    current.path = route.path;
    paintNav(route);
    paintTitle(route, ctx);

    util.clear(view);
    if (!store.status().ready && route.path !== 'settings') {
      ctx.waiting = true;
      var err = store.status().syncError;
      view.appendChild(err ? offlineFirstRun(err) : loading());
    } else {
      var page = DX.pages[route.page];
      try {
        page.render(view, ctx);
      } catch (e) {
        if (window.console) console.error(e);
        util.clear(view);
        view.appendChild(ui.empty(t('This page could not be drawn'), e.message || String(e),
          el('button.btn', { type: 'button', onclick: function () { renderRoute(); } }, t('Try again'))));
      }
      paintTitle(route, ctx);
    }

    if (opts.keepScroll) window.scrollTo(0, scrollY);
    else if (!samePage || opts.top) window.scrollTo(0, 0);
    if (!samePage && !opts.keepScroll) {
      try { view.focus({ preventScroll: true }); } catch (e2) { /* ignore */ }
      if (SYNC_ON_VISIT[route.path]) store.syncIfStale();
    }
  }

  function offlineFirstRun(err) {
    var info = ui.explain(err);
    return el('div.firstrun', [
      ui.banner('error', info.title, info.detail),
      el('div.btnrow', [
        el('button.btn.btn--primary', { type: 'button', onclick: function () { renderRoute(); store.sync(); } }, [ui.icon('refresh'), el('span', { text: t('Try again') })]),
        el('a.btn', { href: '#/settings' }, [ui.icon('settings'), el('span', { text: t('Open Settings') })])
      ])
    ]);
  }

  /* ------------------------------------------------------------------ *
   * First run: no sheet link on this device and none built in.
   * ------------------------------------------------------------------ */
  function showWelcome() {
    document.getElementById('shell').hidden = true;
    var host = document.getElementById('welcome');
    host.hidden = false;
    util.clear(host);

    var urlField = ui.field({
      label: t('Apps Script web-app link'), name: 'apiUrl',
      placeholder: 'https://script.google.com/macros/s/…/exec',
      hint: t('Copy it from Deploy → Manage deployments in the Apps Script editor.')
    });
    var connectBtn = el('button.btn.btn--primary.btn--block', { type: 'submit' }, t('Connect this phone'));
    var form = el('form', { novalidate: true }, [urlField, el('div.btnrow', [connectBtn])]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var url = urlField.control.value.trim();
      if (!DX.config.looksValid(url)) {
        ui.setFieldError(urlField.control, t('The link should start with https://script.google.com/macros/s/ and end in /exec.'));
        return;
      }
      DX.config.set(url);
      ui.busy(connectBtn, true, t('Connecting…'));
      DX.api.ping().then(function () { location.reload(); }).catch(function (err) {
        DX.config.clear();
        ui.reportError(err, form);
        ui.busy(connectBtn, false);
      });
    });

    host.appendChild(el('div.setup', [
      el('div.card', [
        el('div.card__head', [el('h1', { text: t('Connect to your milk register') }), el('p', { text: t('One link, once per phone.') })]),
        el('div.card__body', [
          el('ol', [
            el('li', t('Create a blank Google Sheet.')),
            el('li', t('Extensions → Apps Script, paste in Code.gs from this project, save.')),
            el('li', t('Run setup once and allow the permission prompt.')),
            el('li', t('Deploy → New deployment → Web app. Execute as Me, access Anyone.')),
            el('li', t('Paste the link below. It ends in /exec.'))
          ]),
          form
        ])
      ])
    ]));
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  function start() {
    DX.i18n.stamp();
    DX.theme.apply(DX.theme.get());
    view = document.getElementById('view');
    titleNode = document.getElementById('page-title');
    subNode = document.getElementById('page-sub');
    pillNode = document.getElementById('sync-pill');
    langNode = document.getElementById('lang-toggle');
    railNode = document.getElementById('rail');
    tabNode = document.getElementById('tabbar');

    if (!DX.config.get()) { showWelcome(); return; }

    store.init();
    buildShell();

    pillNode.addEventListener('click', onPill);
    langNode.addEventListener('click', function () { setLanguage(DX.i18n.get() === 'ta' ? 'en' : 'ta'); });
    window.addEventListener('hashchange', function () { renderRoute(); });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var follow = function () { DX.theme.apply(DX.theme.get()); };
      if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
    }

    store.on('status', paintPill);
    store.on('change', function () {
      var ctx = current.ctx;
      if (!ctx || !ctx.alive()) return;
      var brand = document.getElementById('brand-name');
      if (brand) brand.textContent = store.businessName();
      if (ctx.waiting) {
        if (store.status().ready) renderRoute({ keepScroll: true });
        return;
      }
      if (ctx._onChange) {
        try { ctx._onChange(); } catch (err) { if (window.console) console.error(err); }
      }
      paintTitle(routeFor(current.path), ctx);
    });
    store.on('round', function () {
      var ctx = current.ctx;
      if (ctx && ctx.alive() && ctx._onRound) ctx._onRound(store.round());
    });
    store.on('failed', function (item) {
      var who = item.data && (item.data.name || '');
      ui.say.error(t('Not saved'), (item.error && item.error.message) || who || '');
    });
    store.on('warning', function (w) { ui.say.warn(t('Please check'), w.message); });
    store.on('syncFailed', function () {
      var ctx = current.ctx;
      if (ctx && ctx.waiting) renderRoute({ keepScroll: true });
    });

    if (!location.hash || parseHash().unknown) {
      try { history.replaceState(null, '', '#/home'); } catch (err) { location.hash = '#/home'; }
    }
    renderRoute();
    store.sync();
  }

  return { start: start, go: go, renderRoute: renderRoute, routes: ROUTES, themeChoice: themeChoice, setLanguage: setLanguage, openQueue: openQueue };
})();

document.addEventListener('DOMContentLoaded', DX.app.start);

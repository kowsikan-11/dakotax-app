/* Settings — this phone (language, appearance, saved entries, sheet link)
 * and the shared values kept in the sheet (rates, round change hour…). */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.settings = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }
  var APP_VERSION = '2.0.0';

  function render(root, ctx) {
    /* --- this phone --- */
    var langField = ui.choice({
      label: t('Language'), name: 'set-lang', value: DX.i18n.get(), columns: 2,
      options: [{ value: 'en', label: 'English', sub: 'Screens in English' }, { value: 'ta', label: 'தமிழ்', sub: 'திரைகள் தமிழில்' }],
      onChange: function (v) { DX.app.setLanguage(v); }
    });
    root.appendChild(el('div.card', [
      el('div.card__head', [el('h2', { text: t('This phone') }), el('p', { text: t('These choices are remembered on this phone only.') })]),
      el('div.card__body.form-stack', [langField, DX.app.themeChoice('set-theme')])
    ]));

    /* --- saving --- */
    var syncHost = el('div.card__body.form-stack');
    root.appendChild(el('section.section', el('div.card', [
      el('div.card__head', [el('h2', { text: t('Saving and updates') })]),
      syncHost
    ])));

    function paintSync() {
      var s = store.status();
      util.clear(syncHost);
      if (s.failed) syncHost.appendChild(ui.banner('error', t('{n} not saved', { n: s.failed }), t('The sheet refused these. Open the list to fix or remove them.')));
      else if (s.pending) syncHost.appendChild(ui.banner('warn', t('{n} waiting to send', { n: s.pending }), s.offline ? t('No connection right now. They are kept on this phone and sent by themselves.') : t('Sending now…')));
      else syncHost.appendChild(ui.banner('ok', t('Everything is saved'), s.lastSync ? t('Last updated {time}', { time: util.clockLabel(new Date(s.lastSync)) }) : null));
      syncHost.appendChild(el('div.btnrow', [
        el('button.btn', { type: 'button', onclick: function (e) {
          var b = e.currentTarget;
          ui.busy(b, true, t('Updating…'));
          store.sync().then(function (ok) {
            ui.busy(b, false);
            if (ok) ui.say.ok(t('Up to date'), t('Read fresh from the sheet.')); else ui.reportError(store.status().syncError);
          });
        } }, [ui.icon('refresh'), el('span', { text: t('Refresh from sheet') })]),
        (s.pending || s.failed) ? el('button.btn', { type: 'button', onclick: function () { DX.app.openQueue(); } }, [ui.icon('clock'), el('span', { text: t('Open the list') })]) : null
      ]));
      var space = store.space();
      if (space) syncHost.appendChild(spaceMeter(space));
      var v = s.version;
      if (v && Number(String(v).split('.')[0]) < 2) {
        syncHost.appendChild(ui.banner('warn', t('The sheet script is out of date'),
          t('Saving works, but paste the new Code.gs into Apps Script and deploy a new version for faster saves and safe retries.')));
      }
    }
    paintSync();

    /* --- shared values in the sheet --- */
    if (store.status().ready) {
      var s0 = store.data().settings;
      var nameField = ui.field({ label: t('Business name'), name: 'business_name', value: s0.business_name || '', maxlength: 60 });
      var buyField = ui.field({ label: t('Usual buying rate (per litre)'), name: 'default_rate', type: 'money', prefix: '₹', value: s0.default_rate || '', hint: t('Paid to a supplier who has no rate of their own.') });
      var sellField = ui.field({ label: t('Usual selling rate (per litre)'), name: 'default_sale_rate', type: 'money', prefix: '₹', value: s0.default_sale_rate || '', hint: t('Charged to a customer who has no rate of their own.') });
      var cutField = ui.field({ label: t('Evening round starts at (hour, 0–23)'), name: 'shift_cutover_hour', type: 'number', value: s0.shift_cutover_hour || '12', hint: t('Before this hour the app picks Morning, from it Evening. 12 means noon.') });
      var maxField = ui.field({ label: t('Most litres in one entry'), name: 'max_litres_per_entry', type: 'number', suffix: 'L', value: s0.max_litres_per_entry || '200', hint: t('Stops a slipped decimal point, like 850 instead of 8.5.') });
      var futureToggle = ui.toggle({ label: t('Allow dates in the future'), checked: s0.allow_future_dates === 'yes', hint: t('Usually off.') });
      var currencyField = ui.choice({
        label: t('Currency'), name: 'set-currency', value: s0.currency || 'INR', compact: true, columns: 4,
        options: [{ value: 'INR', label: '₹ INR' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }, { value: 'GBP', label: '£ GBP' }]
      });
      var saveBtn = el('button.btn.btn--primary.btn--block', { type: 'submit' }, [ui.icon('check'), el('span', { text: t('Save settings') })]);
      var form = el('form.form-stack', { novalidate: true }, [nameField, el('div.form-row', [buyField, sellField]), cutField, maxField, futureToggle, currencyField, saveBtn]);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        ui.clearFieldErrors(form);
        var hour = cutField.number();
        var max = maxField.number();
        var buy = buyField.value().trim() ? buyField.number() : '';
        var sell = sellField.value().trim() ? sellField.number() : '';
        var problems = [];
        if (!(hour >= 0 && hour <= 23 && Math.round(hour) === hour)) { ui.setFieldError(cutField.control, t('Use a whole hour from 0 to 23.')); problems.push(cutField.control); }
        if (!(max >= 1)) { ui.setFieldError(maxField.control, t('Type a number of litres, like 200.')); problems.push(maxField.control); }
        if (buy !== '' && !(buy >= 0)) { ui.setFieldError(buyField.control, t('Type the rate as a number, like 34.')); problems.push(buyField.control); }
        if (sell !== '' && !(sell >= 0)) { ui.setFieldError(sellField.control, t('Type the rate as a number, like 34.')); problems.push(sellField.control); }
        if (problems.length) { problems[0].focus(); return; }
        ui.busy(saveBtn, true, t('Saving…'));
        store.saveSettings({
          business_name: nameField.value().trim(), default_rate: buy, default_sale_rate: sell,
          shift_cutover_hour: String(hour), max_litres_per_entry: String(max),
          allow_future_dates: futureToggle.get() ? 'yes' : 'no', currency: currencyField.get()
        }).then(function () {
          ui.say.ok(t('Settings saved'), t('Every phone picks these up on its next refresh.'));
        }, function (err) {
          ui.reportError(err, form);
        }).then(function () { if (ctx.alive()) ui.busy(saveBtn, false); });
      });
      root.appendChild(el('section.section', el('div.card', [
        el('div.card__head', [el('h2', { text: t('Rates and rules') }), el('p', { text: t('Kept in the sheet — the same on every phone. Needs the internet to save.') })]),
        el('div.card__body', form)
      ])));
    }

    /* --- the sheet link (rarely needed) --- */
    var urlField = ui.field({
      label: t('Apps Script web-app link'), name: 'apiUrl', value: DX.config.get(),
      placeholder: 'https://script.google.com/macros/s/…/exec',
      hint: DX.config.isBuiltIn() ? t('This link is built into the site, so every phone connects by itself. Saving another link here changes only this phone.') : t('Set on this phone only. Disconnect to go back to the link built into the site.')
    });
    var testBtn = el('button.btn', { type: 'button' }, t('Test link'));
    var connectBtn = el('button.btn.btn--primary', { type: 'submit' }, t('Save and reload'));
    var discBtn = el('button.btn.btn--ghost', { type: 'button' }, t('Disconnect'));
    var connForm = el('form.form-stack', { novalidate: true }, [urlField, el('div.btnrow', [connectBtn, testBtn, discBtn])]);
    testBtn.addEventListener('click', function () {
      var url = urlField.control.value.trim();
      if (!DX.config.looksValid(url)) { ui.setFieldError(urlField.control, t('The link should start with https://script.google.com/macros/s/ and end in /exec.')); return; }
      var previous = DX.util.storageGet('dakotax.apiUrl');
      DX.config.set(url);
      ui.busy(testBtn, true, t('Testing…'));
      DX.api.ping().then(function (info) {
        ui.say.ok(t('Link works'), t('Script version {v} answered.', { v: info.version || '1' }));
      }, function (err) { ui.reportError(err, connForm); }).then(function () {
        if (previous) DX.config.set(previous); else DX.config.clear();
        if (ctx.alive()) ui.busy(testBtn, false);
      });
    });
    connForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = urlField.control.value.trim();
      if (!DX.config.looksValid(url)) { ui.setFieldError(urlField.control, t('The link should start with https://script.google.com/macros/s/ and end in /exec.')); return; }
      DX.config.set(url);
      location.reload();
    });
    discBtn.addEventListener('click', function () {
      ui.confirm({ title: t('Disconnect this phone?'), message: t('The link saved on this phone is removed. Nothing in the sheet changes.'), confirmLabel: t('Disconnect') })
        .then(function (yes) { if (yes) { DX.config.clear(); location.reload(); } });
    });
    root.appendChild(el('section.section', el('div.card', el('div.card__body', el('details.more', [
      el('summary', [ui.icon('down'), el('span', { text: t('Sheet link (for setup only)') })]),
      el('div', connForm)
    ])))));

    root.appendChild(el('p.hint', { style: 'margin:16px 4px', text: t('App version {v}', { v: APP_VERSION }) + (store.status().version ? ' · ' + t('Sheet script {v}', { v: store.status().version }) : '') }));

    var offStatus = store.on('status', paintSync);
    ctx.cleanup(offStatus);
  }

  /** How full the Google Sheet file is. Google stops saving at 10 million cells. */
  function spaceMeter(space) {
    var pct = Math.min(100, Math.round(space.share * 1000) / 10);
    var tone = space.share >= 0.95 ? 'bad' : space.share >= 0.8 ? 'warn' : 'ok';
    return el('div.meter.meter--' + tone, [
      el('div.progress__text', [
        el('span', [el('b', { text: t('Sheet file space') }), ' · ', t('{p}% full', { p: util.fmtNum(pct, pct < 10 ? 1 : 0) })]),
        el('span', { text: t('{a} of {b} cells', { a: util.fmtCount(space.cells), b: util.fmtCount(space.limit) }) })
      ]),
      el('div.progress__bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': t('Sheet file space') },
        el('div.progress__fill', { style: 'width:' + Math.max(pct, 1) + '%' })),
      el('p.hint', { text: space.share >= 0.8
        ? t('Getting full. When it is full, new entries cannot be saved. Move old months to a separate file soon.')
        : t('Google allows 10 million cells in one sheet file. Old months can be moved out when it gets full.') })
    ]);
  }

  return {
    spaceMeter: spaceMeter,
    title: function () { return t('Settings'); },
    subtitle: function () { return DX.config.get() ? t('Connected to the sheet') : t('Not connected'); },
    render: render
  };
})();

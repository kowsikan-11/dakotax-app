/* Settings — the sheet link on this device, plus the values stored in the sheet. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.settings = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;

  function render(root) {
    var s = store.state;
    util.clear(root);

    /* --- connection (per device) --- */
    var urlField = ui.field({
      label: 'Apps Script web-app link', name: 'apiUrl', value: DX.config.get(),
      placeholder: 'https://script.google.com/macros/s/…/exec',
      hint: DX.config.isBuiltIn()
        ? 'This link is built into the site, so every device is connected the moment it opens the page. Saving a different one here overrides it on this device only.'
        : 'Set on this device. Disconnect to fall back to the link built into the site.'
    });
    var testBtn = util.el('button.btn', { type: 'button' }, 'Test link');
    var connectBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Save and reload');

    var connForm = util.el('form', { novalidate: true }, [
      urlField,
      util.el('div.form-actions', [
        connectBtn, testBtn,
        util.el('button.btn.btn--ghost', {
          type: 'button',
          onclick: function () {
            ui.confirmAction({
              title: 'Disconnect this device?',
              message: 'The link is removed from this browser. Nothing on the sheet changes.',
              confirmLabel: 'Disconnect'
            }).then(function (yes) {
              if (!yes) return;
              DX.config.clear();
              location.reload();
            });
          }
        }, 'Disconnect')
      ])
    ]);

    testBtn.addEventListener('click', function () {
      var url = urlField.control.value.trim();
      if (!url) { ui.setFieldError(urlField.control, 'Paste the link that ends in /exec.'); return; }
      var previous = DX.config.get();
      DX.config.set(url);
      ui.busy(testBtn, true, 'Testing…');
      DX.api.ping().then(function (info) {
        ui.say.ok('Link works', 'Script version ' + info.version + ' answered.');
      }).catch(function (err) {
        DX.config.set(previous);
        ui.reportError(err, connForm);
      }).then(function () { ui.busy(testBtn, false); });
    });

    connForm.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(connForm);
      var url = urlField.control.value.trim();
      if (!DX.config.looksValid(url)) {
        ui.setFieldError(urlField.control, 'That does not look like an Apps Script web-app link. It should start with https://script.google.com/macros/s/ and end in /exec.');
        return;
      }
      DX.config.set(url);
      location.reload();
    });

    var themeField = ui.field({
      label: 'Appearance', name: 'theme', type: 'select', value: DX.theme.get(),
      options: DX.theme.values.map(function (v) { return { value: v, label: DX.theme.label(v) }; }),
      hint: 'Match my system follows whatever your phone or computer is set to. The choice is remembered on this device only.'
    });
    themeField.control.addEventListener('change', function () {
      var choice = DX.theme.set(themeField.control.value);
      if (DX.app && DX.app.paintTheme) DX.app.paintTheme();
      ui.say.ok('Appearance: ' + DX.theme.label(choice).toLowerCase(),
        choice === 'system' ? 'Now showing the ' + DX.theme.resolved() + ' theme.' : 'Remembered on this device.');
    });

    root.appendChild(util.el('div.card', [
      util.el('div.card__head', [util.el('h2', 'Appearance'),
        util.el('p', 'This device only')]),
      util.el('div.card__body', [themeField])
    ]));

    root.appendChild(util.el('section.section', [util.el('div.card', [
      util.el('div.card__head', [util.el('h2', 'Sheet connection'),
        util.el('p', 'This device only')]),
      util.el('div.card__body', [connForm])
    ])]));

    if (!s.ready) return;

    /* --- values stored in the sheet --- */
    var nameField = ui.field({ label: 'Business name', name: 'business_name', value: s.settings.business_name || '', maxlength: 60 });
    var currencyField = ui.field({
      label: 'Currency', name: 'currency', type: 'select', value: s.settings.currency || 'INR',
      options: ['INR', 'USD', 'EUR', 'GBP'].map(function (c) { return { value: c, label: c }; })
    });
    var rateField = ui.field({
      label: 'Default buying rate', name: 'default_rate', type: 'number', step: '0.01', min: '0',
      value: s.settings.default_rate || '', hint: 'Paid to a supplier when they have no rate of their own.'
    });
    var saleRateField = ui.field({
      label: 'Default selling rate', name: 'default_sale_rate', type: 'number', step: '0.01', min: '0',
      value: s.settings.default_sale_rate || '', hint: 'Charged to a customer when they have no rate of their own.'
    });
    var cutoverField = ui.field({
      label: 'Shift changes at', name: 'shift_cutover_hour', type: 'number', min: '0', max: '23',
      value: s.settings.shift_cutover_hour || '12',
      hint: 'Hour of the day (0–23). Before it the app pre-selects Morning, from it Evening.'
    });
    var maxField = ui.field({
      label: 'Maximum litres per entry', name: 'max_litres_per_entry', type: 'number', min: '1',
      value: s.settings.max_litres_per_entry || '200', hint: 'A guard against a slipped decimal point.'
    });
    var futureField = ui.field({
      label: 'Allow future dates', name: 'allow_future_dates', type: 'select', value: s.settings.allow_future_dates || 'no',
      options: [{ value: 'no', label: 'No — today or earlier' }, { value: 'yes', label: 'Yes' }]
    });

    var saveBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Save settings');
    var settingsForm = util.el('form', { novalidate: true }, [
      util.el('div.form-grid', [nameField, currencyField]),
      util.el('div.form-grid', [rateField, saleRateField]),
      util.el('div.form-grid', [cutoverField, maxField, futureField]),
      util.el('div.form-actions', [saveBtn])
    ]);

    settingsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(settingsForm);
      var data = new FormData(settingsForm);
      var payload = {};
      data.forEach(function (value, key) { payload[key] = value; });
      var hour = Number(payload.shift_cutover_hour);
      if (!(hour >= 0 && hour <= 23)) {
        ui.setFieldError(cutoverField.control, 'Use an hour between 0 and 23.');
        return;
      }
      ui.busy(saveBtn, true);
      DX.api.call('settings.save', { settings: payload }).then(function () {
        ui.say.ok('Settings saved', 'Every device picks these up on its next refresh.');
        return store.refresh();
      }).then(function () {
        store.autoShift();
        render(root);
      }).catch(function (err) { ui.reportError(err, settingsForm); })
        .then(function () { ui.busy(saveBtn, false); });
    });

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Collection settings'),
          util.el('p', 'Stored in the Settings tab — shared by every device')]),
        util.el('div.card__body', [settingsForm])
      ])
    ]));

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Sheet status')]),
        util.el('div.card__body', [
          ui.table([
            { key: 'label', label: 'Item' },
            { key: 'value', label: 'Value', right: true }
          ], [
            { label: 'Sheet timezone', value: s.timezone || 'not reported' },
            { label: 'Sheet date', value: util.fmtDate(s.serverDate) },
            { label: 'Suppliers', value: String(s.suppliers.length) },
            { label: 'Customers', value: String(s.customers.length) },
            { label: 'Collection entries loaded', value: String(s.collections.length) },
            { label: 'Deliveries loaded', value: String(s.sales.length) },
            { label: 'Advances loaded', value: String(s.advances.length) },
            { label: 'Payments loaded', value: String(s.payments.length) },
            { label: 'Receipts loaded', value: String(s.receipts.length) }
          ])
        ])
      ])
    ]));
  }

  return { title: 'Settings', subtitle: function () { return DX.config.get() ? 'Connected' : 'Not connected'; }, render: render };
})();

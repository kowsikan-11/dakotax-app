/* People — suppliers (money out) and customers (money in), one register each. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.people = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var mode = 'suppliers';
  var query = '';
  var showInactive = false;

  var SIDES = {
    suppliers: {
      noun: 'supplier', Noun: 'Supplier', prefix: 'S',
      idField: 'supplierId', subField: 'village', subLabel: 'Village',
      subHint: 'Village or route',
      list: function () { return store.state.suppliers; },
      saveAction: 'suppliers.save', statusAction: 'suppliers.setStatus',
      payloadKey: 'supplier',
      balance: function (id) { return store.balanceFor(id); },
      balanceLabel: 'Advance',
      balanceCell: function (id) {
        var balance = store.balanceFor(id);
        return balance > 0 ? store.money(balance) : '—';
      },
      defaultRate: function () { return store.defaultRate(); },
      rateHint: 'What you pay them per litre. Suggested on every entry.',
      blurb: 'People who bring you milk. You pay them.'
    },
    customers: {
      noun: 'customer', Noun: 'Customer', prefix: 'C',
      idField: 'customerId', subField: 'address', subLabel: 'Address',
      subHint: 'Shop, street or area',
      list: function () { return store.state.customers; },
      saveAction: 'customers.save', statusAction: 'customers.setStatus',
      payloadKey: 'customer',
      balance: function (id) { return store.owedBy(id); },
      balanceLabel: 'Owes',
      balanceCell: function (id) {
        var owed = store.owedBy(id);
        if (owed > 0.001) return store.money(owed);
        if (owed < -0.001) return util.el('span.credit', store.money(-owed) + ' cr');
        return '—';
      },
      defaultRate: function () { return store.defaultSaleRate(); },
      rateHint: 'What you charge them per litre. Suggested on every delivery.',
      blurb: 'People you deliver milk to. They pay you.'
    }
  };

  function suggestId(side) {
    var numbers = side.list()
      .map(function (p) { return new RegExp('^' + side.prefix + '(\\d+)$').exec(p[side.idField]); })
      .filter(Boolean).map(function (m) { return Number(m[1]); });
    var next = numbers.length ? Math.max.apply(null, numbers) + 1 : 1;
    return side.prefix + String(next).padStart(3, '0');
  }

  function openForm(person, root) {
    var side = SIDES[mode];
    var isNew = !person;

    var idField = ui.field({
      label: side.Noun + ' ID', name: side.idField, required: true, maxlength: 20,
      value: person ? person[side.idField] : suggestId(side),
      hint: 'Short code — letters, numbers, hyphen. Cannot be changed later.'
    });
    if (!isNew) idField.control.readOnly = true;

    var nameField = ui.field({ label: 'Name', name: 'name', required: true, maxlength: 80, value: person ? person.name : '', autocomplete: 'name' });
    var mobileField = ui.field({ label: 'Mobile', name: 'mobile', type: 'tel', inputmode: 'tel', maxlength: 16, value: person ? person.mobile : '', hint: '6 to 15 digits.' });
    var subField = ui.field({ label: side.subLabel, name: side.subField, maxlength: 80, value: person ? person[side.subField] : '', placeholder: side.subHint });
    var rateField = ui.field({
      label: 'Rate per litre', name: 'ratePerLitre', type: 'number', step: '0.01', min: '0', inputmode: 'decimal',
      value: person && person.ratePerLitre ? person.ratePerLitre : side.defaultRate(),
      hint: side.rateHint
    });
    var statusField = ui.field({
      label: 'Status', name: 'status', type: 'select', value: person ? person.status : 'Active',
      options: [
        { value: 'Active', label: 'Active' },
        { value: 'Inactive', label: 'Inactive — no new entries' }
      ]
    });

    var saveBtn = util.el('button.btn.btn--primary', { type: 'submit' }, isNew ? 'Add ' + side.noun : 'Save changes');
    var form = util.el('form', { novalidate: true }, [
      util.el('div.card__body', [
        util.el('div.form-grid', [idField, nameField]),
        util.el('div.form-grid', [mobileField, subField]),
        util.el('div.form-grid', [rateField, statusField]),
        util.el('div.form-actions', [
          saveBtn,
          util.el('button.btn', { type: 'button', onclick: function () { dialog.close(); dialog.remove(); } }, 'Cancel')
        ])
      ])
    ]);

    var dialog = util.el('dialog.sheet', [
      util.el('div.card__head', [util.el('h2', isNew ? 'Add ' + side.noun : 'Edit ' + person.name)]),
      form
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      var record = {
        mode: isNew ? 'create' : 'update',
        name: data.get('name'),
        mobile: data.get('mobile'),
        ratePerLitre: data.get('ratePerLitre'),
        status: data.get('status')
      };
      record[side.idField] = data.get(side.idField);
      record[side.subField] = data.get(side.subField);

      var payload = {};
      payload[side.payloadKey] = record;

      ui.busy(saveBtn, true);
      DX.api.call(side.saveAction, payload).then(function (result) {
        ui.say.ok(result.created ? side.Noun + ' added' : side.Noun + ' saved',
          record.name + ' · ' + record[side.idField]);
        dialog.close(); dialog.remove();
        return store.refresh();
      }).then(function () { render(root); })
        .catch(function (err) { ui.reportError(err, form); })
        .then(function () { ui.busy(saveBtn, false); });
    });

    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', function () { dialog.remove(); });
    dialog.showModal();
    nameField.control.focus();
  }

  function toggleStatus(person, root) {
    var side = SIDES[mode];
    var next = person.status === 'Active' ? 'Inactive' : 'Active';
    var payload = { status: next };
    payload[side.idField] = person[side.idField];
    DX.api.call(side.statusAction, payload)
      .then(function () {
        ui.say.ok(person.name + ' is now ' + next.toLowerCase(),
          next === 'Inactive'
            ? 'Past records stay on the sheet; nothing new can be recorded against them.'
            : 'They can be picked on the entry page again.');
        return store.refresh();
      })
      .then(function () { render(root); })
      .catch(function (err) { ui.reportError(err); });
  }

  function render(root) {
    util.clear(root);

    root.appendChild(ui.modeSwitch({
      label: 'Which register',
      value: mode,
      modes: [
        { key: 'suppliers', short: 'Suppliers', tail: 'you pay', icon: ui.arrowIn() },
        { key: 'customers', short: 'Customers', tail: 'who pay you', icon: ui.arrowOut() }
      ],
      onChange: function (next) { mode = next; query = ''; render(root); }
    }));

    var side = SIDES[mode];

    var searchField = ui.field({ label: 'Search', name: 'q', value: query, placeholder: 'Name, ID, mobile or ' + side.subLabel.toLowerCase() });
    searchField.control.addEventListener('input', util.debounce(function () {
      query = searchField.control.value;
      renderTable();
    }, 150));

    var inactiveToggle = ui.field({
      label: 'Show inactive', name: 'showInactive', type: 'select', value: showInactive ? 'yes' : 'no',
      options: [{ value: 'no', label: 'Active only' }, { value: 'yes', label: 'Active and inactive' }]
    });
    inactiveToggle.control.addEventListener('change', function () {
      showInactive = inactiveToggle.control.value === 'yes';
      renderTable();
    });

    root.appendChild(util.el('div.filters', [
      searchField, inactiveToggle,
      util.el('div.filters__actions', [
        util.el('button.btn.btn--primary', { type: 'button', onclick: function () { openForm(null, root); } }, 'Add ' + side.noun),
        util.el('button.btn', { type: 'button', onclick: exportCsv }, 'Export CSV')
      ])
    ]));

    var tableHost = util.el('div.card');
    root.appendChild(tableHost);

    function visible() {
      var q = query.trim().toLowerCase();
      return side.list().filter(function (p) {
        if (!showInactive && p.status === 'Inactive') return false;
        if (!q) return true;
        return [p.name, p[side.idField], p.mobile, p[side.subField]].join(' ').toLowerCase().indexOf(q) > -1;
      });
    }

    function exportCsv() {
      var rows = visible().map(function (p) {
        return [p[side.idField], p.name, p.mobile, p[side.subField], p.ratePerLitre, p.status, side.balance(p[side.idField])];
      });
      util.downloadCsv('dakotax-' + mode + '-' + store.state.serverDate + '.csv',
        util.toCsv([side.Noun + ' ID', 'Name', 'Mobile', side.subLabel, 'Rate per litre', 'Status',
          mode === 'suppliers' ? 'Advance outstanding' : 'Balance owed'], rows));
      ui.say.ok(side.Noun + 's exported', rows.length + ' rows downloaded as CSV.');
    }

    function renderTable() {
      util.clear(tableHost);
      var rows = visible();
      tableHost.appendChild(util.el('div.card__head', [
        util.el('h2', side.Noun + ' register'),
        util.el('p', side.blurb)
      ]));
      tableHost.appendChild(util.el('div.card__body', [
        rows.length ? ui.table([
          { label: 'ID', render: function (r) { return r[side.idField]; } },
          { key: 'name', label: 'Name' },
          { key: 'mobile', label: 'Mobile' },
          { label: side.subLabel, render: function (r) { return r[side.subField]; } },
          { label: 'Rate', right: true, render: function (r) { return r.ratePerLitre ? util.fmtNum(r.ratePerLitre, 2) : '—'; } },
          { label: side.balanceLabel, right: true, render: function (r) { return side.balanceCell(r[side.idField]); } },
          { label: 'Status', render: function (r) { return ui.chip(r.status, r.status === 'Active' ? 'good' : 'muted'); } },
          {
            label: '', right: true, render: function (r) {
              return util.el('span.rowactions', [
                util.el('button.btn.btn--sm', { type: 'button', onclick: function () { openForm(r, root); } }, 'Edit'),
                util.el('button.btn.btn--sm', { type: 'button', onclick: function () { toggleStatus(r, root); } },
                  r.status === 'Active' ? 'Deactivate' : 'Reactivate')
              ]);
            }
          }
        ], rows) : ui.empty(
          query ? 'No ' + side.noun + ' matches "' + query + '"' : 'No ' + side.noun + 's yet',
          query ? 'Try part of a name, the short ID, or a mobile number.' : side.blurb,
          util.el('button.btn.btn--primary', { type: 'button', onclick: function () { openForm(null, root); } }, 'Add ' + side.noun)
        )
      ]));
      tableHost.appendChild(util.el('div.card__foot', {
        text: rows.length + ' of ' + side.list().length + ' ' + side.noun + 's shown'
      }));
    }

    renderTable();
  }

  return {
    title: 'People',
    subtitle: function () {
      return store.state.suppliers.length + ' suppliers · ' + store.state.customers.length + ' customers';
    },
    render: render
  };
})();

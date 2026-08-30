/* Advances — money handed out ahead of the milk bill, and money taken back. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.advances = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var filterSupplier = '';

  function render(root) {
    var s = store.state;
    util.clear(root);

    if (!store.activeSuppliers().length) {
      root.appendChild(ui.empty('No active suppliers', 'Advances are recorded against a supplier.',
        util.el('a.btn.btn--primary', { href: '#/people' }, 'Go to People')));
      return;
    }

    /* --- form --- */
    var balanceNote = util.el('p.stat__meta');
    var picker = ui.partyPicker({
      people: s.suppliers.map(ui.asSupplier), noun: 'supplier', label: 'Supplier',
      onChange: function (supplier) {
        if (!supplier) { balanceNote.textContent = ''; return; }
        var balance = store.balanceFor(supplier.id);
        balanceNote.textContent = balance > 0
          ? 'Outstanding advance: ' + store.money(balance) + '. A recovery cannot go above this.'
          : 'No advance outstanding for ' + supplier.name + '.';
      }
    });

    var typeField = ui.field({
      label: 'Type', name: 'type', type: 'select', value: 'Given',
      options: [
        { value: 'Given', label: 'Given — money paid out now' },
        { value: 'Recovered', label: 'Recovered — deducted from milk earnings' }
      ]
    });
    var dateField = ui.field({ label: 'Date', name: 'date', type: 'date', value: s.serverDate, max: s.serverDate, required: true });
    var amountField = ui.field({ label: 'Amount', name: 'amount', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: true, big: true, placeholder: '0.00' });
    var noteField = ui.field({ label: 'Reason (optional)', name: 'note', maxlength: 200, placeholder: 'Festival advance, medical, fodder…' });

    var saveBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Save advance');
    var form = util.el('form', { novalidate: true }, [
      util.el('div.form-grid.form-grid--wide', [picker, typeField]),
      util.el('div.form-grid.form-grid--wide', [dateField, amountField]),
      noteField,
      util.el('div', { style: 'margin-top:10px' }, [balanceNote]),
      util.el('div.form-actions', [saveBtn])
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      if (!data.get('supplierId')) {
        ui.setFieldError(picker.control, 'Pick a supplier from the list.');
        picker.control.focus();
        return;
      }
      ui.busy(saveBtn, true);
      DX.api.call('advances.save', {
        advance: {
          supplierId: data.get('supplierId'), date: data.get('date'),
          type: data.get('type'), amount: data.get('amount'), note: data.get('note')
        }
      }).then(function (result) {
        ui.say.ok(result.advance.type === 'Given' ? 'Advance recorded' : 'Recovery recorded',
          result.advance.supplierName + ' · ' + store.money(result.advance.amount));
        return store.refresh();
      }).then(function () { render(root); })
        .catch(function (err) { ui.reportError(err, form); })
        .then(function () { ui.busy(saveBtn, false); });
    });

    root.appendChild(util.el('div.card', [
      util.el('div.card__head', [util.el('h2', 'Record an advance'),
        util.el('p', 'Money handed to a supplier before the milk bill. Given adds to the balance, recovered takes it back down')]),
      util.el('div.card__body', [form])
    ]));
    root.appendChild(util.el('p.hint', {
      style: 'margin:8px 2px 0',
      text: 'Advances are the supplier side only. What a customer owes you is tracked as a running balance on the Money page.'
    }));

    /* --- outstanding balances --- */
    var owing = s.suppliers
      .map(function (sup) { return { supplier: sup, balance: store.balanceFor(sup.supplierId) }; })
      .filter(function (r) { return r.balance > 0.001; })
      .sort(function (a, b) { return b.balance - a.balance; });

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Outstanding by supplier'),
          util.el('p', 'Given minus recovered, all time')]),
        util.el('div.card__body', [
          owing.length ? ui.table([
            { label: 'Supplier', render: function (r) { return r.supplier.name; } },
            { label: 'ID', render: function (r) { return r.supplier.supplierId; } },
            { label: 'Village', render: function (r) { return r.supplier.village; } },
            { label: 'Outstanding', right: true, render: function (r) { return store.money(r.balance); } }
          ], owing) : ui.empty('Nothing outstanding', 'Every advance handed out has been recovered.')
        ]),
        owing.length ? util.el('div.card__foot', { text: 'Total outstanding: ' + store.money(store.totalOutstanding()) }) : null
      ])
    ]));

    /* --- history --- */
    var historyHost = util.el('div.card');
    root.appendChild(util.el('section.section', [historyHost]));

    function renderHistory() {
      util.clear(historyHost);
      var rows = s.advances.filter(function (a) { return !filterSupplier || a.supplierId === filterSupplier; });
      var filter = ui.field({
        label: 'Filter by supplier', name: 'filterSupplier', type: 'select', value: filterSupplier,
        options: [{ value: '', label: 'All suppliers' }].concat(s.suppliers.map(function (sup) {
          return { value: sup.supplierId, label: sup.name + ' (' + sup.supplierId + ')' };
        }))
      });
      filter.control.addEventListener('change', function () { filterSupplier = filter.control.value; renderHistory(); });

      historyHost.appendChild(util.el('div.card__head', [util.el('h2', 'Advance history'),
        util.el('p', 'Most recent first')]));
      historyHost.appendChild(util.el('div.card__body', [
        util.el('div.filters', [filter, util.el('div.filters__actions', [
          util.el('button.btn', { type: 'button', onclick: function () { exportCsv(rows); } }, 'Export CSV')
        ])]),
        rows.length ? ui.table([
          { label: 'Date', render: function (r) { return util.fmtDate(r.date); } },
          { key: 'supplierName', label: 'Supplier' },
          { label: 'Type', render: function (r) { return ui.chip(r.type, r.type === 'Given' ? 'warn' : 'good'); } },
          { label: 'Amount', right: true, render: function (r) { return store.money(r.amount); } },
          { key: 'note', label: 'Reason' },
          { label: '', right: true, render: function (r) {
              return util.el('span.rowactions', [
                util.el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { remove(r, root); } }, 'Delete')
              ]);
            } }
        ], rows) : ui.empty('No advances recorded', 'Advances you save will be listed here.')
      ]));
    }

    function exportCsv(rows) {
      util.downloadCsv('dakotax-advances-' + s.serverDate + '.csv', util.toCsv(
        ['Date', 'Supplier ID', 'Supplier', 'Type', 'Amount', 'Reason'],
        rows.map(function (r) { return [r.date, r.supplierId, r.supplierName, r.type, r.amount, r.note]; })
      ));
      ui.say.ok('Advances exported', rows.length + ' rows downloaded as CSV.');
    }

    renderHistory();
  }

  function remove(advance, root) {
    ui.confirmAction({
      title: 'Delete this advance?',
      message: advance.supplierName + ' · ' + advance.type + ' · ' + store.money(advance.amount) +
        ' on ' + util.fmtDate(advance.date) + '. The outstanding balance will change.',
      confirmLabel: 'Delete advance'
    }).then(function (yes) {
      if (!yes) return;
      return DX.api.call('advances.delete', { advanceId: advance.advanceId })
        .then(function () { ui.say.ok('Advance deleted', advance.supplierName); return store.refresh(); })
        .then(function () { render(root); })
        .catch(function (err) { ui.reportError(err); });
    });
  }

  return {
    title: 'Advances',
    subtitle: function () { return store.money(store.totalOutstanding()) + ' outstanding'; },
    render: render
  };
})();

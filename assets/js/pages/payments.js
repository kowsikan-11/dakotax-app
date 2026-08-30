/* Payments — settling a period's milk bill, less any advance taken back. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.payments = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;

  function render(root) {
    var s = store.state;
    util.clear(root);

    if (!s.suppliers.length) {
      root.appendChild(ui.empty('No suppliers yet', 'Payments settle a supplier’s milk bill.',
        util.el('a.btn.btn--primary', { href: '#/suppliers' }, 'Go to Suppliers')));
      return;
    }

    var summary = util.el('div.grid.grid--kpi', { style: 'margin-bottom:14px' });
    var due = null;

    var picker = ui.supplierPicker({ suppliers: s.suppliers, includeInactive: true, label: 'Supplier', onChange: function () { clearDue(); } });
    var fromField = ui.field({ label: 'Period from', name: 'periodFrom', type: 'date', value: util.monthStart(s.serverDate), required: true });
    var toField = ui.field({ label: 'Period to', name: 'periodTo', type: 'date', value: s.serverDate, required: true });
    var dateField = ui.field({ label: 'Paid on', name: 'date', type: 'date', value: s.serverDate, required: true });
    var milkField = ui.field({ label: 'Milk amount', name: 'milkAmount', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: true, big: true, placeholder: '0.00' });
    var recoverField = ui.field({ label: 'Advance recovered', name: 'advanceRecovered', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: '0' });
    var modeField = ui.field({
      label: 'Paid by', name: 'mode', type: 'select', value: 'Cash',
      options: ['Cash', 'Bank transfer', 'UPI', 'Cheque', 'Adjusted'].map(function (m) { return { value: m, label: m }; })
    });
    var referenceField = ui.field({ label: 'Reference (optional)', name: 'reference', maxlength: 60, placeholder: 'UTR, cheque number…' });
    var noteField = ui.field({ label: 'Note (optional)', name: 'note', maxlength: 200 });

    var netLine = util.el('p.stat__meta', { text: 'Net paid = milk amount − advance recovered.' });

    function recalc() {
      var milk = Number(milkField.control.value) || 0;
      var recovered = Number(recoverField.control.value) || 0;
      netLine.textContent = 'Net paid: ' + store.money(Math.max(milk - recovered, 0)) +
        '  (' + store.money(milk) + ' milk − ' + store.money(recovered) + ' advance)';
    }
    milkField.control.addEventListener('input', recalc);
    recoverField.control.addEventListener('input', recalc);

    function clearDue() { due = null; util.clear(summary); }

    function calculate() {
      var supplierId = form.querySelector('[name="supplierId"]').value;
      if (!supplierId) {
        ui.setFieldError(picker.control, 'Pick a supplier first.');
        picker.control.focus();
        return;
      }
      ui.busy(calcBtn, true, 'Checking…');
      DX.api.call('payments.due', { supplierId: supplierId, from: fromField.control.value, to: toField.control.value })
        .then(function (result) {
          due = result;
          milkField.control.value = result.suggestedNet.toFixed(2);
          recoverField.control.value = Math.min(result.advanceOutstanding, result.suggestedNet).toFixed(2);
          recalc();
          util.clear(summary);
          [
            ['Litres in period', util.fmtNum(result.litres, 1) + ' L', result.entries + ' entries'],
            ['Milk value', store.money(result.milkAmount), 'At the rates recorded'],
            ['Already paid', store.money(result.alreadyPaid), 'For this exact period'],
            ['Advance outstanding', store.money(result.advanceOutstanding), 'As at ' + util.fmtDate(result.periodTo)]
          ].forEach(function (t) {
            summary.appendChild(util.el('div.card.stat', [
              util.el('p.stat__label', { text: t[0] }),
              util.el('p.stat__value', { text: t[1] }),
              util.el('p.stat__meta', { text: t[2] })
            ]));
          });
          if (result.entries === 0) {
            ui.say.warn('No milk in that period', result.supplierName + ' has no entries between ' +
              util.fmtDate(result.periodFrom) + ' and ' + util.fmtDate(result.periodTo) + '.');
          }
        })
        .catch(function (err) { ui.reportError(err, form); })
        .then(function () { ui.busy(calcBtn, false); });
    }

    var calcBtn = util.el('button.btn', { type: 'button', onclick: calculate }, 'Calculate from the register');
    var saveBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Record payment');

    var form = util.el('form', { novalidate: true }, [
      util.el('div.form-grid.form-grid--wide', [picker, fromField, toField]),
      util.el('div.form-actions', [calcBtn]),
      summary,
      util.el('div.form-grid.form-grid--wide', [milkField, recoverField]),
      util.el('div.form-grid.form-grid--wide', [dateField, modeField, referenceField]),
      noteField,
      util.el('div', { style: 'margin-top:10px' }, [netLine]),
      util.el('div.form-actions', [saveBtn])
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      if (!data.get('supplierId')) {
        ui.setFieldError(picker.control, 'Pick a supplier from the list.');
        return;
      }
      ui.busy(saveBtn, true);
      DX.api.call('payments.save', {
        payment: {
          supplierId: data.get('supplierId'),
          date: data.get('date'),
          periodFrom: data.get('periodFrom'),
          periodTo: data.get('periodTo'),
          milkAmount: data.get('milkAmount'),
          advanceRecovered: data.get('advanceRecovered'),
          mode: data.get('mode'),
          reference: data.get('reference'),
          note: data.get('note')
        }
      }).then(function (result) {
        ui.say.ok('Payment recorded',
          result.payment.supplierName + ' · ' + store.money(result.payment.netAmount) + ' by ' + result.payment.mode);
        return store.refresh();
      }).then(function () { render(root); })
        .catch(function (err) { ui.reportError(err, form); })
        .then(function () { ui.busy(saveBtn, false); });
    });

    recalc();

    root.appendChild(util.el('div.card', [
      util.el('div.card__head', [util.el('h2', 'Pay a supplier'),
        util.el('p', 'Pick the period, let the register do the arithmetic, then confirm')]),
      util.el('div.card__body', [form])
    ]));

    /* --- history --- */
    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Payment history'), util.el('p', 'Most recent first')]),
        util.el('div.card__body', [
          s.payments.length ? ui.table([
            { label: 'Paid on', render: function (r) { return util.fmtDate(r.date); } },
            { key: 'supplierName', label: 'Supplier' },
            { label: 'Period', render: function (r) { return util.fmtDate(r.periodFrom, 'short') + ' – ' + util.fmtDate(r.periodTo, 'short'); } },
            { label: 'Milk', right: true, render: function (r) { return store.money(r.milkAmount); } },
            { label: 'Advance', right: true, render: function (r) { return r.advanceRecovered ? '−' + store.money(r.advanceRecovered) : '—'; } },
            { label: 'Net paid', right: true, render: function (r) { return store.money(r.netAmount); } },
            { key: 'mode', label: 'Mode' },
            { label: '', right: true, render: function (r) {
                return util.el('span.rowactions', [
                  util.el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { remove(r, root); } }, 'Delete')
                ]);
              } }
          ], s.payments) : ui.empty('No payments yet', 'Once you settle a period the payment shows up here.')
        ]),
        s.payments.length ? util.el('div.card__foot', [
          util.el('button.btn.btn--sm', { type: 'button', onclick: function () { exportCsv(s.payments); } }, 'Export CSV')
        ]) : null
      ])
    ]));

    function exportCsv(rows) {
      util.downloadCsv('dakotax-payments-' + s.serverDate + '.csv', util.toCsv(
        ['Paid on', 'Supplier ID', 'Supplier', 'Period from', 'Period to', 'Milk amount', 'Advance recovered', 'Net paid', 'Mode', 'Reference', 'Note'],
        rows.map(function (r) {
          return [r.date, r.supplierId, r.supplierName, r.periodFrom, r.periodTo, r.milkAmount, r.advanceRecovered, r.netAmount, r.mode, r.reference, r.note];
        })
      ));
      ui.say.ok('Payments exported', rows.length + ' rows downloaded as CSV.');
    }
  }

  function remove(payment, root) {
    ui.confirmAction({
      title: 'Delete this payment?',
      message: payment.supplierName + ' · ' + store.money(payment.netAmount) + ' on ' + util.fmtDate(payment.date) +
        '. Any advance recovery recorded with it stays on the Advances sheet — remove it there too if it was a mistake.',
      confirmLabel: 'Delete payment'
    }).then(function (yes) {
      if (!yes) return;
      return DX.api.call('payments.delete', { paymentId: payment.paymentId })
        .then(function () { ui.say.ok('Payment deleted', payment.supplierName); return store.refresh(); })
        .then(function () { render(root); })
        .catch(function (err) { ui.reportError(err); });
    });
  }

  return {
    title: 'Payments',
    subtitle: function () { return store.state.payments.length + ' recorded'; },
    render: render
  };
})();

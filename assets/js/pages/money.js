/* Money — settling up in both directions.
 *
 * Pay     : a supplier's milk bill for a period, less any advance recovered.
 * Collect : cash in from a customer, reducing what they owe.
 */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.money = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var mode = 'pay';
  var MODES = ['Cash', 'Bank transfer', 'UPI', 'Cheque', 'Adjusted'];

  function render(root) {
    util.clear(root);
    root.appendChild(ui.modeSwitch({
      label: 'Which direction',
      value: mode,
      modes: [
        { key: 'pay', short: 'Pay a supplier', icon: ui.arrowOut() },
        { key: 'collect', short: 'Collect from a customer', icon: ui.arrowIn() }
      ],
      onChange: function (next) { mode = next; render(root); }
    }));
    if (mode === 'pay') renderPay(root); else renderCollect(root);
  }

  /* ------------------------------------------------------------------ *
   * Paying a supplier
   * ------------------------------------------------------------------ */
  function renderPay(root) {
    var s = store.state;
    if (!s.suppliers.length) {
      root.appendChild(ui.empty('No suppliers yet', 'A payment settles a supplier’s milk bill.',
        util.el('a.btn.btn--primary', { href: '#/people' }, 'Go to People')));
      return;
    }

    var summary = util.el('div.grid.grid--kpi', { style: 'margin-bottom:14px' });

    var picker = ui.partyPicker({
      people: s.suppliers.map(ui.asSupplier), noun: 'supplier', name: 'supplierId',
      includeInactive: true, label: 'Supplier',
      onChange: function () { util.clear(summary); }
    });
    var fromField = ui.field({ label: 'Period from', name: 'periodFrom', type: 'date', value: util.monthStart(s.serverDate), required: true });
    var toField = ui.field({ label: 'Period to', name: 'periodTo', type: 'date', value: s.serverDate, required: true });
    var dateField = ui.field({ label: 'Paid on', name: 'date', type: 'date', value: s.serverDate, required: true });
    var milkField = ui.field({ label: 'Milk amount', name: 'milkAmount', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: true, big: true, placeholder: '0.00' });
    var recoverField = ui.field({ label: 'Advance recovered', name: 'advanceRecovered', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: '0' });
    var modeField = ui.field({ label: 'Paid by', name: 'mode', type: 'select', value: 'Cash', options: MODES.map(function (m) { return { value: m, label: m }; }) });
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
      if (!data.get('supplierId')) { ui.setFieldError(picker.control, 'Pick a supplier from the list.'); return; }
      ui.busy(saveBtn, true);
      DX.api.call('payments.save', {
        payment: {
          supplierId: data.get('supplierId'), date: data.get('date'),
          periodFrom: data.get('periodFrom'), periodTo: data.get('periodTo'),
          milkAmount: data.get('milkAmount'), advanceRecovered: data.get('advanceRecovered'),
          mode: data.get('mode'), reference: data.get('reference'), note: data.get('note')
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

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Payments out'), util.el('p', 'Most recent first')]),
        util.el('div.card__body', [
          s.payments.length ? ui.table([
            { label: 'Paid on', render: function (r) { return util.fmtDate(r.date); } },
            { key: 'supplierName', label: 'Supplier' },
            { label: 'Period', render: function (r) { return util.fmtDate(r.periodFrom, 'short') + ' – ' + util.fmtDate(r.periodTo, 'short'); } },
            { label: 'Milk', right: true, render: function (r) { return store.money(r.milkAmount); } },
            { label: 'Advance', right: true, render: function (r) { return r.advanceRecovered ? '−' + store.money(r.advanceRecovered) : '—'; } },
            { label: 'Net paid', right: true, render: function (r) { return store.money(r.netAmount); } },
            { key: 'mode', label: 'Mode' },
            {
              label: '', right: true, render: function (r) {
                return util.el('span.rowactions', [
                  util.el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { removePayment(r, root); } }, 'Delete')
                ]);
              }
            }
          ], s.payments) : ui.empty('No payments yet', 'Once you settle a period the payment shows up here.')
        ]),
        s.payments.length ? util.el('div.card__foot', [
          util.el('button.btn.btn--sm', {
            type: 'button',
            onclick: function () {
              util.downloadCsv('dakotax-payments-' + s.serverDate + '.csv', util.toCsv(
                ['Paid on', 'Supplier ID', 'Supplier', 'Period from', 'Period to', 'Milk amount', 'Advance recovered', 'Net paid', 'Mode', 'Reference', 'Note'],
                s.payments.map(function (r) {
                  return [r.date, r.supplierId, r.supplierName, r.periodFrom, r.periodTo, r.milkAmount, r.advanceRecovered, r.netAmount, r.mode, r.reference, r.note];
                })));
              ui.say.ok('Payments exported', s.payments.length + ' rows downloaded as CSV.');
            }
          }, 'Export CSV')
        ]) : null
      ])
    ]));
  }

  /* ------------------------------------------------------------------ *
   * Collecting from a customer
   * ------------------------------------------------------------------ */
  function renderCollect(root) {
    var s = store.state;
    if (!s.customers.length) {
      root.appendChild(ui.empty('No customers yet', 'A receipt is money coming in from a customer.',
        util.el('a.btn.btn--primary', { href: '#/people' }, 'Go to People')));
      return;
    }

    var balanceLine = util.el('p.stat__meta');
    var picker = ui.partyPicker({
      people: s.customers.map(ui.asCustomer), noun: 'customer', name: 'customerId',
      includeInactive: true, label: 'Customer',
      onChange: function (person) {
        if (!person) { balanceLine.textContent = ''; return; }
        var owed = store.owedBy(person.id);
        if (owed > 0.001) {
          balanceLine.textContent = person.name + ' owes ' + store.money(owed) + '.';
          amountField.control.value = owed.toFixed(2);
        } else if (owed < -0.001) {
          balanceLine.textContent = person.name + ' is already ' + store.money(-owed) + ' in credit.';
        } else {
          balanceLine.textContent = person.name + ' is settled up. Anything you take now counts as credit.';
        }
      }
    });

    var dateField = ui.field({ label: 'Received on', name: 'date', type: 'date', value: s.serverDate, max: s.serverDate, required: true });
    var amountField = ui.field({ label: 'Amount received', name: 'amount', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: true, big: true, placeholder: '0.00' });
    var modeField = ui.field({ label: 'Received by', name: 'mode', type: 'select', value: 'Cash', options: MODES.map(function (m) { return { value: m, label: m }; }) });
    var referenceField = ui.field({ label: 'Reference (optional)', name: 'reference', maxlength: 60, placeholder: 'UPI ref, cheque number…' });
    var noteField = ui.field({ label: 'Note (optional)', name: 'note', maxlength: 200 });

    var saveBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Record receipt');
    var form = util.el('form', { novalidate: true }, [
      util.el('div.form-grid.form-grid--wide', [picker, dateField]),
      util.el('div.form-grid.form-grid--wide', [amountField, modeField, referenceField]),
      noteField,
      util.el('div', { style: 'margin-top:10px' }, [balanceLine]),
      util.el('div.form-actions', [saveBtn])
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      if (!data.get('customerId')) {
        ui.setFieldError(picker.control, 'Pick a customer from the list.');
        picker.control.focus();
        return;
      }
      ui.busy(saveBtn, true);
      DX.api.call('receipts.save', {
        receipt: {
          customerId: data.get('customerId'), date: data.get('date'),
          amount: data.get('amount'), mode: data.get('mode'),
          reference: data.get('reference'), note: data.get('note')
        }
      }).then(function (result) {
        var left = result.balance;
        ui.say.ok('Receipt recorded',
          result.receipt.customerName + ' · ' + store.money(result.receipt.amount) + ' by ' + result.receipt.mode +
          ' · ' + (left > 0.001 ? store.money(left) + ' still owing' : left < -0.001 ? store.money(-left) + ' in credit' : 'settled up'));
        if (result.warning) ui.say.warn('Possible double entry', result.warning);
        return store.refresh();
      }).then(function () { render(root); })
        .catch(function (err) { ui.reportError(err, form); })
        .then(function () { ui.busy(saveBtn, false); });
    });

    root.appendChild(util.el('div.card', [
      util.el('div.card__head', [util.el('h2', 'Collect from a customer'),
        util.el('p', 'Every receipt reduces what they owe; paying ahead shows as credit')]),
      util.el('div.card__body', [form])
    ]));

    /* who owes what */
    var owing = s.customers
      .map(function (c) { return { customer: c, balance: store.owedBy(c.customerId) }; })
      .filter(function (r) { return Math.abs(r.balance) > 0.001; })
      .sort(function (a, b) { return b.balance - a.balance; });

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Outstanding by customer'),
          util.el('p', 'Delivered minus received, all time')]),
        util.el('div.card__body', [
          owing.length ? ui.table([
            { label: 'Customer', render: function (r) { return r.customer.name; } },
            { label: 'ID', render: function (r) { return r.customer.customerId; } },
            { label: 'Address', render: function (r) { return r.customer.address; } },
            {
              label: 'Balance', right: true, render: function (r) {
                return r.balance > 0
                  ? store.money(r.balance)
                  : util.el('span.credit', store.money(-r.balance) + ' cr');
              }
            }
          ], owing) : ui.empty('Everyone is settled up', 'No customer owes you money and nobody is in credit.')
        ]),
        owing.length ? util.el('div.card__foot', { text: 'Total still owed to you: ' + store.money(store.totalReceivable()) }) : null
      ])
    ]));

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Money in'), util.el('p', 'Most recent first')]),
        util.el('div.card__body', [
          s.receipts.length ? ui.table([
            { label: 'Received on', render: function (r) { return util.fmtDate(r.date); } },
            { key: 'customerName', label: 'Customer' },
            { label: 'Amount', right: true, render: function (r) { return store.money(r.amount); } },
            { key: 'mode', label: 'Mode' },
            { key: 'reference', label: 'Reference' },
            {
              label: '', right: true, render: function (r) {
                return util.el('span.rowactions', [
                  util.el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { removeReceipt(r, root); } }, 'Delete')
                ]);
              }
            }
          ], s.receipts) : ui.empty('No receipts yet', 'Money you collect from customers will be listed here.')
        ]),
        s.receipts.length ? util.el('div.card__foot', [
          util.el('button.btn.btn--sm', {
            type: 'button',
            onclick: function () {
              util.downloadCsv('dakotax-receipts-' + s.serverDate + '.csv', util.toCsv(
                ['Received on', 'Customer ID', 'Customer', 'Amount', 'Mode', 'Reference', 'Note'],
                s.receipts.map(function (r) { return [r.date, r.customerId, r.customerName, r.amount, r.mode, r.reference, r.note]; })));
              ui.say.ok('Receipts exported', s.receipts.length + ' rows downloaded as CSV.');
            }
          }, 'Export CSV')
        ]) : null
      ])
    ]));
  }

  function removePayment(payment, root) {
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

  function removeReceipt(receipt, root) {
    ui.confirmAction({
      title: 'Delete this receipt?',
      message: receipt.customerName + ' · ' + store.money(receipt.amount) + ' on ' + util.fmtDate(receipt.date) +
        '. Their balance goes back up by that amount.',
      confirmLabel: 'Delete receipt'
    }).then(function (yes) {
      if (!yes) return;
      return DX.api.call('receipts.delete', { receiptId: receipt.receiptId })
        .then(function () { ui.say.ok('Receipt deleted', receipt.customerName); return store.refresh(); })
        .then(function () { render(root); })
        .catch(function (err) { ui.reportError(err); });
    });
  }

  return {
    title: 'Money',
    subtitle: function () {
      return store.money(store.totalReceivable()) + ' owed to you · ' +
        store.money(store.totalOutstanding()) + ' advanced out';
    },
    render: render
  };
})();

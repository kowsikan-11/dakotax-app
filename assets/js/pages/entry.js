/* Daily entry — both sides of the book on one page.
 *
 * Buy  : milk collected from a supplier. Money will flow out to them.
 * Sell : milk delivered to a customer.  Money will flow in from them.
 *
 * Date and shift come from the clock and can be overridden; the duplicate
 * guard (date + party + shift) is the same on both sides.
 */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.entry = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var mode = 'buy';
  var editing = null;

  var SIDES = {
    buy: {
      noun: 'supplier', title: 'Record milk in', lead: 'Collected from a supplier — money you will pay out',
      people: function () { return store.state.suppliers.map(ui.asSupplier); },
      active: function () { return store.activeSuppliers().length; },
      action: 'collections.save', deleteAction: 'collections.delete',
      idField: 'supplierId', recordKey: 'entry', payloadKey: 'entry', rowIdKey: 'entryId',
      rows: function (date, shift) {
        return store.collectionsOn(date).filter(function (r) { return r.shift === shift; });
      },
      nameOf: function (r) { return r.supplierName; },
      rate: function (person) { return (person && person.ratePerLitre) || store.defaultRate(); },
      balanceNote: function (person) {
        var balance = store.balanceFor(person.id);
        return balance > 0
          ? person.name + ' has ' + store.money(balance) + ' of advance outstanding.'
          : person.name + ' has no advance outstanding.';
      },
      emptyTitle: 'No active suppliers',
      emptyBody: 'Milk in is recorded against a supplier, so add one first.'
    },
    sell: {
      noun: 'customer', title: 'Record milk out', lead: 'Delivered to a customer — money you will collect',
      people: function () { return store.state.customers.map(ui.asCustomer); },
      active: function () { return store.activeCustomers().length; },
      action: 'sales.save', deleteAction: 'sales.delete',
      idField: 'customerId', recordKey: 'sale', payloadKey: 'sale', rowIdKey: 'saleId',
      rows: function (date, shift) {
        return store.salesOn(date).filter(function (r) { return r.shift === shift; });
      },
      nameOf: function (r) { return r.customerName; },
      rate: function (person) { return (person && person.ratePerLitre) || store.defaultSaleRate(); },
      balanceNote: function (person) {
        var owed = store.owedBy(person.id);
        if (owed > 0.001) return person.name + ' owes ' + store.money(owed) + ' so far.';
        if (owed < -0.001) return person.name + ' is ' + store.money(-owed) + ' in credit.';
        return person.name + ' is settled up.';
      },
      emptyTitle: 'No active customers',
      emptyBody: 'Milk out is recorded against a customer, so add one first.'
    }
  };

  function sunIcon() {
    return util.el('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' });
  }
  function moonIcon() {
    return util.el('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>' });
  }

  function render(root) {
    var s = store.state;
    var side = SIDES[mode];
    util.clear(root);

    root.appendChild(ui.modeSwitch({
      label: 'Which side of the book',
      value: mode,
      modes: [
        { key: 'buy', short: 'Milk in', tail: 'from a supplier', icon: ui.arrowIn() },
        { key: 'sell', short: 'Milk out', tail: 'to a customer', icon: ui.arrowOut() }
      ],
      onChange: function (next) { mode = next; editing = null; render(root); }
    }));

    if (!side.active()) {
      root.appendChild(ui.empty(side.emptyTitle, side.emptyBody,
        util.el('a.btn.btn--primary', { href: '#/people' }, 'Go to People')));
      return;
    }

    var autoShift = util.detectShift(s.settings.shift_cutover_hour);
    var current = editing;
    var shiftValue = current ? current.shift : s.shift;

    var balanceLine = util.el('p.stat__meta');
    var picker = ui.partyPicker({
      people: side.people(),
      noun: side.noun,
      name: side.idField,
      label: side.noun === 'supplier' ? 'Supplier' : 'Customer',
      hint: 'Type a name, a mobile number or the short ID.',
      onChange: function (person) {
        if (person && person.ratePerLitre && !current) {
          rateField.control.value = person.ratePerLitre;
          recalc();
        }
        balanceLine.textContent = person ? side.balanceNote(person) : '';
      }
    });

    var dateField = ui.field({
      label: 'Date', name: 'date', type: 'date',
      value: current ? current.date : s.serverDate,
      max: s.settings.allow_future_dates === 'yes' ? null : s.serverDate,
      required: true
    });

    var litresField = ui.field({
      label: 'Litres', name: 'litres', type: 'number', step: '0.1', min: '0',
      inputmode: 'decimal', big: true, required: true,
      value: current ? current.litres : '', placeholder: '0.0'
    });

    var rateField = ui.field({
      label: 'Rate per litre', name: 'ratePerLitre', type: 'number', step: '0.01', min: '0',
      inputmode: 'decimal', required: true,
      value: current ? current.ratePerLitre : side.rate(null),
      hint: 'Filled from the ' + side.noun + ', or from Settings.'
    });

    var fatField = ui.field({ label: 'Fat % (optional)', name: 'fat', type: 'number', step: '0.1', min: '0', max: '15', inputmode: 'decimal', value: current && current.fat !== null && current.fat !== undefined ? current.fat : '' });
    var snfField = ui.field({ label: 'SNF % (optional)', name: 'snf', type: 'number', step: '0.1', min: '0', max: '15', inputmode: 'decimal', value: current && current.snf !== null && current.snf !== undefined ? current.snf : '' });
    var noteField = ui.field({ label: 'Note (optional)', name: 'note', type: 'text', maxlength: 200, value: current ? current.note : '' });

    var shiftName = 'shift-' + Math.random().toString(36).slice(2, 7);
    var shiftPick = util.el('div.shiftpick', [
      util.el('p.shiftpick__label', { text: 'Shift' }),
      util.el('div.shiftpick__row', [
        util.el('input', { type: 'radio', id: shiftName + '-m', name: 'shift', value: 'Morning', checked: shiftValue === 'Morning' || null }),
        util.el('label', { for: shiftName + '-m' }, [sunIcon(), 'Morning']),
        util.el('input', { type: 'radio', id: shiftName + '-e', name: 'shift', value: 'Evening', checked: shiftValue === 'Evening' || null }),
        util.el('label', { for: shiftName + '-e' }, [moonIcon(), 'Evening'])
      ]),
      util.el('p.shiftpick__note', [
        'It is ', util.el('b', util.clockLabel()), ', so the ',
        util.el('b', autoShift.toLowerCase()), ' round is picked. Change it if you are catching up on the other one.'
      ])
    ]);

    var amountLine = util.el('p.stat__meta', { text: 'Enter litres to see the amount.' });

    function recalc() {
      var litres = Number(litresField.control.value);
      var rate = Number(rateField.control.value);
      amountLine.textContent = (litres > 0 && rate > 0)
        ? util.fmtNum(litres, 1) + ' L × ' + util.fmtNum(rate, 2) + ' = ' + store.money(litres * rate) +
          (mode === 'buy' ? ' payable to them' : ' owed by them')
        : 'Enter litres to see the amount.';
    }

    litresField.control.addEventListener('input', recalc);
    rateField.control.addEventListener('input', recalc);
    shiftPick.querySelectorAll('input[name="shift"]').forEach(function (input) {
      input.addEventListener('change', function () { store.applyShift(input.value, input.value === autoShift); });
    });

    var saveBtn = util.el('button.btn.btn--shift', { type: 'submit' },
      current ? 'Update entry' : (mode === 'buy' ? 'Save entry' : 'Save delivery'));

    var form = util.el('form', { novalidate: true }, [
      util.el('div.form-grid.form-grid--wide', [picker, dateField]),
      util.el('div.form-grid.form-grid--wide', [shiftPick, litresField]),
      mode === 'buy'
        ? util.el('div.form-grid', [rateField, fatField, snfField])
        : util.el('div.form-grid', [rateField]),
      noteField,
      util.el('div', { style: 'margin-top:12px' }, [amountLine, balanceLine]),
      util.el('div.form-actions', [
        saveBtn,
        current ? util.el('button.btn', { type: 'button', onclick: function () { editing = null; render(root); } }, 'Cancel edit') : null,
        util.el('button.btn.btn--ghost', {
          type: 'button',
          onclick: function () { form.reset(); picker.clear(); recalc(); balanceLine.textContent = ''; }
        }, 'Clear')
      ])
    ]);

    if (current) picker.setValue(current[side.idField]);
    recalc();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      var record = {
        date: data.get('date'),
        shift: data.get('shift'),
        litres: data.get('litres'),
        ratePerLitre: data.get('ratePerLitre'),
        note: data.get('note')
      };
      record[side.idField] = data.get(side.idField);
      record[side.rowIdKey] = current ? current[side.rowIdKey] : null;
      if (mode === 'buy') { record.fat = data.get('fat'); record.snf = data.get('snf'); }

      if (!record[side.idField]) {
        ui.setFieldError(picker.control, 'Pick a ' + side.noun + ' from the list.');
        picker.control.focus();
        return;
      }
      if (!record.shift) {
        ui.say.warn('Choose a shift', 'Morning or Evening — the app guesses from the clock but will not save without one.');
        return;
      }

      var payload = {};
      payload[side.payloadKey] = record;

      ui.busy(saveBtn, true);
      DX.api.call(side.action, payload).then(function (result) {
        var saved = result[side.recordKey];
        ui.say.ok(
          result.created ? (mode === 'buy' ? 'Entry saved' : 'Delivery saved') : 'Entry updated',
          side.nameOf(saved) + ' · ' + saved.shift + ' · ' + util.fmtNum(saved.litres, 1) + ' L · ' + store.money(saved.amount)
        );
        editing = null;
        return store.refresh();
      }).then(function () {
        render(root);
      }).catch(function (err) {
        ui.reportError(err, form);
      }).then(function () {
        ui.busy(saveBtn, false);
      });
    });

    root.appendChild(util.el('div.card', [
      util.el('div.card__head', [
        util.el('h2', current ? 'Edit entry' : side.title),
        util.el('p', current ? 'Saved ' + util.fmtDate(current.date) : side.lead)
      ]),
      util.el('div.card__body', [form])
    ]));

    /* what has been recorded so far in this round, on this side */
    var listDate = dateField.control.value || s.serverDate;
    var rows = side.rows(listDate, shiftValue || s.shift)
      .slice().sort(function (a, b) { return String(b.recordedAt).localeCompare(String(a.recordedAt)); });

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [
          util.el('h2', mode === 'buy' ? 'Collected this round' : 'Delivered this round'),
          util.el('p', util.fmtDate(listDate) + ' · ' + (shiftValue || s.shift))
        ]),
        util.el('div.card__body', [
          rows.length ? ui.table([
            { label: mode === 'buy' ? 'Supplier' : 'Customer', render: side.nameOf },
            { label: 'Litres', right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
            { label: 'Rate', right: true, render: function (r) { return util.fmtNum(r.ratePerLitre, 2); } },
            { label: 'Value', right: true, render: function (r) { return store.money(r.amount); } },
            {
              label: '', right: true, render: function (r) {
                return util.el('span.rowactions', [
                  util.el('button.btn.btn--sm', {
                    type: 'button',
                    onclick: function () { editing = r; render(root); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                  }, 'Edit'),
                  util.el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { remove(r, root); } }, 'Delete')
                ]);
              }
            }
          ], rows) : ui.empty(
            'Nothing in this round yet',
            mode === 'buy'
              ? 'Entries you save appear here so you can check them before the tanker leaves.'
              : 'Deliveries you save appear here so you can check the round before the van goes out.'
          )
        ]),
        rows.length ? util.el('div.card__foot', {
          text: rows.length + (rows.length === 1 ? ' entry · ' : ' entries · ') +
            util.fmtNum(util.sum(rows, 'litres'), 1) + ' L · ' + store.money(util.sum(rows, 'amount'))
        }) : null
      ])
    ]));
  }

  function remove(row, root) {
    var side = SIDES[mode];
    var payload = {};
    payload[side.rowIdKey] = row[side.rowIdKey];
    ui.confirmAction({
      title: mode === 'buy' ? 'Delete this entry?' : 'Delete this delivery?',
      message: side.nameOf(row) + ' · ' + row.shift + ' · ' + util.fmtNum(row.litres, 1) + ' L on ' +
        util.fmtDate(row.date) + '. This removes the row from the sheet.',
      confirmLabel: 'Delete'
    }).then(function (yes) {
      if (!yes) return;
      return DX.api.call(side.deleteAction, payload)
        .then(function () { ui.say.ok('Deleted', side.nameOf(row) + ' · ' + util.fmtDate(row.date)); return store.refresh(); })
        .then(function () { render(root); })
        .catch(function (err) { ui.reportError(err); });
    });
  }

  return {
    title: 'Daily entry',
    subtitle: function () {
      return (mode === 'buy' ? 'Milk in' : 'Milk out') + ' · ' + DX.store.state.shift + ' round · ' +
        util.fmtDate(DX.store.state.serverDate);
    },
    render: render,
    reset: function () { editing = null; }
  };
})();

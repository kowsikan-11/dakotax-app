/* Daily note entry — the page a clerk lives on twice a day.
 * Date and shift are filled in from the clock; both can be overridden. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.collection = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var editing = null;

  function sunIcon() {
    return util.el('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' });
  }
  function moonIcon() {
    return util.el('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>' });
  }

  function render(root) {
    var s = store.state;
    util.clear(root);

    if (!store.activeSuppliers().length) {
      root.appendChild(ui.empty(
        'No active suppliers',
        'Milk is recorded against a supplier, so add one first.',
        util.el('a.btn.btn--primary', { href: '#/suppliers' }, 'Go to Suppliers')
      ));
      return;
    }

    var autoShift = util.detectShift(s.settings.shift_cutover_hour);
    var current = editing || null;
    var shiftValue = current ? current.shift : s.shift;

    var picker = ui.supplierPicker({
      suppliers: s.suppliers,
      label: 'Supplier',
      hint: 'Type a name, a mobile number or the short ID.',
      onChange: function (supplier) {
        if (supplier && supplier.ratePerLitre && !current) {
          rateField.control.value = supplier.ratePerLitre;
          recalc();
        }
        renderBalance(supplier);
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
      value: current ? current.litres : '',
      placeholder: '0.0'
    });

    var rateField = ui.field({
      label: 'Rate per litre', name: 'ratePerLitre', type: 'number', step: '0.01', min: '0',
      inputmode: 'decimal', required: true,
      value: current ? current.ratePerLitre : store.defaultRate(),
      hint: 'Filled from the supplier, or from Settings.'
    });

    var fatField = ui.field({ label: 'Fat % (optional)', name: 'fat', type: 'number', step: '0.1', min: '0', max: '15', inputmode: 'decimal', value: current && current.fat !== null ? current.fat : '' });
    var snfField = ui.field({ label: 'SNF % (optional)', name: 'snf', type: 'number', step: '0.1', min: '0', max: '15', inputmode: 'decimal', value: current && current.snf !== null ? current.snf : '' });
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
    var balanceLine = util.el('p.stat__meta');

    function recalc() {
      var litres = Number(litresField.control.value);
      var rate = Number(rateField.control.value);
      if (litres > 0 && rate > 0) {
        amountLine.textContent = util.fmtNum(litres, 1) + ' L × ' + util.fmtNum(rate, 2) + ' = ' + store.money(litres * rate);
      } else {
        amountLine.textContent = 'Enter litres to see the amount.';
      }
    }

    function renderBalance(supplier) {
      if (!supplier) { balanceLine.textContent = ''; return; }
      var balance = store.balanceFor(supplier.supplierId);
      balanceLine.textContent = balance > 0
        ? supplier.name + ' has ' + store.money(balance) + ' of advance outstanding.'
        : supplier.name + ' has no advance outstanding.';
    }

    litresField.control.addEventListener('input', recalc);
    rateField.control.addEventListener('input', recalc);
    shiftPick.querySelectorAll('input[name="shift"]').forEach(function (input) {
      input.addEventListener('change', function () { store.applyShift(input.value, input.value === autoShift); });
    });

    var saveBtn = util.el('button.btn.btn--shift', { type: 'submit' }, current ? 'Update entry' : 'Save entry');
    var form = util.el('form', { novalidate: true }, [
      util.el('div.form-grid.form-grid--wide', [picker, dateField]),
      util.el('div.form-grid.form-grid--wide', [shiftPick, litresField]),
      util.el('div.form-grid', [rateField, fatField, snfField]),
      noteField,
      util.el('div', { style: 'margin-top:12px' }, [amountLine, balanceLine]),
      util.el('div.form-actions', [
        saveBtn,
        current ? util.el('button.btn', { type: 'button', onclick: function () { editing = null; render(root); } }, 'Cancel edit') : null,
        util.el('button.btn.btn--ghost', { type: 'button', onclick: function () { form.reset(); picker.clear(); recalc(); balanceLine.textContent = ''; } }, 'Clear')
      ])
    ]);

    if (current) picker.setValue(current.supplierId);
    recalc();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      var entry = {
        entryId: current ? current.entryId : null,
        supplierId: data.get('supplierId'),
        date: data.get('date'),
        shift: data.get('shift'),
        litres: data.get('litres'),
        ratePerLitre: data.get('ratePerLitre'),
        fat: data.get('fat'),
        snf: data.get('snf'),
        note: data.get('note')
      };

      if (!entry.supplierId) {
        ui.setFieldError(picker.control, 'Pick a supplier from the list.');
        picker.control.focus();
        return;
      }
      if (!entry.shift) {
        ui.say.warn('Choose a shift', 'Morning or Evening — the app guesses from the clock but will not save without one.');
        return;
      }

      ui.busy(saveBtn, true);
      DX.api.call('collections.save', { entry: entry }).then(function (result) {
        var supplier = store.supplier(entry.supplierId);
        ui.say.ok(
          result.created ? 'Entry saved' : 'Entry updated',
          (supplier ? supplier.name : entry.supplierId) + ' · ' + entry.shift + ' · ' +
          util.fmtNum(result.entry.litres, 1) + ' L · ' + store.money(result.entry.amount)
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
        util.el('h2', current ? 'Edit entry' : 'Record milk'),
        util.el('p', current ? 'Saved ' + util.fmtDate(current.date) : 'One entry per supplier, per date, per shift')
      ]),
      util.el('div.card__body', [form])
    ]));

    /* What has been recorded so far in this shift ------------------------ */
    var dayRows = store.collectionsOn(dateField.control.value || s.serverDate)
      .filter(function (c) { return c.shift === (shiftValue || s.shift); })
      .sort(function (a, b) { return String(b.recordedAt).localeCompare(String(a.recordedAt)); });

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [
          util.el('h2', 'Recorded this round'),
          util.el('p', util.fmtDate(dateField.control.value || s.serverDate) + ' · ' + (shiftValue || s.shift))
        ]),
        util.el('div.card__body', [
          dayRows.length ? ui.table([
            { key: 'supplierName', label: 'Supplier' },
            { label: 'Litres', right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
            { label: 'Rate', right: true, render: function (r) { return util.fmtNum(r.ratePerLitre, 2); } },
            { label: 'Value', right: true, render: function (r) { return store.money(r.amount); } },
            {
              label: '', right: true, render: function (r) {
                return util.el('span.rowactions', [
                  util.el('button.btn.btn--sm', {
                    type: 'button', onclick: function () { editing = r; render(root); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                  }, 'Edit'),
                  util.el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: function () { remove(r, root); } }, 'Delete')
                ]);
              }
            }
          ], dayRows) : ui.empty('Nothing in this round yet', 'Entries you save appear here so you can check them before the tanker leaves.')
        ]),
        dayRows.length ? util.el('div.card__foot', {
          text: dayRows.length + ' entries · ' + util.fmtNum(util.sum(dayRows, 'litres'), 1) + ' L · ' + store.money(util.sum(dayRows, 'amount'))
        }) : null
      ])
    ]));
  }

  function remove(entry, root) {
    ui.confirmAction({
      title: 'Delete this entry?',
      message: entry.supplierName + ' · ' + entry.shift + ' · ' + util.fmtNum(entry.litres, 1) + ' L on ' + util.fmtDate(entry.date) + '. This removes the row from the sheet.',
      confirmLabel: 'Delete entry'
    }).then(function (yes) {
      if (!yes) return;
      return DX.api.call('collections.delete', { entryId: entry.entryId }).then(function () {
        ui.say.ok('Entry deleted', entry.supplierName + ' · ' + util.fmtDate(entry.date));
        return store.refresh();
      }).then(function () { render(root); })
        .catch(function (err) { ui.reportError(err); });
    });
  }

  return {
    title: 'Daily entry',
    subtitle: function () { return DX.store.state.shift + ' round · ' + util.fmtDate(DX.store.state.serverDate); },
    render: render,
    reset: function () { editing = null; }
  };
})();

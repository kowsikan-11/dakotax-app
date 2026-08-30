/* Suppliers — the master list every other page reads from. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.suppliers = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var query = '';
  var showInactive = false;

  function openForm(supplier, root) {
    var isNew = !supplier;
    var idField = ui.field({
      label: 'Supplier ID', name: 'supplierId', required: true, maxlength: 20,
      value: supplier ? supplier.supplierId : suggestId(),
      hint: 'Short code on the can — letters, numbers, hyphen. Cannot be changed later.'
    });
    if (!isNew) idField.control.readOnly = true;

    var nameField = ui.field({ label: 'Name', name: 'name', required: true, maxlength: 80, value: supplier ? supplier.name : '', autocomplete: 'name' });
    var mobileField = ui.field({ label: 'Mobile', name: 'mobile', type: 'tel', inputmode: 'tel', maxlength: 16, value: supplier ? supplier.mobile : '', hint: '6 to 15 digits.' });
    var villageField = ui.field({ label: 'Village or route', name: 'village', maxlength: 80, value: supplier ? supplier.village : '' });
    var rateField = ui.field({
      label: 'Rate per litre', name: 'ratePerLitre', type: 'number', step: '0.01', min: '0', inputmode: 'decimal',
      value: supplier && supplier.ratePerLitre ? supplier.ratePerLitre : store.defaultRate(),
      hint: 'Suggested on every entry for this supplier.'
    });
    var statusField = ui.field({
      label: 'Status', name: 'status', type: 'select', value: supplier ? supplier.status : 'Active',
      options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive — no new entries' }]
    });

    var saveBtn = util.el('button.btn.btn--primary', { type: 'submit' }, isNew ? 'Add supplier' : 'Save changes');
    var form = util.el('form', { novalidate: true }, [
      util.el('div.card__body', [
        util.el('div.form-grid', [idField, nameField]),
        util.el('div.form-grid', [mobileField, villageField]),
        util.el('div.form-grid', [rateField, statusField]),
        util.el('div.form-actions', [
          saveBtn,
          util.el('button.btn', { type: 'button', onclick: function () { dialog.close(); dialog.remove(); } }, 'Cancel')
        ])
      ])
    ]);

    var dialog = util.el('dialog.sheet', [
      util.el('div.card__head', [util.el('h2', isNew ? 'Add supplier' : 'Edit ' + supplier.name)]),
      form
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.clearFieldErrors(form);
      var data = new FormData(form);
      var payload = {
        mode: isNew ? 'create' : 'update',
        supplierId: data.get('supplierId'),
        name: data.get('name'),
        mobile: data.get('mobile'),
        village: data.get('village'),
        ratePerLitre: data.get('ratePerLitre'),
        status: data.get('status')
      };
      ui.busy(saveBtn, true);
      DX.api.call('suppliers.save', { supplier: payload }).then(function (result) {
        ui.say.ok(result.created ? 'Supplier added' : 'Supplier saved', payload.name + ' · ' + payload.supplierId);
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

  function suggestId() {
    var numbers = store.state.suppliers
      .map(function (s) { return /^S(\d+)$/.exec(s.supplierId); })
      .filter(Boolean).map(function (m) { return Number(m[1]); });
    var next = numbers.length ? Math.max.apply(null, numbers) + 1 : 1;
    return 'S' + util.pad(next).padStart(3, '0');
  }

  function toggleStatus(supplier, root) {
    var next = supplier.status === 'Active' ? 'Inactive' : 'Active';
    DX.api.call('suppliers.setStatus', { supplierId: supplier.supplierId, status: next })
      .then(function () {
        ui.say.ok(supplier.name + ' is now ' + next.toLowerCase(),
          next === 'Inactive' ? 'Past records stay on the sheet; no new milk can be recorded.' : 'They can be picked on the entry page again.');
        return store.refresh();
      })
      .then(function () { render(root); })
      .catch(function (err) { ui.reportError(err); });
  }

  function render(root) {
    var s = store.state;
    util.clear(root);

    var searchField = ui.field({ label: 'Search', name: 'q', value: query, placeholder: 'Name, ID, mobile or village' });
    searchField.control.addEventListener('input', util.debounce(function () {
      query = searchField.control.value;
      renderTable();
    }, 150));

    var inactiveToggle = util.el('label.field', [
      util.el('span', { text: 'Show inactive', style: 'font-size:.78rem;font-weight:650;color:var(--ink-2)' }),
      util.el('select', {
        onchange: function (e) { showInactive = e.target.value === 'yes'; renderTable(); }
      }, [
        util.el('option', { value: 'no', selected: !showInactive || null }, 'Active only'),
        util.el('option', { value: 'yes', selected: showInactive || null }, 'Active and inactive')
      ])
    ]);

    root.appendChild(util.el('div.filters', [
      searchField, inactiveToggle,
      util.el('div.filters__actions', [
        util.el('button.btn.btn--primary', { type: 'button', onclick: function () { openForm(null, root); } }, 'Add supplier'),
        util.el('button.btn', { type: 'button', onclick: exportCsv }, 'Export CSV')
      ])
    ]));

    var tableHost = util.el('div.card');
    root.appendChild(tableHost);

    function visible() {
      var q = query.trim().toLowerCase();
      return s.suppliers.filter(function (sup) {
        if (!showInactive && sup.status === 'Inactive') return false;
        if (!q) return true;
        return [sup.name, sup.supplierId, sup.mobile, sup.village].join(' ').toLowerCase().indexOf(q) > -1;
      });
    }

    function exportCsv() {
      var rows = visible().map(function (sup) {
        return [sup.supplierId, sup.name, sup.mobile, sup.village, sup.ratePerLitre, sup.status, store.balanceFor(sup.supplierId)];
      });
      util.downloadCsv('dakotax-suppliers-' + s.serverDate + '.csv',
        util.toCsv(['Supplier ID', 'Name', 'Mobile', 'Village', 'Rate per litre', 'Status', 'Advance outstanding'], rows));
      ui.say.ok('Suppliers exported', rows.length + ' rows downloaded as CSV.');
    }

    function renderTable() {
      util.clear(tableHost);
      var rows = visible();
      tableHost.appendChild(util.el('div.card__body', [
        rows.length ? ui.table([
          { key: 'supplierId', label: 'ID' },
          { key: 'name', label: 'Name' },
          { key: 'mobile', label: 'Mobile' },
          { key: 'village', label: 'Village' },
          { label: 'Rate', right: true, render: function (r) { return r.ratePerLitre ? util.fmtNum(r.ratePerLitre, 2) : '—'; } },
          { label: 'Advance', right: true, render: function (r) {
              var balance = store.balanceFor(r.supplierId);
              return balance > 0 ? store.money(balance) : '—';
            } },
          { label: 'Status', render: function (r) { return ui.chip(r.status, r.status === 'Active' ? 'good' : 'muted'); } },
          { label: '', right: true, render: function (r) {
              return util.el('span.rowactions', [
                util.el('button.btn.btn--sm', { type: 'button', onclick: function () { openForm(r, root); } }, 'Edit'),
                util.el('button.btn.btn--sm', { type: 'button', onclick: function () { toggleStatus(r, root); } },
                  r.status === 'Active' ? 'Deactivate' : 'Reactivate')
              ]);
            } }
        ], rows) : ui.empty(
          query ? 'No supplier matches "' + query + '"' : 'No suppliers yet',
          query ? 'Try part of a name, the short ID, or a mobile number.' : 'Add the people who bring milk to this centre.',
          util.el('button.btn.btn--primary', { type: 'button', onclick: function () { openForm(null, root); } }, 'Add supplier')
        )
      ]));
      tableHost.appendChild(util.el('div.card__foot', {
        text: rows.length + ' of ' + s.suppliers.length + ' suppliers shown'
      }));
    }

    renderTable();
  }

  return { title: 'Suppliers', subtitle: function () { return store.state.suppliers.length + ' on the register'; }, render: render };
})();

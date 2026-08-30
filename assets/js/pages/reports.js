/* Reports — a period, a filter, and numbers you can hand to an accountant. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.reports = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var filter = null;
  var result = null;

  function defaults() {
    var s = store.state;
    return { from: util.monthStart(s.serverDate), to: s.serverDate, supplierId: '', shift: '' };
  }

  function render(root) {
    var s = store.state;
    if (!filter) filter = defaults();
    util.clear(root);

    var fromField = ui.field({ label: 'From', name: 'from', type: 'date', value: filter.from });
    var toField = ui.field({ label: 'To', name: 'to', type: 'date', value: filter.to });
    var supplierField = ui.field({
      label: 'Supplier', name: 'supplierId', type: 'select', value: filter.supplierId,
      options: [{ value: '', label: 'All suppliers' }].concat(s.suppliers.map(function (sup) {
        return { value: sup.supplierId, label: sup.name + ' (' + sup.supplierId + ')' };
      }))
    });
    var shiftField = ui.field({
      label: 'Shift', name: 'shift', type: 'select', value: filter.shift,
      options: [{ value: '', label: 'Both shifts' }, { value: 'Morning', label: 'Morning only' }, { value: 'Evening', label: 'Evening only' }]
    });

    var runBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Run report');
    var filters = util.el('form.filters', { novalidate: true }, [
      fromField, toField, supplierField, shiftField,
      util.el('div.filters__actions', [
        runBtn,
        util.el('button.btn', { type: 'button', onclick: function () { filter = defaults(); result = null; render(root); } }, 'This month')
      ])
    ]);

    var quick = util.el('div.section__head', [
      util.el('span', { text: 'Quick range:', style: 'font-size:.78rem;color:var(--ink-3)' })
    ]);
    [
      ['Today', function () { return { from: s.serverDate, to: s.serverDate }; }],
      ['Last 7 days', function () { return { from: util.addDays(s.serverDate, -6), to: s.serverDate }; }],
      ['This month', function () { return { from: util.monthStart(s.serverDate), to: s.serverDate }; }],
      ['Last month', function () {
        var lastEnd = util.addDays(util.monthStart(s.serverDate), -1);
        return { from: util.monthStart(lastEnd), to: lastEnd };
      }]
    ].forEach(function (preset) {
      quick.appendChild(util.el('button.btn.btn--sm', {
        type: 'button',
        onclick: function () {
          var range = preset[1]();
          filter = Object.assign({}, filter, range);
          run(root);
        }
      }, preset[0]));
    });

    filters.addEventListener('submit', function (e) {
      e.preventDefault();
      filter = {
        from: fromField.control.value, to: toField.control.value,
        supplierId: supplierField.control.value, shift: shiftField.control.value
      };
      run(root);
    });

    root.appendChild(filters);
    root.appendChild(quick);

    var host = util.el('div#report-body');
    root.appendChild(host);

    if (result) drawResult(host, root);
    else host.appendChild(ui.empty('No report run yet',
      'Pick a period above and choose Run report. The default is this month to date.',
      util.el('button.btn.btn--primary', { type: 'button', onclick: function () { run(root); } }, 'Run it for this month')));
  }

  function run(root) {
    if (filter.from > filter.to) {
      ui.say.warn('Check the dates', 'The "from" date is after the "to" date.');
      return;
    }
    var host = document.getElementById('report-body');
    if (host) {
      util.clear(host);
      host.appendChild(util.el('div.card', [util.el('div.card__body', [
        util.el('div.skeleton', { style: 'height:20px;margin-bottom:10px' }),
        util.el('div.skeleton', { style: 'height:160px' })
      ])]));
    }
    DX.api.call('reports.summary', { filter: filter })
      .then(function (data) { result = data; render(root); })
      .catch(function (err) { ui.reportError(err); render(root); });
  }

  function drawResult(host, root) {
    var totals = result.totals;
    var s = store.state;

    host.appendChild(util.el('div.grid.grid--kpi', [
      stat('Litres collected', util.fmtNum(totals.litres, 1), ' L', totals.entries + ' entries'),
      stat('Milk value', store.money(totals.amount), '', 'Average rate ' + util.fmtNum(totals.averageRate, 2)),
      stat('Morning / evening', util.fmtNum(totals.morningLitres, 0) + ' / ' + util.fmtNum(totals.eveningLitres, 0), ' L',
        totals.litres ? Math.round(totals.morningLitres / totals.litres * 100) + '% in the morning' : ''),
      stat('Suppliers', String(totals.suppliers), '', 'With at least one entry')
    ]));

    var chartHost = util.el('div');
    host.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Daily collection'),
          util.el('p', util.fmtDate(result.filter.from) + ' to ' + util.fmtDate(result.filter.to))]),
        util.el('div.card__body', [chartHost])
      ])
    ]));

    DX.charts.stacked(chartHost, {
      rows: result.days,
      unit: 'L', height: 220,
      ariaLabel: 'Litres collected each day in the reporting period, split into morning and evening',
      series: [
        { key: 'morningLitres', label: 'Morning', color: 'var(--series-1)' },
        { key: 'eveningLitres', label: 'Evening', color: 'var(--series-2)' }
      ],
      labelOf: function (row) { return util.fmtDate(row.date); },
      tickOf: function (row) { return util.fmtDate(row.date, 'short'); },
      emptyText: 'No collections in this period.'
    });

    host.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'By supplier'),
          util.el('p', 'Net payable is milk value less any advance still outstanding')]),
        util.el('div.card__body', [
          result.suppliers.length ? ui.table([
            { key: 'supplierId', label: 'ID' },
            { key: 'supplierName', label: 'Supplier' },
            { label: 'Entries', right: true, render: function (r) { return r.entries; } },
            { label: 'Morning', right: true, render: function (r) { return util.fmtNum(r.morningLitres, 1); } },
            { label: 'Evening', right: true, render: function (r) { return util.fmtNum(r.eveningLitres, 1); } },
            { label: 'Litres', right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
            { label: 'Milk value', right: true, render: function (r) { return store.money(r.amount); } },
            { label: 'Advance', right: true, render: function (r) { return r.advanceOutstanding > 0 ? store.money(r.advanceOutstanding) : '—'; } },
            { label: 'Net payable', right: true, render: function (r) { return store.money(r.netPayable); } }
          ], result.suppliers) : ui.empty('Nothing in this period', 'Try a wider date range, or check the shift filter.')
        ]),
        util.el('div.card__foot', [
          util.el('button.btn.btn--sm', { type: 'button', onclick: exportSuppliers }, 'Export supplier summary'),
          ' ',
          util.el('button.btn.btn--sm', { type: 'button', onclick: exportEntries }, 'Export every entry'),
          ' ',
          util.el('button.btn.btn--sm', { type: 'button', onclick: function () { window.print(); } }, 'Print')
        ])
      ])
    ]));

    function exportSuppliers() {
      util.downloadCsv('dakotax-report-' + result.filter.from + '-to-' + result.filter.to + '.csv', util.toCsv(
        ['Supplier ID', 'Supplier', 'Entries', 'Morning litres', 'Evening litres', 'Total litres', 'Milk value', 'Advance outstanding', 'Net payable'],
        result.suppliers.map(function (r) {
          return [r.supplierId, r.supplierName, r.entries, r.morningLitres, r.eveningLitres, r.litres, r.amount, r.advanceOutstanding, r.netPayable];
        })
      ));
      ui.say.ok('Report exported', result.suppliers.length + ' suppliers downloaded as CSV.');
    }

    function exportEntries() {
      DX.api.call('collections.list', { filter: result.filter }).then(function (data) {
        var rows = data.collections || [];
        util.downloadCsv('dakotax-entries-' + result.filter.from + '-to-' + result.filter.to + '.csv', util.toCsv(
          ['Date', 'Shift', 'Supplier ID', 'Supplier', 'Litres', 'Fat', 'SNF', 'Rate', 'Amount', 'Note'],
          rows.map(function (r) {
            return [r.date, r.shift, r.supplierId, r.supplierName, r.litres, r.fat, r.snf, r.ratePerLitre, r.amount, r.note];
          })
        ));
        ui.say.ok('Entries exported', rows.length + ' rows downloaded as CSV.');
      }).catch(function (err) { ui.reportError(err); });
    }
  }

  function stat(label, value, unit, meta) {
    return util.el('div.card.stat', [
      util.el('p.stat__label', { text: label }),
      util.el('p.stat__value', [String(value), unit ? util.el('span.stat__unit', { text: unit }) : null]),
      meta ? util.el('p.stat__meta', { text: meta }) : null
    ]);
  }

  return {
    title: 'Reports',
    subtitle: function () { return result ? util.fmtDate(result.filter.from) + ' – ' + util.fmtDate(result.filter.to) : 'Pick a period'; },
    render: render
  };
})();

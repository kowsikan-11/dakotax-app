/* Reports — a period, a filter, and numbers you can hand to an accountant. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.reports = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var filter = null;
  var result = null;
  var side = 'in';

  function defaults() {
    var s = store.state;
    return { from: util.monthStart(s.serverDate), to: s.serverDate, supplierId: '', customerId: '', shift: '' };
  }

  function render(root) {
    var s = store.state;
    if (!filter) filter = defaults();
    util.clear(root);

    root.appendChild(ui.modeSwitch({
      label: 'Which side to report on',
      value: side,
      modes: [
        { key: 'in', short: 'Milk in', tail: 'from suppliers', icon: ui.arrowIn() },
        { key: 'out', short: 'Milk out', tail: 'to customers', icon: ui.arrowOut() },
        { key: 'both', short: 'Both sides', tail: 'and margin' }
      ],
      onChange: function (next) { side = next; render(root); }
    }));

    var fromField = ui.field({ label: 'From', name: 'from', type: 'date', value: filter.from });
    var toField = ui.field({ label: 'To', name: 'to', type: 'date', value: filter.to });
    var partyField = side === 'out'
      ? ui.field({
          label: 'Customer', name: 'customerId', type: 'select', value: filter.customerId || '',
          options: [{ value: '', label: 'All customers' }].concat(s.customers.map(function (c) {
            return { value: c.customerId, label: c.name + ' (' + c.customerId + ')' };
          }))
        })
      : ui.field({
          label: 'Supplier', name: 'supplierId', type: 'select', value: filter.supplierId || '',
          options: [{ value: '', label: 'All suppliers' }].concat(s.suppliers.map(function (sup) {
            return { value: sup.supplierId, label: sup.name + ' (' + sup.supplierId + ')' };
          }))
        });
    // With both sides in view, filtering by one party would be misleading.
    if (side === 'both') partyField.hidden = true;
    var shiftField = ui.field({
      label: 'Shift', name: 'shift', type: 'select', value: filter.shift,
      options: [{ value: '', label: 'Both shifts' }, { value: 'Morning', label: 'Morning only' }, { value: 'Evening', label: 'Evening only' }]
    });

    var runBtn = util.el('button.btn.btn--primary', { type: 'submit' }, 'Run report');
    var filters = util.el('form.filters', { novalidate: true }, [
      fromField, toField, partyField, shiftField,
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
        supplierId: side === 'out' || side === 'both' ? '' : partyField.control.value,
        customerId: side === 'out' ? partyField.control.value : '',
        shift: shiftField.control.value
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
    var buy = result.totals;
    var sell = result.saleTotals || { litres: 0, amount: 0, entries: 0, customers: 0, averageRate: 0 };
    var margin = result.margin || { litres: 0, amount: 0 };

    if (side === 'in') {
      host.appendChild(util.el('div.grid.grid--kpi', [
        stat('Litres collected', util.fmtNum(buy.litres, 1), ' L', buy.entries + ' entries'),
        stat('Paid for milk', store.money(buy.amount), '', 'Average rate ' + util.fmtNum(buy.averageRate, 2)),
        stat('Morning / evening', util.fmtNum(buy.morningLitres, 0) + ' / ' + util.fmtNum(buy.eveningLitres, 0), ' L',
          buy.litres ? Math.round(buy.morningLitres / buy.litres * 100) + '% in the morning' : ''),
        stat('Suppliers', String(buy.suppliers), '', 'With at least one entry')
      ]));
    } else if (side === 'out') {
      host.appendChild(util.el('div.grid.grid--kpi', [
        stat('Litres delivered', util.fmtNum(sell.litres, 1), ' L', sell.entries + ' deliveries'),
        stat('Billed to customers', store.money(sell.amount), '', 'Average rate ' + util.fmtNum(sell.averageRate, 2)),
        stat('Morning / evening', util.fmtNum(sell.morningLitres, 0) + ' / ' + util.fmtNum(sell.eveningLitres, 0), ' L',
          sell.litres ? Math.round(sell.morningLitres / sell.litres * 100) + '% in the morning' : ''),
        stat('Customers', String(sell.customers), '', 'With at least one delivery')
      ]));
    } else {
      host.appendChild(util.el('div.grid.grid--kpi', [
        stat('Milk in', util.fmtNum(buy.litres, 1), ' L', store.money(buy.amount) + ' paid'),
        stat('Milk out', util.fmtNum(sell.litres, 1), ' L', store.money(sell.amount) + ' billed'),
        stat('Margin', store.money(margin.amount), '',
          (margin.litres >= 0 ? '+' : '−') + util.fmtNum(Math.abs(margin.litres), 1) + ' L difference in volume'),
        stat('Margin per litre', util.fmtNum(sell.averageRate - buy.averageRate, 2), '',
          'Bought at ' + util.fmtNum(buy.averageRate, 2) + ', sold at ' + util.fmtNum(sell.averageRate, 2))
      ]));
    }

    var chartHost = util.el('div');
    host.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [
          util.el('h2', side === 'both' ? 'Milk in and out' : side === 'out' ? 'Daily deliveries' : 'Daily collection'),
          util.el('p', util.fmtDate(result.filter.from) + ' to ' + util.fmtDate(result.filter.to))
        ]),
        util.el('div.card__body', [chartHost])
      ])
    ]));

    if (side === 'both') {
      DX.charts.diverging(chartHost, {
        rows: result.days, unit: 'L', height: 250,
        ariaLabel: 'Litres bought and sold each day in the reporting period, bought above the line and sold below it',
        up: { key: 'litres', label: 'Milk in', color: 'var(--series-3)' },
        down: { key: 'soldLitres', label: 'Milk out', color: 'var(--series-2)' },
        marginLabel: 'Out − in',
        labelOf: function (row) { return util.fmtDate(row.date); },
        tickOf: function (row) { return util.fmtDate(row.date, 'short'); },
        format: function (v) { return util.fmtNum(v, 1) + ' L'; },
        emptyText: 'Nothing recorded in this period.'
      });
    } else {
      var isIn = side === 'in';
      DX.charts.stacked(chartHost, {
        rows: result.days, unit: 'L', height: 220,
        ariaLabel: (isIn ? 'Litres collected' : 'Litres delivered') + ' each day in the reporting period, split by shift',
        series: isIn
          ? [{ key: 'morningLitres', label: 'Morning', color: 'var(--series-1)' },
             { key: 'eveningLitres', label: 'Evening', color: 'var(--series-2)' }]
          : [{ key: 'soldLitres', label: 'Delivered', color: 'var(--series-2)' }],
        labelOf: function (row) { return util.fmtDate(row.date); },
        tickOf: function (row) { return util.fmtDate(row.date, 'short'); },
        emptyText: isIn ? 'No collections in this period.' : 'No deliveries in this period.'
      });
    }

    if (side !== 'out') host.appendChild(supplierTable());
    if (side !== 'in') host.appendChild(customerTable());
  }

  function supplierTable() {
    return util.el('section.section', [
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
          ], result.suppliers) : ui.empty('No collections in this period', 'Try a wider date range, or check the shift filter.')
        ]),
        util.el('div.card__foot', [
          util.el('button.btn.btn--sm', { type: 'button', onclick: exportSuppliers }, 'Export supplier summary'),
          ' ',
          util.el('button.btn.btn--sm', { type: 'button', onclick: function () { exportRows('collections.list', 'collections'); } }, 'Export every entry'),
          ' ',
          util.el('button.btn.btn--sm', { type: 'button', onclick: function () { window.print(); } }, 'Print')
        ])
      ])
    ]);
  }

  function customerTable() {
    var customers = result.customers || [];
    return util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'By customer'),
          util.el('p', 'Balance is everything delivered less everything received, all time')]),
        util.el('div.card__body', [
          customers.length ? ui.table([
            { key: 'customerId', label: 'ID' },
            { key: 'customerName', label: 'Customer' },
            { label: 'Deliveries', right: true, render: function (r) { return r.entries; } },
            { label: 'Morning', right: true, render: function (r) { return util.fmtNum(r.morningLitres, 1); } },
            { label: 'Evening', right: true, render: function (r) { return util.fmtNum(r.eveningLitres, 1); } },
            { label: 'Litres', right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
            { label: 'Billed', right: true, render: function (r) { return store.money(r.amount); } },
            {
              label: 'Balance', right: true, render: function (r) {
                if (r.outstanding > 0.001) return store.money(r.outstanding);
                if (r.outstanding < -0.001) return util.el('span.credit', store.money(-r.outstanding) + ' cr');
                return '—';
              }
            }
          ], customers) : ui.empty('No deliveries in this period', 'Try a wider date range, or check the shift filter.')
        ]),
        util.el('div.card__foot', [
          util.el('button.btn.btn--sm', { type: 'button', onclick: exportCustomers }, 'Export customer summary'),
          ' ',
          util.el('button.btn.btn--sm', { type: 'button', onclick: function () { exportRows('sales.list', 'sales'); } }, 'Export every delivery'),
          ' ',
          util.el('button.btn.btn--sm', { type: 'button', onclick: function () { window.print(); } }, 'Print')
        ])
      ])
    ]);
  }

  function exportSuppliers() {
    util.downloadCsv('dakotax-suppliers-report-' + result.filter.from + '-to-' + result.filter.to + '.csv', util.toCsv(
      ['Supplier ID', 'Supplier', 'Entries', 'Morning litres', 'Evening litres', 'Total litres', 'Milk value', 'Advance outstanding', 'Net payable'],
      result.suppliers.map(function (r) {
        return [r.supplierId, r.supplierName, r.entries, r.morningLitres, r.eveningLitres, r.litres, r.amount, r.advanceOutstanding, r.netPayable];
      })));
    ui.say.ok('Report exported', result.suppliers.length + ' suppliers downloaded as CSV.');
  }

  function exportCustomers() {
    var customers = result.customers || [];
    util.downloadCsv('dakotax-customers-report-' + result.filter.from + '-to-' + result.filter.to + '.csv', util.toCsv(
      ['Customer ID', 'Customer', 'Deliveries', 'Morning litres', 'Evening litres', 'Total litres', 'Billed', 'Balance owed'],
      customers.map(function (r) {
        return [r.customerId, r.customerName, r.entries, r.morningLitres, r.eveningLitres, r.litres, r.amount, r.outstanding];
      })));
    ui.say.ok('Report exported', customers.length + ' customers downloaded as CSV.');
  }

  function exportRows(action, key) {
    DX.api.call(action, { filter: result.filter }).then(function (data) {
      var rows = data[key] || [];
      if (key === 'collections') {
        util.downloadCsv('dakotax-entries-' + result.filter.from + '-to-' + result.filter.to + '.csv', util.toCsv(
          ['Date', 'Shift', 'Supplier ID', 'Supplier', 'Litres', 'Fat', 'SNF', 'Rate', 'Amount', 'Note'],
          rows.map(function (r) { return [r.date, r.shift, r.supplierId, r.supplierName, r.litres, r.fat, r.snf, r.ratePerLitre, r.amount, r.note]; })));
      } else {
        util.downloadCsv('dakotax-deliveries-' + result.filter.from + '-to-' + result.filter.to + '.csv', util.toCsv(
          ['Date', 'Shift', 'Customer ID', 'Customer', 'Litres', 'Rate', 'Amount', 'Note'],
          rows.map(function (r) { return [r.date, r.shift, r.customerId, r.customerName, r.litres, r.ratePerLitre, r.amount, r.note]; })));
      }
      ui.say.ok('Exported', rows.length + ' rows downloaded as CSV.');
    }).catch(function (err) { ui.reportError(err); });
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

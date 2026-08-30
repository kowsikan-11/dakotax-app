/* Dashboard — what the shed supervisor needs at a glance. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.dashboard = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;

  function tile(label, value, unit, meta, accent) {
    return util.el('div.card.stat' + (accent ? '.stat--accent' : ''), [
      util.el('p.stat__label', { text: label }),
      util.el('p.stat__value', [String(value), unit ? util.el('span.stat__unit', { text: unit }) : null]),
      meta ? util.el('p.stat__meta', { text: meta }) : null
    ]);
  }

  function render(root) {
    var s = store.state;
    var today = store.todayTotals();
    var month = store.monthTotals();
    var supplierCount = Object.keys(today.suppliers).length;
    var active = store.activeSuppliers().length;

    util.clear(root);

    if (!s.suppliers.length) {
      root.appendChild(ui.empty(
        'No suppliers yet',
        'Add the people who bring milk, then the dashboard fills in on its own.',
        util.el('a.btn.btn--primary', { href: '#/suppliers' }, 'Add the first supplier')
      ));
      return;
    }

    root.appendChild(util.el('div.grid.grid--kpi', [
      tile("Today's litres", util.fmtNum(today.litres, 1), ' L',
        util.fmtNum(today.morning, 1) + ' morning · ' + util.fmtNum(today.evening, 1) + ' evening', true),
      tile("Today's milk value", store.money(today.amount), '',
        today.entries + (today.entries === 1 ? ' entry' : ' entries') + ' from ' + supplierCount + ' of ' + active),
      tile('This month', util.fmtNum(month.litres, 0), ' L',
        store.money(month.amount) + ' since ' + util.fmtDate(util.monthStart(s.serverDate), 'short')),
      tile('Advances outstanding', store.money(store.totalOutstanding()), '',
        'Across all suppliers')
    ]));

    /* Last two weeks, split by shift ------------------------------------ */
    var chartHost = util.el('div');
    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Litres per day'),
          util.el('p', 'Last 14 days, split by shift')]),
        util.el('div.card__body', [chartHost])
      ])
    ]));

    DX.charts.stacked(chartHost, {
      rows: store.denseDays(14),
      unit: 'L',
      height: 210,
      ariaLabel: 'Litres collected each day for the last 14 days, split into morning and evening',
      series: [
        { key: 'morningLitres', label: 'Morning', color: 'var(--series-1)' },
        { key: 'eveningLitres', label: 'Evening', color: 'var(--series-2)' }
      ],
      labelOf: function (row) { return util.fmtDate(row.date); },
      tickOf: function (row) { return util.fmtDate(row.date, 'short'); },
      emptyText: 'No collections recorded in the last two weeks.'
    });

    /* Top suppliers this month + today's register ------------------------ */
    var rankHost = util.el('div');
    var monthFrom = util.monthStart(s.serverDate);
    var perSupplier = {};
    s.collections.forEach(function (c) {
      if (c.date < monthFrom || c.date > s.serverDate) return;
      perSupplier[c.supplierId] = perSupplier[c.supplierId] || { label: c.supplierName, value: 0, amount: 0 };
      perSupplier[c.supplierId].value += c.litres;
      perSupplier[c.supplierId].amount += c.amount;
    });
    var ranked = Object.keys(perSupplier).map(function (k) {
      var r = perSupplier[k];
      return { label: r.label, value: r.value, meta: { label: 'Milk value', value: store.money(r.amount) } };
    }).sort(function (a, b) { return b.value - a.value; });

    var todayRows = store.collectionsOn(s.serverDate).slice().sort(function (a, b) {
      return String(b.recordedAt).localeCompare(String(a.recordedAt));
    });

    root.appendChild(util.el('section.section.grid.grid--2', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Biggest suppliers'),
          util.el('p', 'Litres so far this month')]),
        util.el('div.card__body', [rankHost])
      ]),
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', "Today's register"),
          util.el('p', util.fmtDate(s.serverDate))]),
        util.el('div.card__body', [
          todayRows.length ? ui.table([
            { key: 'supplierName', label: 'Supplier' },
            { label: 'Shift', render: function (r) { return ui.shiftChip(r.shift); } },
            { label: 'Litres', right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
            { label: 'Value', right: true, render: function (r) { return store.money(r.amount); } }
          ], todayRows) : ui.empty(
            'Nothing recorded today',
            'The first entry of the ' + s.shift.toLowerCase() + ' round will appear here.',
            util.el('a.btn.btn--shift', { href: '#/collection' }, 'Record milk')
          )
        ])
      ])
    ]));

    DX.charts.ranked(rankHost, {
      rows: ranked,
      limit: 6,
      measure: 'Litres this month',
      color: 'var(--series-3)',
      ariaLabel: 'Suppliers ranked by litres collected this month',
      format: function (v) { return util.fmtNum(v, 1) + ' L'; },
      emptyText: 'No collections this month yet.'
    });
  }

  return {
    title: 'Dashboard',
    subtitle: function () {
      var s = store.state;
      return util.fmtDate(s.serverDate);
    },
    render: render
  };
})();

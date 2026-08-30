/* Dashboard — both sides of the book at a glance. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.dashboard = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store;
  var chartMode = 'both';

  function tile(label, value, unit, meta, accent) {
    return util.el('div.card.stat' + (accent ? '.stat--accent' : ''), [
      util.el('p.stat__label', { text: label }),
      util.el('p.stat__value', [String(value), unit ? util.el('span.stat__unit', { text: unit }) : null]),
      meta ? util.el('p.stat__meta', { text: meta }) : null
    ]);
  }

  function render(root) {
    var s = store.state;
    util.clear(root);

    if (!s.suppliers.length && !s.customers.length) {
      root.appendChild(ui.empty(
        'Nobody on the books yet',
        'Add the people who bring you milk and the people you deliver to. The dashboard fills in on its own.',
        util.el('a.btn.btn--primary', { href: '#/people' }, 'Add the first person')
      ));
      return;
    }

    var bought = store.todayTotals();
    var sold = store.todaySaleTotals();
    var month = store.monthTotals();
    var margin = sold.amount - bought.amount;

    root.appendChild(util.el('div.grid.grid--kpi', [
      tile('Milk in today', util.fmtNum(bought.litres, 1), ' L',
        util.fmtNum(bought.morning, 1) + ' morning · ' + util.fmtNum(bought.evening, 1) + ' evening', true),
      tile('Milk out today', util.fmtNum(sold.litres, 1), ' L',
        util.fmtNum(sold.morning, 1) + ' morning · ' + util.fmtNum(sold.evening, 1) + ' evening'),
      tile("Today's margin", store.money(margin), '',
        store.money(sold.amount) + ' sold − ' + store.money(bought.amount) + ' bought'),
      tile('Owed to you', store.money(store.totalReceivable()), '',
        store.money(store.totalOutstanding()) + ' advanced out to suppliers')
    ]));

    /* ---- the fortnight, three ways --------------------------------- */
    var chartHost = util.el('div');
    var chartCard = util.el('div.card', [
      util.el('div.card__head', [
        util.el('h2', 'Litres per day'),
        util.el('p', 'Last 14 days')
      ]),
      util.el('div.card__body', [
        ui.modeSwitch({
          label: 'Which side to chart',
          value: chartMode,
          modes: [
            { key: 'both', short: 'In vs out' },
            { key: 'in', short: 'Milk in', tail: 'by shift' },
            { key: 'out', short: 'Milk out', tail: 'by shift' }
          ],
          onChange: function (next) { chartMode = next; drawChart(chartHost); }
        }),
        chartHost
      ])
    ]);
    root.appendChild(util.el('section.section', [chartCard]));
    drawChart(chartHost);

    /* ---- who moves the most milk ----------------------------------- */
    var monthFrom = util.monthStart(s.serverDate);
    var supplierRank = rank(s.collections, monthFrom, s.serverDate, 'supplierId', 'supplierName');
    var customerRank = rank(s.sales, monthFrom, s.serverDate, 'customerId', 'customerName');
    var supplierHost = util.el('div');
    var customerHost = util.el('div');

    root.appendChild(util.el('section.section.grid.grid--2', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Biggest suppliers'), util.el('p', 'Litres in, this month')]),
        util.el('div.card__body', [supplierHost])
      ]),
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', 'Biggest customers'), util.el('p', 'Litres out, this month')]),
        util.el('div.card__body', [customerHost])
      ])
    ]));

    DX.charts.ranked(supplierHost, {
      rows: supplierRank, limit: 6, measure: 'Litres this month', color: 'var(--series-3)',
      ariaLabel: 'Suppliers ranked by litres collected this month',
      format: function (v) { return util.fmtNum(v, 1) + ' L'; },
      emptyText: 'No milk collected this month yet.'
    });
    DX.charts.ranked(customerHost, {
      rows: customerRank, limit: 6, measure: 'Litres this month', color: 'var(--series-2)',
      ariaLabel: 'Customers ranked by litres delivered this month',
      format: function (v) { return util.fmtNum(v, 1) + ' L'; },
      emptyText: 'No milk delivered this month yet.'
    });

    /* ---- today's register, both directions -------------------------- */
    var todayRows = store.collectionsOn(s.serverDate).map(function (c) {
      return { direction: 'In', name: c.supplierName, shift: c.shift, litres: c.litres, amount: c.amount, recordedAt: c.recordedAt };
    }).concat(store.salesOn(s.serverDate).map(function (r) {
      return { direction: 'Out', name: r.customerName, shift: r.shift, litres: r.litres, amount: r.amount, recordedAt: r.recordedAt };
    })).sort(function (a, b) { return String(b.recordedAt).localeCompare(String(a.recordedAt)); });

    root.appendChild(util.el('section.section', [
      util.el('div.card', [
        util.el('div.card__head', [util.el('h2', "Today's register"), util.el('p', util.fmtDate(s.serverDate))]),
        util.el('div.card__body', [
          todayRows.length ? ui.table([
            {
              label: 'Direction', render: function (r) {
                return ui.chip(r.direction === 'In' ? 'Milk in' : 'Milk out', r.direction === 'In' ? 'in' : 'out');
              }
            },
            { key: 'name', label: 'Who' },
            { label: 'Shift', render: function (r) { return ui.shiftChip(r.shift); } },
            { label: 'Litres', right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
            { label: 'Value', right: true, render: function (r) { return store.money(r.amount); } }
          ], todayRows) : ui.empty(
            'Nothing recorded today',
            'The first entry of the ' + s.shift.toLowerCase() + ' round will appear here.',
            util.el('a.btn.btn--shift', { href: '#/entry' }, 'Record milk')
          )
        ]),
        util.el('div.card__foot', {
          text: 'This month: ' + util.fmtNum(month.litres, 0) + ' L in (' + store.money(month.amount) + ') · ' +
            util.fmtNum(month.soldLitres, 0) + ' L out (' + store.money(month.soldAmount) + ') · margin ' +
            store.money(month.marginAmount)
        })
      ])
    ]));
  }

  function rank(rows, from, to, idKey, nameKey) {
    var per = {};
    rows.forEach(function (r) {
      if (r.date < from || r.date > to) return;
      var entry = per[r[idKey]] || (per[r[idKey]] = { label: r[nameKey], value: 0, amount: 0 });
      entry.value += r.litres;
      entry.amount += r.amount;
    });
    return Object.keys(per).map(function (k) {
      var e = per[k];
      return { label: e.label, value: e.value, meta: { label: 'Value', value: store.money(e.amount) } };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function drawChart(host) {
    var days = store.denseDays(14);
    if (chartMode === 'both') {
      DX.charts.diverging(host, {
        rows: days, unit: 'L', height: 250,
        ariaLabel: 'Litres bought and sold each day for the last 14 days, bought above the line and sold below it',
        up: { key: 'litres', label: 'Milk in', color: 'var(--series-3)' },
        down: { key: 'soldLitres', label: 'Milk out', color: 'var(--series-2)' },
        marginLabel: 'Out − in',
        labelOf: function (row) { return DX.util.fmtDate(row.date); },
        tickOf: function (row) { return DX.util.fmtDate(row.date, 'short'); },
        format: function (v) { return DX.util.fmtNum(v, 1) + ' L'; },
        emptyText: 'Nothing recorded in the last two weeks.'
      });
      return;
    }
    var isIn = chartMode === 'in';
    DX.charts.stacked(host, {
      rows: days, unit: 'L', height: 220,
      ariaLabel: (isIn ? 'Litres collected' : 'Litres delivered') +
        ' each day for the last 14 days, split into morning and evening',
      series: isIn
        ? [{ key: 'morningLitres', label: 'Morning', color: 'var(--series-1)' },
           { key: 'eveningLitres', label: 'Evening', color: 'var(--series-2)' }]
        : [{ key: 'soldMorningLitres', label: 'Morning', color: 'var(--series-1)' },
           { key: 'soldEveningLitres', label: 'Evening', color: 'var(--series-2)' }],
      labelOf: function (row) { return DX.util.fmtDate(row.date); },
      tickOf: function (row) { return DX.util.fmtDate(row.date, 'short'); },
      emptyText: isIn ? 'No collections in the last two weeks.' : 'No deliveries in the last two weeks.'
    });
  }

  return {
    title: 'Dashboard',
    subtitle: function () { return util.fmtDate(store.state.serverDate); },
    render: render
  };
})();

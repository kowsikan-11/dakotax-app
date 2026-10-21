/* Home — today at a glance, and big buttons for the daily jobs. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.home = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }
  var chartMode = 'both';

  function action(href, tone, glyph, title, sub) {
    return el('a.action' + (tone ? '.action--' + tone : ''), { href: href }, [
      ui.icon(glyph), el('b', { text: title }), sub ? el('small', { text: sub }) : null
    ]);
  }

  function smallAction(href, glyph, title) {
    return el('a.action.action--small', { href: href }, [ui.icon(glyph), el('b', { text: title })]);
  }

  function render(root, ctx) {
    var today = util.localToday();
    var shift = store.autoShift();
    var day = store.dayTotals(today);
    var month = store.monthTotals(today);
    var suppliersActive = store.activePeople('supplier').length;
    var customersActive = store.activePeople('customer').length;

    /* --- greeting and the round we are in --- */
    root.appendChild(el('div.greet', [
      el('span.greet__badge.greet__badge--' + shift.toLowerCase(), [
        ui.icon(shift === 'Morning' ? 'sun' : 'moon'),
        el('span', { text: shift === 'Morning' ? t('Morning round') : t('Evening round') })
      ]),
      el('p', { text: util.clockLabel() })
    ]));

    /* --- the jobs --- */
    root.appendChild(el('div.actions-grid', [
      action('#/in', 'in', 'in', t('Milk In'), t('From a supplier')),
      action('#/out', 'out', 'out', t('Milk Out'), t('To a customer')),
      smallAction('#/pay', 'pay', t('Pay supplier')),
      smallAction('#/collect', 'collect', t('Collect money'))
    ]));

    if (!store.people('supplier').length && !store.people('customer').length) {
      root.appendChild(el('section.section', [
        el('div.card', el('div.card__body', ui.empty(
          t('Nobody on the books yet'),
          t('Add the people who bring you milk and the people you sell to. This page fills in by itself.'),
          el('a.btn.btn--primary', { href: '#/people' }, [ui.icon('plus'), el('span', { text: t('Add the first person') })]),
          'people')))
      ]));
      ctx.onChange(function () { ctx.rerender(); });
      return;
    }

    /* --- the sheet file filling up: saving stops when it is full --- */
    var space = store.space();
    if (space && space.share >= 0.8) {
      root.appendChild(el('div.section', ui.banner(space.share >= 0.95 ? 'error' : 'warn',
        t('The sheet file is {p}% full', { p: util.fmtNum(Math.min(100, space.share * 100), 0) }),
        t('When it is full, new entries cannot be saved. Tell the owner to move old months to a separate file.'),
        el('a.btn.btn--sm', { href: '#/settings' }, t('Details')))));
    }

    /* --- today --- */
    var margin = day.sold.amount - day.bought.amount;
    root.appendChild(el('section.section', [
      ui.sectionHead(t('Today'), util.fmtDate(today)),
      el('div.grid.grid--4', [
        ui.stat({ label: t('Milk in'), icon: 'in', tone: 'in', value: util.fmtNum(day.bought.litres, 1), unit: 'L',
          sub: store.money(day.bought.amount, 0) + ' · ' + t('{n} suppliers', { n: util.fmtCount(day.bought.partyCount || 0) }) }),
        ui.stat({ label: t('Milk out'), icon: 'out', tone: 'out', value: util.fmtNum(day.sold.litres, 1), unit: 'L',
          sub: store.money(day.sold.amount, 0) + ' · ' + t('{n} customers', { n: util.fmtCount(day.sold.partyCount || 0) }) }),
        ui.stat({ label: t('Margin today'), value: store.money(margin, 0), tone: margin < 0 ? 'bad' : 'good',
          sub: t('Sold {a} − bought {b}', { a: store.money(day.sold.amount, 0), b: store.money(day.bought.amount, 0) }) }),
        ui.stat({ label: t('Customers owe you'), value: store.money(store.totalReceivable(), 0),
          sub: t('Advances out: {a}', { a: store.money(store.totalAdvances(), 0) }) })
      ])
    ]));

    /* --- how far this round has got --- */
    var inRound = store.rowsOn('collection', today, shift).filter(function (r) { return !r._failed; });
    var outRound = store.rowsOn('sale', today, shift).filter(function (r) { return !r._failed; });
    root.appendChild(el('section.section', [
      el('div.card', el('div.card__body.stack', [
        progress('in', shift === 'Morning' ? t('Morning milk in') : t('Evening milk in'), inRound, suppliersActive, 'supplierId', t('{done} of {all} suppliers')),
        customersActive ? progress('out', shift === 'Morning' ? t('Morning milk out') : t('Evening milk out'), outRound, customersActive, 'customerId', t('{done} of {all} customers')) : null
      ]))
    ]));

    /* --- last two weeks --- */
    var chartHost = el('div');
    root.appendChild(el('section.section', [
      ui.sectionHead(t('Last 14 days'), t('Litres per day')),
      el('div.card', el('div.card__body', [
        ui.choice({
          ariaLabel: t('Which milk to show'), name: 'home-chart', value: chartMode, compact: true, columns: 3,
          options: [
            { value: 'both', label: t('In & out') },
            { value: 'in', label: t('Milk in'), tone: 'in' },
            { value: 'out', label: t('Milk out'), tone: 'out' }
          ],
          onChange: function (v) { chartMode = v; drawChart(chartHost); }
        }),
        el('div', { style: 'margin-top:12px' }, chartHost)
      ]))
    ]));
    drawChart(chartHost);

    /* --- this month --- */
    var monthNote = month.complete ? '' : t('Some older days are not loaded on this phone. Use Reports for exact month totals.');
    var supplierHost = el('div'), customerHost = el('div');
    root.appendChild(el('section.section', [
      ui.sectionHead(t('This month'), util.fmtDate(month.from, 'short') + ' – ' + util.fmtDate(month.to, 'short')),
      el('div.grid.grid--4', [
        ui.stat({ label: t('Milk in'), icon: 'in', tone: 'in', value: util.fmtNum(month.bought.litres, 0), unit: 'L', sub: store.money(month.bought.amount, 0) }),
        ui.stat({ label: t('Milk out'), icon: 'out', tone: 'out', value: util.fmtNum(month.sold.litres, 0), unit: 'L', sub: store.money(month.sold.amount, 0) }),
        ui.stat({ label: t('Margin'), value: store.money(month.margin, 0), tone: month.margin < 0 ? 'bad' : 'good', sub: t('Sold − bought') }),
        ui.stat({ label: t('Entries'), value: String(month.bought.entries + month.sold.entries), sub: t('{a} in · {b} out', { a: month.bought.entries, b: month.sold.entries }) })
      ]),
      monthNote ? el('p.hint', { style: 'margin-top:8px', text: monthNote }) : null,
      el('div.grid.grid--auto', { style: 'margin-top:12px' }, [
        el('div.card', [el('div.card__head', [el('h3', { text: t('Biggest suppliers') }), el('p', { text: t('Litres in, this month') })]), el('div.card__body', supplierHost)]),
        el('div.card', [el('div.card__head', [el('h3', { text: t('Biggest customers') }), el('p', { text: t('Litres out, this month') })]), el('div.card__body', customerHost)])
      ])
    ]));
    DX.charts.ranked(supplierHost, {
      rows: store.rank('collection', month.from, month.to), limit: 6, color: 'var(--c-in)', measure: t('Litres'),
      ariaLabel: t('Biggest suppliers'), format: function (v) { return util.fmtNum(v, 1) + ' L'; },
      emptyText: t('No milk in this month yet.')
    });
    DX.charts.ranked(customerHost, {
      rows: store.rank('sale', month.from, month.to), limit: 6, color: 'var(--c-out)', measure: t('Litres'),
      ariaLabel: t('Biggest customers'), format: function (v) { return util.fmtNum(v, 1) + ' L'; },
      emptyText: t('No milk out this month yet.')
    });

    /* --- today's entries, both ways --- */
    var todays = store.rowsOn('collection', today).map(function (r) { return { dir: 'in', r: r, name: r.supplierName, id: r.supplierId }; })
      .concat(store.rowsOn('sale', today).map(function (r) { return { dir: 'out', r: r, name: r.customerName, id: r.customerId }; }))
      .sort(function (a, b) { return String(b.r.recordedAt).localeCompare(String(a.r.recordedAt)); });
    var shown = todays.slice(0, 8);
    root.appendChild(el('section.section', [
      ui.sectionHead(t('Latest today'), todays.length ? t('{n} entries', { n: todays.length }) : ''),
      el('div.card', el('div.card__body', shown.length ? el('div.list', shown.map(function (x) {
        return ui.row({
          title: x.name, id: x.id,
          sub: (x.dir === 'in' ? t('Milk in') : t('Milk out')) + ' · ' + t(x.r.shift),
          end: util.fmtLitres(x.r.litres), endSub: store.money(x.r.amount),
          status: ui.syncMark(x.r) || ui.chip(x.dir === 'in' ? t('In') : t('Out'), x.dir)
        });
      })) : ui.empty(t('Nothing recorded today'), t('Entries show here as soon as they are saved.'), null, 'clock')))
    ]));

    ctx.onChange(function () { ctx.rerender(); });
    ctx.onRound(function () { ctx.rerender(); });
  }

  function progress(tone, label, rows, all, key, template) {
    var done = {};
    rows.forEach(function (r) { done[String(r[key]).toLowerCase()] = 1; });
    var kind = key === 'supplierId' ? 'supplier' : 'customer';
    var count = store.activePeople(kind).filter(function (p) { return done[String(p[key]).toLowerCase()]; }).length;
    var pct = all ? Math.min(100, Math.round(count / all * 100)) : 0;
    var litres = util.sum(rows, 'litres');
    return el('a.progress.progress--' + tone, { href: '#/' + tone, style: 'text-decoration:none;color:inherit' }, [
      el('div.progress__text', [
        el('span', [el('b', { text: label }), ' · ', template.replace('{done}', util.fmtCount(count)).replace('{all}', util.fmtCount(all))]),
        el('b', { text: util.fmtLitres(litres) })
      ]),
      el('div.progress__bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all), 'aria-valuenow': String(count), 'aria-label': label },
        el('div.progress__fill', { style: 'width:' + pct + '%' }))
    ]);
  }

  function drawChart(host) {
    var days = store.denseDays(14);
    var labelOf = function (row) { return util.fmtDay(row.date); };
    var tickOf = function (row) { return util.fmtDate(row.date, 'short'); };
    if (chartMode === 'both') {
      DX.charts.diverging(host, {
        rows: days, unit: 'L', height: 230,
        ariaLabel: t('Litres in and out each day for the last 14 days'),
        up: { key: 'litres', label: t('Milk in ▲'), color: 'var(--c-in)' },
        down: { key: 'soldLitres', label: t('Milk out ▼'), color: 'var(--c-out)' },
        marginLabel: t('Out − in'), labelOf: labelOf, tickOf: tickOf,
        format: function (v) { return util.fmtNum(v, 1) + ' L'; },
        emptyText: t('Nothing recorded in the last two weeks.')
      });
      return;
    }
    var isIn = chartMode === 'in';
    DX.charts.stacked(host, {
      rows: days, unit: 'L', height: 210, totalLabel: t('Total'),
      ariaLabel: isIn ? t('Milk in per day, morning and evening') : t('Milk out per day, morning and evening'),
      series: isIn
        ? [{ key: 'morningLitres', label: t('Morning'), color: 'var(--c-morning)' }, { key: 'eveningLitres', label: t('Evening'), color: 'var(--c-evening)' }]
        : [{ key: 'soldMorningLitres', label: t('Morning'), color: 'var(--c-morning)' }, { key: 'soldEveningLitres', label: t('Evening'), color: 'var(--c-evening)' }],
      labelOf: labelOf, tickOf: tickOf,
      emptyText: isIn ? t('No milk in during the last two weeks.') : t('No milk out during the last two weeks.')
    });
  }

  return {
    title: function () { return store.businessName(); },
    subtitle: function () { return util.fmtDay(util.localToday(), true); },
    render: render
  };
})();

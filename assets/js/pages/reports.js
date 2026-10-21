/* Reports — pick the dates, see the totals, download a file for the accountant.
 * Worked out by the sheet itself, so they are complete for any dates. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.reports = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }

  var state = null;     // { key, from, to, shift, supplier, customer }
  var result = null;    // last answer from the sheet
  var resultKey = '';
  var tables = {};      // per table: what was typed in its search box and how many rows are open

  function presets() {
    var today = util.localToday();
    var lastEnd = util.addDays(util.monthStart(today), -1);
    return [
      { key: 'today', label: t('Today'), from: today, to: today },
      { key: 'yesterday', label: t('Yesterday'), from: util.addDays(today, -1), to: util.addDays(today, -1) },
      { key: 'week', label: t('Last 7 days'), from: util.addDays(today, -6), to: today },
      { key: 'month', label: t('This month'), from: util.monthStart(today), to: today },
      { key: 'lastmonth', label: t('Last month'), from: util.monthStart(lastEnd), to: lastEnd }
    ];
  }

  function defaults() {
    var p = presets()[3];
    return { key: p.key, from: p.from, to: p.to, shift: '', supplier: '*', customer: '*' };
  }

  function filterFor(side) {
    return {
      from: state.from, to: state.to, shift: state.shift,
      supplierId: side === 'in' && state.supplier !== '*' ? state.supplier : '',
      customerId: side === 'out' && state.customer !== '*' ? state.customer : ''
    };
  }

  function render(root, ctx) {
    if (!state) state = defaults();
    var side = ctx.sub === 'in' || ctx.sub === 'out' ? ctx.sub : 'both';
    if (ctx.sub !== side) ctx.setSub(side);

    /* --- which side --- */
    root.appendChild(el('div.tabs', { role: 'tablist', 'aria-label': t('Which report') }, [
      ['both', t('In & out'), 'reports'], ['in', t('Milk in'), 'in'], ['out', t('Milk out'), 'out']
    ].map(function (tab) {
      var on = tab[0] === side;
      return el('button.tabs__btn', {
        type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false',
        onclick: function () { if (!on) { ctx.setSub(tab[0]); ctx.rerender(); } }
      }, [ui.icon(tab[2]), el('span', { text: tab[1] })]);
    })));

    /* --- dates --- */
    var quick = el('div.quick', { role: 'group', 'aria-label': t('Dates') });
    var fromField = ui.dateField({ label: t('From'), compact: true, value: state.from, max: util.localToday(), onChange: function (v) { state.from = v; state.key = 'custom'; paintQuick(); schedule(); } });
    var toField = ui.dateField({ label: t('To'), compact: true, value: state.to, max: util.localToday(), onChange: function (v) { state.to = v; state.key = 'custom'; paintQuick(); schedule(); } });
    function paintQuick() {
      util.clear(quick);
      presets().forEach(function (p) {
        var on = state.from === p.from && state.to === p.to;
        quick.appendChild(el('button.quick__btn', {
          type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            state.key = p.key; state.from = p.from; state.to = p.to;
            fromField.set(p.from, true); toField.set(p.to, true);
            paintQuick(); schedule();
          }
        }, p.label));
      });
    }

    var shiftField = ui.choice({
      label: t('Round'), name: 'rep-shift', value: state.shift, compact: true, columns: 3,
      options: [{ value: '', label: t('Both') }, { value: 'Morning', label: t('Morning'), icon: 'sun', tone: 'morning' }, { value: 'Evening', label: t('Evening'), icon: 'moon', tone: 'evening' }],
      onChange: function (v) { state.shift = v; schedule(); }
    });

    var partyPicker = null;
    if (side !== 'both') {
      var isIn = side === 'in';
      partyPicker = ui.picker({
        kind: isIn ? 'supplier' : 'customer', label: isIn ? t('Supplier') : t('Customer'),
        includeInactive: true, allowAll: true, allLabel: isIn ? t('All suppliers') : t('All customers'),
        value: isIn ? state.supplier : state.customer,
        onChange: function (v) {
          var id = v === '*' || !v ? '*' : (isIn ? v.supplierId : v.customerId);
          if (isIn) state.supplier = id; else state.customer = id;
          schedule();
        }
      });
    }

    root.appendChild(el('div.card', el('div.card__body.form-stack', [
      el('div.field', [el('label', { text: t('Dates') }), quick]),
      el('div.form-row', [fromField, toField]),
      shiftField,
      partyPicker
    ])));

    var host = el('div.section');
    root.appendChild(host);

    var timer = null;
    var token = 0;
    function schedule() { clearTimeout(timer); timer = setTimeout(run, 250); }
    ctx.cleanup(function () { clearTimeout(timer); });

    function run() {
      if (state.from > state.to) {
        util.replace(host, ui.banner('warn', t('Check the dates'), t('“From” is after “To”.')));
        return;
      }
      var filter = filterFor(side);
      var key = JSON.stringify(filter);
      var mine = ++token;
      if (result && resultKey === key) draw(result, side, host, true);
      else util.replace(host, el('div.loading', [el('div.skeleton', { style: 'height:120px' }), el('div.skeleton', { style: 'height:220px' })]));
      DX.api.call('reports.summary', { filter: filter }, { timeout: 45000 }).then(function (data) {
        if (!ctx.alive() || mine !== token) return;
        var same = result && resultKey === key && JSON.stringify(result) === JSON.stringify(data);
        result = data; resultKey = key;
        if (same) {
          // Nothing changed: leave the screen (and anything being typed) alone.
          var sub = host.querySelector('.sechead p');
          if (sub) sub.textContent = util.fmtDate(data.filter.from) + ' – ' + util.fmtDate(data.filter.to);
          return;
        }
        draw(data, side, host, false);
      }, function (err) {
        if (!ctx.alive() || mine !== token) return;
        var info = ui.explain(err);
        if (result && resultKey === key) { ui.say.warn(t('Showing the last report'), info.detail); return; }
        util.replace(host, el('div.stack', [
          ui.banner('error', info.title, err && err.transport ? t('Reports are worked out by the sheet, so they need the internet.') : info.detail),
          el('button.btn', { type: 'button', onclick: run }, [ui.icon('refresh'), el('span', { text: t('Try again') })])
        ]));
      });
    }

    paintQuick();
    run();
  }

  function stat(label, value, unit, sub, tone, glyph) {
    return ui.stat({ label: label, value: value, unit: unit, sub: sub, tone: tone, icon: glyph });
  }

  function draw(data, side, host, stale) {
    // Someone typing in a table's search box keeps their place and keyboard.
    var active = document.activeElement;
    var typing = active && host.contains(active) && active.getAttribute('data-table');
    var caret = typing ? active.selectionStart : null;
    util.clear(host);
    if (typing) {
      setTimeout(function () {
        var again = host.querySelector('input[data-table="' + typing + '"]');
        if (!again) return;
        try { again.focus({ preventScroll: true }); if (caret !== null) again.setSelectionRange(caret, caret); } catch (e) { /* ignore */ }
      }, 0);
    }
    var buy = data.totals;
    var sell = data.saleTotals || { litres: 0, amount: 0, entries: 0, customers: 0, averageRate: 0, morningLitres: 0, eveningLitres: 0 };
    var margin = data.margin || { litres: 0, amount: 0 };
    var period = util.fmtDate(data.filter.from) + ' – ' + util.fmtDate(data.filter.to);
    host.appendChild(ui.sectionHead(t('Totals'), period + (stale ? ' · ' + t('updating…') : '')));

    if (side === 'in') {
      host.appendChild(el('div.grid.grid--4', [
        stat(t('Litres in'), util.fmtNum(buy.litres, 1), 'L', t('{n} entries', { n: buy.entries }), 'in', 'in'),
        stat(t('Paid for milk'), store.money(buy.amount, 0), '', t('Average {a}/L', { a: store.money(buy.averageRate) })),
        stat(t('Morning / evening'), util.fmtNum(buy.morningLitres, 0) + ' / ' + util.fmtNum(buy.eveningLitres, 0), 'L', ''),
        stat(t('Suppliers'), String(buy.suppliers), '', t('with at least one entry'))
      ]));
    } else if (side === 'out') {
      host.appendChild(el('div.grid.grid--4', [
        stat(t('Litres out'), util.fmtNum(sell.litres, 1), 'L', t('{n} entries', { n: sell.entries }), 'out', 'out'),
        stat(t('Billed to customers'), store.money(sell.amount, 0), '', t('Average {a}/L', { a: store.money(sell.averageRate) })),
        stat(t('Morning / evening'), util.fmtNum(sell.morningLitres, 0) + ' / ' + util.fmtNum(sell.eveningLitres, 0), 'L', ''),
        stat(t('Customers'), String(sell.customers), '', t('with at least one delivery'))
      ]));
    } else {
      host.appendChild(el('div.grid.grid--4', [
        stat(t('Milk in'), util.fmtNum(buy.litres, 1), 'L', store.money(buy.amount, 0) + ' ' + t('paid'), 'in', 'in'),
        stat(t('Milk out'), util.fmtNum(sell.litres, 1), 'L', store.money(sell.amount, 0) + ' ' + t('billed'), 'out', 'out'),
        stat(t('Margin'), store.money(margin.amount, 0), '', t('Sold − bought'), margin.amount < 0 ? 'bad' : 'good'),
        stat(t('Margin per litre'), store.money(sell.averageRate - buy.averageRate), '', t('Bought at {a}, sold at {b}', { a: store.money(buy.averageRate), b: store.money(sell.averageRate) }))
      ]));
    }

    var chartHost = el('div');
    host.appendChild(el('section.section', [
      ui.sectionHead(side === 'both' ? t('Milk in and out per day') : side === 'in' ? t('Milk in per day') : t('Milk out per day')),
      el('div.card', el('div.card__body', chartHost))
    ]));
    var labelOf = function (row) { return util.fmtDay(row.date); };
    var tickOf = function (row) { return util.fmtDate(row.date, 'short'); };
    var days = fillDays(data.days || [], data.filter.from, data.filter.to);
    if (side === 'both') {
      DX.charts.diverging(chartHost, {
        rows: days, unit: 'L', height: 230, ariaLabel: t('Milk in and out per day'),
        up: { key: 'litres', label: t('Milk in ▲'), color: 'var(--c-in)' },
        down: { key: 'soldLitres', label: t('Milk out ▼'), color: 'var(--c-out)' },
        marginLabel: t('Out − in'), labelOf: labelOf, tickOf: tickOf,
        format: function (v) { return util.fmtNum(v, 1) + ' L'; }, emptyText: t('Nothing recorded in these dates.')
      });
    } else {
      var isIn = side === 'in';
      DX.charts.stacked(chartHost, {
        rows: days, unit: 'L', height: 210, totalLabel: t('Total'),
        ariaLabel: isIn ? t('Milk in per day') : t('Milk out per day'),
        series: isIn
          ? [{ key: 'morningLitres', label: t('Morning'), color: 'var(--c-morning)' }, { key: 'eveningLitres', label: t('Evening'), color: 'var(--c-evening)' }]
          : [{ key: 'soldMorningLitres', label: t('Morning'), color: 'var(--c-morning)' }, { key: 'soldEveningLitres', label: t('Evening'), color: 'var(--c-evening)' }],
        labelOf: labelOf, tickOf: tickOf, emptyText: t('Nothing recorded in these dates.')
      });
    }

    if (side !== 'out') host.appendChild(supplierTable(data));
    if (side !== 'in') host.appendChild(customerTable(data));
  }

  /** The sheet only sends days that had entries; the chart wants every day. */
  function fillDays(days, from, to) {
    if (!from || !to) return days;
    var span = Math.round((util.parseIso(to) - util.parseIso(from)) / 86400000) + 1;
    if (span > 62 || span < 1) return days;
    var byDate = {};
    days.forEach(function (d) { byDate[d.date] = d; });
    var out = [];
    for (var i = 0; i < span; i++) {
      var iso = util.addDays(from, i);
      out.push(byDate[iso] || { date: iso, litres: 0, amount: 0, morningLitres: 0, eveningLitres: 0, soldLitres: 0, soldAmount: 0, soldMorningLitres: 0, soldEveningLitres: 0 });
    }
    return out;
  }

  /**
   * A report table that stays quick with thousands of people: a search box,
   * the first 50 rows, and more on request. Printing shows every row.
   */
  function table(columns, rows, match, name) {
    var STEP = 50;
    var mem = tables[name] || (tables[name] = { q: '', limit: STEP });
    var printing = null;
    var input = el('input.search__input', {
      type: 'search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
      'aria-label': t('Search'), placeholder: t('Number or name'), 'data-table': name, value: mem.q
    });
    var box = el('div.search.inline-search.no-print', [ui.icon('search'), input]);
    var host = el('div');
    var more = el('button.btn.btn--soft.btn--block.lazy-more.no-print', { type: 'button', onclick: function () { mem.limit += STEP * 4; draw(); } });
    var wrap = el('div.bigtable', [box, host, more]);
    box.hidden = (rows.length <= 15 && !mem.q) || !match;
    input.addEventListener('input', util.debounce(function () { mem.q = input.value; mem.limit = STEP; draw(); }, 110));

    function draw() {
      var limit = printing ? Infinity : mem.limit;
      var q = printing ? '' : mem.q.trim().toLowerCase();
      var shown = q && match ? match.pick(rows, q) : rows;
      util.clear(host);
      if (!shown.length) {
        host.appendChild(ui.empty(t('No one matches “{q}”', { q: mem.q.trim() }), null, null, 'search'));
        more.hidden = true;
        return;
      }
      host.appendChild(el('div.table-wrap', el('table.data', [
        el('thead', el('tr', columns.map(function (c) { return el('th' + (c.right ? '.right' : ''), { text: c.label }); }))),
        el('tbody', shown.slice(0, limit).map(function (r) {
          return el('tr', columns.map(function (c) {
            var v = c.render(r);
            return el('td' + (c.right ? '.right' : '') + (c.main ? '.main' : ''), { 'data-label': c.label }, v === null || v === undefined || v === '' ? '—' : v);
          }));
        }))
      ])));
      var left = shown.length - limit;
      more.hidden = left <= 0;
      if (left > 0) more.textContent = t('Show more') + ' · ' + t('{n} left', { n: util.fmtCount(left) });
    }
    // Paper gets every row, whatever is typed in the search box; the screen comes back after.
    wrap.printAll = function () { if (!printing) { printing = true; draw(); } };
    wrap.afterPrint = function () { if (printing) { printing = false; draw(); } };
    draw();
    return wrap;
  }

  function eachTable(fn) {
    var nodes = document.querySelectorAll('.bigtable');
    for (var i = 0; i < nodes.length; i++) if (nodes[i][fn]) nodes[i][fn]();
  }
  function printAll() { eachTable('printAll'); }
  window.addEventListener('beforeprint', printAll);
  window.addEventListener('afterprint', function () { eachTable('afterPrint'); });

  /** Searched like the chooser: S12 finds S0012, part of a name, a village or a mobile number. */
  function matchParty(idKey, nameKey) {
    var kind = idKey === 'customerId' ? 'customer' : 'supplier';
    return {
      pick: function (rows, q) {
        return ui.matcher(kind, q).pick(rows, function (r) { return r[idKey]; }, function (r) { return r[nameKey]; });
      }
    };
  }

  function supplierTable(data) {
    var rows = data.suppliers || [];
    return el('section.section', [
      ui.sectionHead(t('By supplier'), t('Most milk first. Net payable is milk value less advance still outstanding.')),
      el('div.card', [
        el('div.card__body', rows.length ? table([
          { label: t('Supplier'), main: true, render: function (r) { return r.supplierName + ' · ' + r.supplierId; } },
          { label: t('Entries'), right: true, render: function (r) { return String(r.entries); } },
          { label: t('Morning'), right: true, render: function (r) { return util.fmtNum(r.morningLitres, 1); } },
          { label: t('Evening'), right: true, render: function (r) { return util.fmtNum(r.eveningLitres, 1); } },
          { label: t('Litres'), right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
          { label: t('Milk value'), right: true, render: function (r) { return store.money(r.amount); } },
          { label: t('Advance'), right: true, render: function (r) { return r.advanceOutstanding > 0 ? store.money(r.advanceOutstanding) : '—'; } },
          { label: t('Net payable'), right: true, render: function (r) { return store.money(r.netPayable); } }
        ], rows, matchParty('supplierId', 'supplierName'), 'in') : ui.empty(t('No milk in for these dates'), t('Try other dates, or check the round filter.'))),
        el('div.card__foot.no-print', [
          el('button.btn.btn--sm', { type: 'button', onclick: function () { exportSuppliers(data); } }, [ui.icon('download'), el('span', { text: t('Summary file') })]),
          el('button.btn.btn--sm', { type: 'button', onclick: function (e) { exportRows(data, 'in', e.currentTarget); } }, [ui.icon('download'), el('span', { text: t('Every entry') })]),
          el('button.btn.btn--sm', { type: 'button', onclick: function () { printAll(); window.print(); } }, [ui.icon('print'), el('span', { text: t('Print') })])
        ])
      ])
    ]);
  }

  function customerTable(data) {
    var rows = data.customers || [];
    return el('section.section', [
      ui.sectionHead(t('By customer'), t('Most milk first. Balance is everything delivered less everything received.')),
      el('div.card', [
        el('div.card__body', rows.length ? table([
          { label: t('Customer'), main: true, render: function (r) { return r.customerName + ' · ' + r.customerId; } },
          { label: t('Entries'), right: true, render: function (r) { return String(r.entries); } },
          { label: t('Morning'), right: true, render: function (r) { return util.fmtNum(r.morningLitres, 1); } },
          { label: t('Evening'), right: true, render: function (r) { return util.fmtNum(r.eveningLitres, 1); } },
          { label: t('Litres'), right: true, render: function (r) { return util.fmtNum(r.litres, 1); } },
          { label: t('Billed'), right: true, render: function (r) { return store.money(r.amount); } },
          {
            label: t('Balance'), right: true, render: function (r) {
              if (r.outstanding > 0.001) return store.money(r.outstanding);
              if (r.outstanding < -0.001) return t('{a} credit', { a: store.money(-r.outstanding) });
              return '—';
            }
          }
        ], rows, matchParty('customerId', 'customerName'), 'out') : ui.empty(t('No milk out for these dates'), t('Try other dates, or check the round filter.'))),
        el('div.card__foot.no-print', [
          el('button.btn.btn--sm', { type: 'button', onclick: function () { exportCustomers(data); } }, [ui.icon('download'), el('span', { text: t('Summary file') })]),
          el('button.btn.btn--sm', { type: 'button', onclick: function (e) { exportRows(data, 'out', e.currentTarget); } }, [ui.icon('download'), el('span', { text: t('Every entry') })]),
          el('button.btn.btn--sm', { type: 'button', onclick: function () { printAll(); window.print(); } }, [ui.icon('print'), el('span', { text: t('Print') })])
        ])
      ])
    ]);
  }

  function exportSuppliers(data) {
    var rows = data.suppliers || [];
    util.downloadCsv('dakotax-suppliers-' + data.filter.from + '-to-' + data.filter.to + '.csv', util.toCsv(
      ['Supplier ID', 'Supplier', 'Entries', 'Morning litres', 'Evening litres', 'Total litres', 'Milk value', 'Advance outstanding', 'Net payable'],
      rows.map(function (r) { return [r.supplierId, r.supplierName, r.entries, r.morningLitres, r.eveningLitres, r.litres, r.amount, r.advanceOutstanding, r.netPayable]; })));
    ui.say.ok(t('File downloaded'), t('{n} rows', { n: rows.length }));
  }

  function exportCustomers(data) {
    var rows = data.customers || [];
    util.downloadCsv('dakotax-customers-' + data.filter.from + '-to-' + data.filter.to + '.csv', util.toCsv(
      ['Customer ID', 'Customer', 'Deliveries', 'Morning litres', 'Evening litres', 'Total litres', 'Billed', 'Balance owed'],
      rows.map(function (r) { return [r.customerId, r.customerName, r.entries, r.morningLitres, r.eveningLitres, r.litres, r.amount, r.outstanding]; })));
    ui.say.ok(t('File downloaded'), t('{n} rows', { n: rows.length }));
  }

  function exportRows(data, side, button) {
    var isIn = side === 'in';
    ui.busy(button, true, t('Preparing…'));
    DX.api.call(isIn ? 'collections.list' : 'sales.list', { filter: data.filter }, { timeout: 60000 }).then(function (res) {
      var rows = res[isIn ? 'collections' : 'sales'] || [];
      if (isIn) {
        util.downloadCsv('dakotax-milk-in-' + data.filter.from + '-to-' + data.filter.to + '.csv', util.toCsv(
          ['Date', 'Shift', 'Supplier ID', 'Supplier', 'Litres', 'Fat', 'SNF', 'Rate', 'Amount', 'Note'],
          rows.map(function (r) { return [r.date, r.shift, r.supplierId, r.supplierName, r.litres, r.fat, r.snf, r.ratePerLitre, r.amount, r.note]; })));
      } else {
        util.downloadCsv('dakotax-milk-out-' + data.filter.from + '-to-' + data.filter.to + '.csv', util.toCsv(
          ['Date', 'Shift', 'Customer ID', 'Customer', 'Litres', 'Rate', 'Amount', 'Note'],
          rows.map(function (r) { return [r.date, r.shift, r.customerId, r.customerName, r.litres, r.ratePerLitre, r.amount, r.note]; })));
      }
      ui.say.ok(t('File downloaded'), t('{n} rows', { n: rows.length }));
    }, function (err) { ui.reportError(err); }).then(function () { ui.busy(button, false); });
  }

  return {
    title: function () { return t('Reports'); },
    subtitle: function () { return state ? util.fmtDate(state.from, 'short') + ' – ' + util.fmtDate(state.to, 'short') : ''; },
    render: render
  };
})();

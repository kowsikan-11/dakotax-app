/* Advances — money handed to a supplier before their milk bill, and money taken back. */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.advances = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }
  var historyFor = '*';

  var REASONS = ['Festival', 'Medical', 'Cattle feed', 'Family function', 'School fees'];

  function render(root, ctx) {
    root.appendChild(el('p.hint', { style: 'margin:0 2px 12px', text: t('Give: money you hand over now. Take back: money they return, or that you cut from their milk bill.') }));

    var balanceLine = el('div');
    var picker = ui.picker({
      kind: 'supplier', label: t('Supplier'),
      describe: function (p) {
        var adv = store.advanceOf(p.supplierId);
        return adv > 0.001 ? { badge: store.money(adv, 0), tone: 'warn' } : {};
      },
      filters: function () {
        return [{ key: 'adv', label: t('Has advance'), test: function (p) { return store.advanceOf(p.supplierId) > 0.001; } }];
      },
      onChange: function () { paintBalance(); }
    });
    var typeField = ui.choice({
      label: t('What happened?'), name: 'adv-type', value: 'Given', stack: true,
      options: [
        { value: 'Given', label: t('Give advance'), sub: t('Money paid out to the supplier now'), icon: 'pay', tone: 'out' },
        { value: 'Recovered', label: t('Take back'), sub: t('Money returned, or cut from their milk bill'), icon: 'collect', tone: 'in' }
      ],
      onChange: function () { paintBalance(); }
    });
    var amountField = ui.field({ label: t('Amount'), name: 'amount', type: 'money', prefix: '₹', big: true, placeholder: '0.00' });
    var noteField = ui.field({ label: t('Reason'), name: 'note', optional: true, maxlength: 200 });
    var reasonHost = el('div.quick', REASONS.map(function (r) {
      return el('button.quick__btn', { type: 'button', onclick: function () { noteField.set(t(r)); } }, t(r));
    }));
    var dateField = ui.dateField({ label: t('Date'), value: util.localToday(), max: util.localToday() });
    var saveBtn = el('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, [ui.icon('check'), el('span', { text: t('Save') })]);

    function paintBalance() {
      util.clear(balanceLine);
      var p = picker.get();
      if (!p) return;
      var adv = store.advanceOf(p.supplierId);
      balanceLine.appendChild(el('div.amount-line', [
        el('small', { text: t('Advance outstanding now') }),
        el('b', { text: store.money(Math.max(adv, 0)) })
      ]));
      if (typeField.get() === 'Recovered' && adv > 0.001 && !amountField.value()) amountField.set(adv.toFixed(2));
    }

    var form = el('form.form-stack', { novalidate: true }, [
      picker, balanceLine, typeField, amountField, el('div.field', [noteField, reasonHost]), dateField, saveBtn
    ]);
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    root.appendChild(el('div.card', [el('div.card__head', [el('h2', { text: t('Record an advance') })]), el('div.card__body', form)]));

    function submit() {
      ui.clearFieldErrors(form);
      var p = picker.get();
      var amount = amountField.number();
      var type = typeField.get();
      var problems = [];
      function bad(c, m) { ui.setFieldError(c, m); problems.push(c); }
      if (!p) bad(picker.control, t('Choose the supplier first.'));
      if (!(amount > 0)) bad(amountField.control, t('Type the amount.'));
      if (p && type === 'Recovered' && amount > 0) {
        var adv = store.advanceOf(p.supplierId);
        if (amount > adv + 0.001) bad(amountField.control, adv > 0.001
          ? t('Only {a} is outstanding. You cannot take back more.', { a: store.money(adv) })
          : t('{name} has no advance to take back.', { name: p.name }));
      }
      if (problems.length) { try { problems[0].focus(); } catch (e) { /* ignore */ } return; }

      store.save('advance', {
        supplierId: p.supplierId, date: dateField.get(), type: type, amount: util.round(amount, 2), note: noteField.value().trim()
      }, null);
      ui.say.ok(type === 'Given' ? t('Advance given') : t('Advance taken back'),
        p.name + ' · ' + store.money(amount) + ' · ' + t('Now outstanding: {a}', { a: store.money(Math.max(store.advanceOf(p.supplierId), 0)) }));
      picker.clear(true);
      amountField.set(''); noteField.set('');
      typeField.set('Given', true);
      paintBalance();
    }

    /* --- who has advances --- */
    var owingFoot = el('div.card__foot');
    var owingList = ui.searchList({
      placeholder: t('Number, name, village or mobile'),
      items: function () {
        return store.people('supplier')
          .map(function (s) { return { s: s, adv: store.advanceOf(s.supplierId) }; })
          .filter(function (x) { return x.adv > 0.001; })
          .sort(function (a, b) { return b.adv - a.adv; });
      },
      kind: 'supplier', person: function (x) { return x.s; },
      empty: function () { return ui.empty(t('No advances outstanding'), t('Every advance has been taken back.'), null, 'check'); },
      render: function (x) {
        return ui.row({
          title: x.s.name, id: x.s.supplierId, sub: [x.s.supplierId, x.s.village].filter(Boolean).join(' · '),
          end: store.money(x.adv),
          onClick: function () { picker.set(x.s.supplierId); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        });
      }
    });
    ctx.cleanup(function () { owingList.destroy(); });
    root.appendChild(el('section.section', [ui.sectionHead(t('Advances outstanding'), t('Biggest first. Given minus taken back.')), el('div.card', [el('div.card__body', owingList), owingFoot])]));

    /* --- history --- */
    var historyPicker = ui.picker({
      kind: 'supplier', label: t('Show history for'), includeInactive: true, allowAll: true, allLabel: t('All suppliers'),
      value: historyFor,
      onChange: function (v) { historyFor = v === '*' ? '*' : (v ? v.supplierId : '*'); drawHistory(); }
    });
    var historyHost = el('div');
    root.appendChild(el('section.section', [
      ui.sectionHead(t('Advance history'), t('Newest first')),
      el('div.card', el('div.card__body', [historyPicker, historyHost]))
    ]));

    function drawOwing() {
      owingList.refresh();
      util.replace(owingFoot, el('span', { text: t('Total outstanding: {a}', { a: store.money(store.totalAdvances()) }) }));
    }

    function drawHistory() {
      var rows = store.rows('advance').filter(function (a) {
        return historyFor === '*' || String(a.supplierId).toLowerCase() === String(historyFor).toLowerCase();
      });
      util.clear(historyHost);
      if (!rows.length) { historyHost.appendChild(ui.empty(t('No advances recorded'), null, null, 'advance')); return; }
      historyHost.appendChild(el('div.list', { style: 'margin-top:8px' }, rows.slice(0, 60).map(function (a) {
        var given = a.type === 'Given';
        return ui.row({
          title: a.supplierName || a.supplierId, id: a.supplierId, tone: a._failed ? 'failed' : null,
          sub: util.fmtDate(a.date, 'short') + (a.note ? ' · ' + a.note : ''),
          note: a._failed && a._error ? a._error.message : null,
          badges: [ui.chip(given ? t('Given') : t('Taken back'), given ? 'warn' : 'ok'), ui.syncMark(a)],
          end: (given ? '' : '−') + store.money(a.amount),
          onClick: function () { menu(a); }
        });
      })));
      if (historyFor !== '*' || rows.length > 60) {
        historyHost.appendChild(el('div.btnrow', [el('button.btn.btn--sm', { type: 'button', onclick: function () { exportCsv(rows); } }, [ui.icon('download'), el('span', { text: t('CSV file') })])]));
      }
    }

    function exportCsv(rows) {
      util.downloadCsv('dakotax-advances-' + util.localToday() + '.csv', util.toCsv(
        ['Date', 'Supplier ID', 'Supplier', 'Type', 'Amount', 'Reason'],
        rows.map(function (r) { return [r.date, r.supplierId, r.supplierName, r.type, r.amount, r.note]; })));
      ui.say.ok(t('File downloaded'), t('{n} rows', { n: rows.length }));
    }

    function menu(a) {
      var opts = a._failed
        ? [{ value: 'retry', label: t('Try again'), icon: 'refresh' }, { value: 'discard', label: t('Remove'), icon: 'trash', tone: 'danger' }]
        : [{ value: 'delete', label: t('Delete this entry'), icon: 'trash', tone: 'danger' }];
      ui.actions({
        title: (a.supplierName || a.supplierId) + ' · ' + store.money(a.amount),
        message: a._failed && a._error ? a._error.message : (a.type === 'Given' ? t('Given') : t('Taken back')) + ' · ' + util.fmtDay(a.date),
        actions: opts
      }).then(function (choice) {
        if (!choice || !ctx.alive()) return;
        if (choice === 'retry') store.retry(a._qid);
        else if (choice === 'discard') store.discard(a._qid);
        else if (choice === 'delete') {
          ui.confirm({ title: t('Delete this entry?'), message: t('The outstanding advance will change.'), confirmLabel: t('Delete') }).then(function (yes) {
            if (!yes || !ctx.alive()) return;
            store.remove('advance', a);
            ui.say.ok(t('Deleted'), a.supplierName || '');
          });
        }
      });
    }

    drawOwing();
    drawHistory();
    ctx.onChange(function () { drawOwing(); drawHistory(); paintBalance(); picker.repaint(); });
  }

  return {
    title: function () { return t('Advances'); },
    subtitle: function () { return t('Outstanding: {a}', { a: store.money(store.totalAdvances(), 0) }); },
    render: render
  };
})();

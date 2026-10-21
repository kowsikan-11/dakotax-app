/* Money — two pages.
 *
 * Pay supplier  : a supplier's milk bill for some dates, less any advance taken back.
 * Collect money : cash in from a customer, lowering what they owe.
 */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

(function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }

  var MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Adjusted'];
  function modeChoice(name, value, label) {
    return ui.choice({
      label: label, name: name, value: value || 'Cash', compact: true,
      options: MODES.map(function (m) { return { value: m, label: t(m) }; })
    });
  }

  function rangeLabel(from, to) {
    var a = util.parseIso(from), b = util.parseIso(to);
    if (!a || !b) return '';
    if (from === to) return util.fmtDate(from, 'short');
    var months = DX.i18n.months();
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return a.getDate() + '–' + b.getDate() + ' ' + months[a.getMonth()];
    }
    return util.fmtDate(from, 'short') + ' – ' + util.fmtDate(to, 'short');
  }

  /** Ready-made periods with real dates on them: the 10-day cycles, this month, last month. */
  function periods() {
    var today = util.localToday();
    var d = util.parseIso(today);
    var y = d.getFullYear(), m = d.getMonth();
    function iso(yy, mm, dd) { return util.toIso(new Date(yy, mm, dd)); }
    var monthEndDay = new Date(y, m + 1, 0).getDate();
    var day = d.getDate();
    var out = [];
    var cycles = [[1, 10], [11, 20], [21, monthEndDay]];
    var nowIdx = day <= 10 ? 0 : day <= 20 ? 1 : 2;
    // The cycle before the current one (may be last month's 21–end).
    if (nowIdx === 0) {
      var pmEnd = new Date(y, m, 0).getDate();
      out.push({ from: iso(y, m - 1, 21), to: iso(y, m - 1, pmEnd) });
    } else {
      out.push({ from: iso(y, m, cycles[nowIdx - 1][0]), to: iso(y, m, cycles[nowIdx - 1][1]) });
    }
    out.push({ from: iso(y, m, cycles[nowIdx][0]), to: iso(y, m, Math.min(cycles[nowIdx][1], day)) });
    out.push({ from: util.monthStart(today), to: today, label: t('This month') });
    var lastEnd = util.addDays(util.monthStart(today), -1);
    out.push({ from: util.monthStart(lastEnd), to: lastEnd, label: t('Last month') });
    return out.map(function (p) { p.text = p.label ? p.label + ' (' + rangeLabel(p.from, p.to) + ')' : rangeLabel(p.from, p.to); return p; });
  }

  /* =================================================================== *
   * Pay a supplier
   * =================================================================== */
  function renderPay(root, ctx) {
    var due = null;
    var dueToken = 0;

    root.appendChild(el('p.hint', { style: 'margin:0 2px 12px', text: t('Choose the supplier and the dates. The app adds up their milk, takes off any advance you want back, and shows what to pay.') }));

    var picker = ui.picker({
      kind: 'supplier', label: t('Supplier'), includeInactive: true,
      describe: function (p) {
        var adv = store.advanceOf(p.supplierId);
        return adv > 0.001 ? { badge: t('Advance {a}', { a: store.money(adv, 0) }), tone: 'warn' } : {};
      },
      filters: function () {
        return [{ key: 'adv', label: t('Has advance'), test: function (p) { return store.advanceOf(p.supplierId) > 0.001; } }];
      },
      onChange: function () { calculate(); }
    });

    var quickHost = el('div.quick', { role: 'group', 'aria-label': t('Dates') });
    // Default: the last finished 10-day cycle — the one usually being paid.
    var fromField = ui.dateField({ label: t('From'), compact: true, value: periods()[0].from, max: util.localToday(), onChange: function () { paintQuick(); calculate(); } });
    var toField = ui.dateField({ label: t('To'), compact: true, value: periods()[0].to, max: util.localToday(), onChange: function () { paintQuick(); calculate(); } });

    function paintQuick() {
      util.clear(quickHost);
      periods().forEach(function (p) {
        var on = fromField.get() === p.from && toField.get() === p.to;
        quickHost.appendChild(el('button.quick__btn', {
          type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { fromField.set(p.from, true); toField.set(p.to, true); paintQuick(); calculate(); }
        }, p.text));
      });
    }

    var summary = el('div');
    var milkField = ui.field({ label: t('Milk amount for these dates'), name: 'milkAmount', type: 'money', prefix: '₹', big: true, placeholder: '0.00' });
    var recoverField = ui.field({ label: t('Take back from advance'), name: 'advanceRecovered', type: 'money', prefix: '₹', value: '0', optional: true });
    var recoverHint = el('p.hint');
    var netValue = el('b.money-big');
    var modeField = modeChoice('pay-mode', 'Cash', t('Paid by'));
    var refField = ui.field({ label: t('Reference'), name: 'reference', optional: true, maxlength: 60, placeholder: t('UPI ref, cheque number…') });
    var dateField = ui.dateField({ label: t('Paid on'), value: util.localToday(), max: util.localToday() });
    var noteField = ui.field({ label: t('Note'), name: 'note', optional: true, maxlength: 200 });
    var saveBtn = el('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, [ui.icon('check'), el('span', { text: t('Record payment') })]);

    function recalcNet() {
      var milk = milkField.number() || 0;
      var back = recoverField.number() || 0;
      netValue.textContent = store.money(Math.max(milk - back, 0));
    }
    milkField.control.addEventListener('input', recalcNet);
    recoverField.control.addEventListener('input', recalcNet);

    function paintRecoverHint() {
      var p = picker.get();
      var adv = p ? store.advanceOf(p.supplierId) : 0;
      recoverHint.textContent = !p ? '' : adv > 0.001 ? t('Advance outstanding: {a}. Leave 0 to take nothing back this time.', { a: store.money(adv) }) : t('No advance outstanding.');
    }

    function calculate() {
      var p = picker.get();
      paintRecoverHint();
      util.clear(summary);
      due = null;
      if (!p) return;
      var from = fromField.get(), to = toField.get();
      if (from > to) { summary.appendChild(ui.banner('warn', t('Check the dates'), t('“From” is after “To”.'))); return; }
      var token = ++dueToken;
      summary.appendChild(el('div.loading', [el('div.skeleton', { style: 'height:92px' })]));
      DX.api.call('payments.due', { supplierId: p.supplierId, from: from, to: to }, { timeout: 30000 }).then(function (result) {
        if (!ctx.alive() || token !== dueToken) return;
        due = result;
        util.clear(summary);
        summary.appendChild(el('div.card', { style: 'box-shadow:none;background:var(--surface-2)' }, el('div.card__body', el('dl.kv', [
          el('dt', { text: t('Milk in these dates') }), el('dd', { text: util.fmtLitres(result.litres) + ' · ' + t('{n} entries', { n: result.entries }) }),
          el('dt', { text: t('Milk value') }), el('dd', { text: store.money(result.milkAmount) }),
          el('dt', { text: t('Already paid for these dates') }), el('dd', { text: store.money(result.alreadyPaid) }),
          el('dt', { text: t('Advance outstanding') }), el('dd', { text: store.money(result.advanceOutstanding) }),
          el('dt.kv__total', { text: t('Still to pay for milk') }), el('dd.kv__total', { text: store.money(result.suggestedNet) })
        ]))));
        milkField.set(result.suggestedNet.toFixed(2));
        var back = Math.max(0, Math.min(result.advanceOutstanding, result.suggestedNet));
        recoverField.set(back.toFixed(2));
        recalcNet();
        if (result.entries === 0) ui.say.warn(t('No milk in these dates'), t('{name} has no entries from {a} to {b}.', { name: result.supplierName, a: util.fmtDate(from), b: util.fmtDate(to) }));
        else if (result.paidCount) ui.say.warn(t('Already paid'), t('There is already a payment for exactly these dates.'));
      }, function (err) {
        if (!ctx.alive() || token !== dueToken) return;
        util.clear(summary);
        summary.appendChild(ui.banner('warn', t('Could not add up the milk'),
          err && err.transport ? t('This needs the internet. You can still type the amount yourself.') : ui.explain(err).detail));
      });
    }

    var form = el('form.form-stack', { novalidate: true }, [
      picker,
      el('div.field', [el('label', { text: t('Dates') }), quickHost]),
      el('div.form-row', [fromField, toField]),
      summary,
      milkField,
      el('div', [recoverField, recoverHint]),
      el('div.amount-line', [el('small', { text: t('Pay now') }), netValue]),
      modeField, refField, dateField, noteField,
      saveBtn
    ]);
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    root.appendChild(el('div.card', [el('div.card__head', [el('h2', { text: t('Pay a supplier') })]), el('div.card__body', form)]));

    function submit() {
      ui.clearFieldErrors(form);
      var p = picker.get();
      var problems = [];
      function bad(control, msg) { ui.setFieldError(control, msg); problems.push(control); }
      if (!p) bad(picker.control, t('Choose the supplier first.'));
      var from = fromField.get(), to = toField.get();
      if (from > to) bad(fromField.control, t('“From” is after “To”.'));
      var milk = milkField.number();
      if (!(milk >= 0)) bad(milkField.control, t('Type the milk amount.'));
      var back = recoverField.value().trim() ? recoverField.number() : 0;
      if (!(back >= 0)) bad(recoverField.control, t('Type a number, or 0.'));
      if (p && back > 0) {
        var adv = store.advanceOf(p.supplierId);
        if (back > adv + 0.001) bad(recoverField.control, t('Only {a} of advance is outstanding.', { a: store.money(Math.max(adv, 0)) }));
        else if (milk >= 0 && back > milk + 0.001) bad(recoverField.control, t('Cannot take back more than the milk amount.'));
      }
      if (p) {
        var paid = store.rows('payment').filter(function (x) {
          return !x._failed && String(x.supplierId).toLowerCase() === p.supplierId.toLowerCase() && x.periodFrom === from && x.periodTo === to;
        })[0];
        if (paid) bad(fromField.control, t('{name} was already paid for these dates ({a} on {d}).', { name: p.name, a: store.money(paid.netAmount), d: util.fmtDate(paid.date, 'short') }));
      }
      if (problems.length) { try { problems[0].focus(); } catch (e) { /* ignore */ } return; }

      store.save('payment', {
        supplierId: p.supplierId, date: dateField.get(), periodFrom: from, periodTo: to,
        milkAmount: util.round(milk, 2), advanceRecovered: util.round(back, 2),
        mode: modeField.get(), reference: refField.value().trim(), note: noteField.value().trim()
      }, null);
      ui.say.ok(t('Payment recorded'), p.name + ' · ' + store.money(milk - back) + ' · ' + t(modeField.get()));
      picker.clear(true);
      milkField.set(''); recoverField.set('0'); refField.set(''); noteField.set('');
      util.clear(summary); due = null; recalcNet(); paintRecoverHint();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* --- recent payments --- */
    var listHost = el('div.card__body');
    root.appendChild(el('section.section', [ui.sectionHead(t('Recent payments'), t('Newest first')), el('div.card', listHost)]));

    function drawList() {
      var rows = store.rows('payment').slice(0, 40);
      util.clear(listHost);
      if (!rows.length) { listHost.appendChild(ui.empty(t('No payments yet'), t('Payments you record show here.'), null, 'pay')); return; }
      listHost.appendChild(el('div.list', rows.map(function (r) {
        return ui.row({
          title: r.supplierName || r.supplierId, id: r.supplierId, tone: r._failed ? 'failed' : null,
          sub: rangeLabel(r.periodFrom, r.periodTo) + ' · ' + t(r.mode) + ' · ' + util.fmtDate(r.date, 'short'),
          note: r._failed && r._error ? r._error.message : null,
          end: store.money(r.netAmount),
          endSub: r.advanceRecovered ? t('{a} advance taken back', { a: store.money(r.advanceRecovered, 0) }) : '',
          status: ui.syncMark(r),
          onClick: function () { paymentMenu(r); }
        });
      })));
    }

    function paymentMenu(r) {
      var opts = r._failed
        ? [{ value: 'retry', label: t('Try again'), icon: 'refresh' }, { value: 'discard', label: t('Remove'), icon: 'trash', tone: 'danger' }]
        : [{ value: 'delete', label: t('Delete this payment'), icon: 'trash', tone: 'danger' }];
      ui.actions({
        title: (r.supplierName || r.supplierId) + ' · ' + store.money(r.netAmount),
        message: r._failed && r._error ? r._error.message : rangeLabel(r.periodFrom, r.periodTo) + ' · ' + t(r.mode),
        actions: opts
      }).then(function (choice) {
        if (!choice || !ctx.alive()) return;
        if (choice === 'retry') store.retry(r._qid);
        else if (choice === 'discard') store.discard(r._qid);
        else if (choice === 'delete') {
          ui.confirm({
            title: t('Delete this payment?'),
            message: t('Any advance taken back with it stays on the Advances list — delete that too if it was a mistake.'),
            confirmLabel: t('Delete')
          }).then(function (yes) {
            if (!yes || !ctx.alive()) return;
            store.remove('payment', r);
            ui.say.ok(t('Deleted'), r.supplierName || '');
          });
        }
      });
    }

    paintQuick();
    paintRecoverHint();
    recalcNet();
    drawList();
    ctx.onChange(function () { drawList(); paintRecoverHint(); picker.repaint(); });
  }

  /* =================================================================== *
   * Collect from a customer
   * =================================================================== */
  function renderCollect(root, ctx) {
    root.appendChild(el('p.hint', { style: 'margin:0 2px 12px', text: t('Every payment lowers what the customer owes. Paying more than they owe is fine — it shows as credit.') }));

    var balanceHost = el('div');
    var picker = ui.picker({
      kind: 'customer', label: t('Customer'), includeInactive: true,
      describe: function (p) {
        var owed = store.owedBy(p.customerId);
        if (owed > 0.001) return { badge: t('Owes {a}', { a: store.money(owed, 0) }), tone: 'warn' };
        if (owed < -0.001) return { badge: t('Credit {a}', { a: store.money(-owed, 0) }), tone: 'ok' };
        return {};
      },
      filters: function () {
        return [
          { key: 'owes', label: t('Owes money'), test: function (p) { return store.owedBy(p.customerId) > 0.001; } },
          { key: 'credit', label: t('In credit'), test: function (p) { return store.owedBy(p.customerId) < -0.001; } }
        ];
      },
      onChange: function (p) {
        paintBalance();
        if (p) {
          var owed = store.owedBy(p.customerId);
          amountField.set(owed > 0.001 ? owed.toFixed(2) : '');
          try { amountField.control.focus(); } catch (e) { /* ignore */ }
        }
      }
    });

    var amountField = ui.field({ label: t('Amount received'), name: 'amount', type: 'money', prefix: '₹', big: true, placeholder: '0.00' });
    var quickHost = el('div.quick');
    var modeField = modeChoice('collect-mode', 'Cash', t('Received by'));
    var refField = ui.field({ label: t('Reference'), name: 'reference', optional: true, maxlength: 60, placeholder: t('UPI ref, cheque number…') });
    var dateField = ui.dateField({ label: t('Received on'), value: util.localToday(), max: util.localToday() });
    var noteField = ui.field({ label: t('Note'), name: 'note', optional: true, maxlength: 200 });
    var saveBtn = el('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, [ui.icon('check'), el('span', { text: t('Record money received') })]);

    function paintBalance() {
      util.clear(balanceHost);
      util.clear(quickHost);
      var p = picker.get();
      if (!p) return;
      var owed = store.owedBy(p.customerId);
      balanceHost.appendChild(el('div.amount-line', [
        el('small', { text: owed > 0.001 ? t('Owes you') : owed < -0.001 ? t('Paid ahead (credit)') : t('Settled up') }),
        el('b.money-big' + (owed > 0.001 ? '.money-big--owe' : owed < -0.001 ? '.money-big--good' : ''), { text: store.money(Math.abs(owed)) })
      ]));
      if (owed > 0.001) {
        [[t('Full {a}', { a: store.money(owed, 0) }), owed], [t('Half {a}', { a: store.money(owed / 2, 0) }), owed / 2]].forEach(function (q) {
          quickHost.appendChild(el('button.quick__btn', { type: 'button', onclick: function () { amountField.set(util.round(q[1], 2).toFixed(2)); } }, q[0]));
        });
      }
    }

    var form = el('form.form-stack', { novalidate: true }, [
      picker, balanceHost, amountField, quickHost, modeField, refField, dateField, noteField, saveBtn
    ]);
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    root.appendChild(el('div.card', [el('div.card__head', [el('h2', { text: t('Money received from a customer') })]), el('div.card__body', form)]));

    function submit() {
      ui.clearFieldErrors(form);
      var p = picker.get();
      var amount = amountField.number();
      var problems = [];
      if (!p) { ui.setFieldError(picker.control, t('Choose the customer first.')); problems.push(picker.control); }
      if (!(amount > 0)) { ui.setFieldError(amountField.control, t('Type the amount received.')); problems.push(amountField.control); }
      if (problems.length) { try { problems[0].focus(); } catch (e) { /* ignore */ } return; }

      var date = dateField.get();
      var twin = store.rows('receipt').filter(function (r) {
        return !r._failed && r.date === date && String(r.customerId).toLowerCase() === p.customerId.toLowerCase() && Math.abs(r.amount - amount) < 0.005;
      })[0];
      var go = twin
        ? ui.confirm({
          title: t('Save it again?'),
          message: t('{name} already has {a} recorded on {d}. Save another one?', { name: p.name, a: store.money(amount), d: util.fmtDate(date, 'short') }),
          confirmLabel: t('Yes, save'), danger: false
        })
        : Promise.resolve(true);
      go.then(function (yes) {
        if (!yes || !ctx.alive()) return;
        store.save('receipt', {
          customerId: p.customerId, date: date, amount: util.round(amount, 2),
          mode: modeField.get(), reference: refField.value().trim(), note: noteField.value().trim()
        }, null);
        var left = store.owedBy(p.customerId);
        ui.say.ok(t('Money received'), p.name + ' · ' + store.money(amount) + ' · ' +
          (left > 0.001 ? t('{a} still owed', { a: store.money(left) }) : left < -0.001 ? t('{a} in credit', { a: store.money(-left) }) : t('settled up')));
        picker.clear(true);
        amountField.set(''); refField.set(''); noteField.set('');
        paintBalance();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* --- who owes, and recent money in --- */
    var owingFoot = el('div.card__foot');
    var recentHost = el('div.card__body');
    var owingList = ui.searchList({
      placeholder: t('Number, name, area or mobile'),
      items: function () {
        return store.people('customer')
          .map(function (c) { return { c: c, owed: store.owedBy(c.customerId) }; })
          .filter(function (x) { return x.owed > 0.001; })
          .sort(function (a, b) { return b.owed - a.owed; });
      },
      kind: 'customer', person: function (x) { return x.c; },
      empty: function () { return ui.empty(t('Nobody owes you money'), null, null, 'check'); },
      render: function (x) {
        return ui.row({
          title: x.c.name, id: x.c.customerId, sub: [x.c.customerId, x.c.address].filter(Boolean).join(' · '),
          end: store.money(x.owed), endSub: t('owes'),
          onClick: function () { picker.set(x.c.customerId); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        });
      }
    });
    ctx.cleanup(function () { owingList.destroy(); });
    root.appendChild(el('section.section', [ui.sectionHead(t('Who owes you'), t('Most owed first. Tap a name to collect.')), el('div.card', [el('div.card__body', owingList), owingFoot])]));
    root.appendChild(el('section.section', [ui.sectionHead(t('Recent money received'), t('Newest first')), el('div.card', recentHost)]));

    function drawLists() {
      owingList.refresh();
      var owingCount = store.people('customer').filter(function (c) { return store.owedBy(c.customerId) > 0.001; }).length;
      util.replace(owingFoot, el('span', { text: t('Total owed to you: {a}', { a: store.money(store.totalReceivable()) }) + (owingCount ? ' · ' + t('{n} customers', { n: util.fmtCount(owingCount) }) : '') }));

      var rows = store.rows('receipt').slice(0, 40);
      util.clear(recentHost);
      if (!rows.length) { recentHost.appendChild(ui.empty(t('No money received yet'), null, null, 'collect')); return; }
      recentHost.appendChild(el('div.list', rows.map(function (r) {
        return ui.row({
          title: r.customerName || r.customerId, id: r.customerId, tone: r._failed ? 'failed' : null,
          sub: util.fmtDate(r.date, 'short') + ' · ' + t(r.mode) + (r.reference ? ' · ' + r.reference : ''),
          note: r._failed && r._error ? r._error.message : null,
          end: store.money(r.amount), status: ui.syncMark(r),
          onClick: function () { receiptMenu(r); }
        });
      })));
    }

    function receiptMenu(r) {
      var opts = r._failed
        ? [{ value: 'retry', label: t('Try again'), icon: 'refresh' }, { value: 'discard', label: t('Remove'), icon: 'trash', tone: 'danger' }]
        : [{ value: 'delete', label: t('Delete this entry'), icon: 'trash', tone: 'danger' }];
      ui.actions({
        title: (r.customerName || r.customerId) + ' · ' + store.money(r.amount),
        message: r._failed && r._error ? r._error.message : util.fmtDay(r.date) + ' · ' + t(r.mode),
        actions: opts
      }).then(function (choice) {
        if (!choice || !ctx.alive()) return;
        if (choice === 'retry') store.retry(r._qid);
        else if (choice === 'discard') store.discard(r._qid);
        else if (choice === 'delete') {
          ui.confirm({ title: t('Delete this entry?'), message: t('What they owe goes back up by {a}.', { a: store.money(r.amount) }), confirmLabel: t('Delete') })
            .then(function (yes) {
              if (!yes || !ctx.alive()) return;
              store.remove('receipt', r);
              ui.say.ok(t('Deleted'), r.customerName || '');
            });
        }
      });
    }

    drawLists();
    ctx.onChange(function () { drawLists(); paintBalance(); picker.repaint(); });
  }

  DX.pages.pay = {
    title: function () { return t('Pay supplier'); },
    subtitle: function () { return t('Advances out: {a}', { a: store.money(store.totalAdvances(), 0) }); },
    render: renderPay
  };
  DX.pages.collect = {
    title: function () { return t('Collect money'); },
    subtitle: function () { return t('Owed to you: {a}', { a: store.money(store.totalReceivable(), 0) }); },
    render: renderCollect
  };
})();

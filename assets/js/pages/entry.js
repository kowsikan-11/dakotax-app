/* Milk In and Milk Out — two separate pages built from one recipe.
 *
 * Milk In  : collected from a supplier. Money will flow out to them.
 * Milk Out : delivered to a customer.  Money will flow in from them.
 *
 * Saving is instant: the entry is checked here first (missing fields, a
 * second entry for the same person in the same round), then queued and sent
 * in the background. The list below shows each entry's state.
 */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

(function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }

  function makeEntryPage(dir) {
    var IN = dir === 'in';
    var kind = IN ? 'collection' : 'sale';
    var personKind = IN ? 'supplier' : 'customer';
    var idKey = IN ? 'supplierId' : 'customerId';
    var nameKey = IN ? 'supplierName' : 'customerName';
    var rowId = IN ? 'entryId' : 'saleId';

    function defaultRate(person) {
      return (person && Number(person.ratePerLitre)) || (IN ? store.defaultRate() : store.defaultSaleRate()) || '';
    }

    function shiftLabel(shift) { return shift === 'Morning' ? t('Morning') : t('Evening'); }

    function render(root, ctx) {
      var round = store.round();
      var editing = null;

      /* ---------------- top band: which page this is ---------------- */
      root.appendChild(el('div.hero.hero--' + dir, [
        el('span.hero__icon', ui.icon(dir)),
        el('div.hero__text', [
          el('b', { text: IN ? t('Milk In — from suppliers') : t('Milk Out — to customers') }),
          el('small', { text: IN ? t('Milk you buy. You pay the supplier.') : t('Milk you sell. The customer pays you.') })
        ])
      ]));

      /* ---------------- the round: date + morning/evening ---------------- */
      var dateField = ui.dateField({
        label: t('Date'), value: round.date, arrows: true,
        max: store.allowFuture() ? null : util.localToday(),
        onChange: function (d) { store.setRound(d, shiftField.get()); }
      });
      var shiftField = ui.choice({
        label: t('Round'), name: 'shift-' + dir, value: round.shift, columns: 2,
        options: [
          { value: 'Morning', label: t('Morning'), icon: 'sun', tone: 'morning' },
          { value: 'Evening', label: t('Evening'), icon: 'moon', tone: 'evening' }
        ],
        onChange: function (v) { store.setRound(dateField.get(), v); }
      });
      var roundNote = el('div.roundbar__warn');
      root.appendChild(el('div.card', el('div.card__body.roundbar', [dateField, shiftField, roundNote])));

      /* ---------------- progress for this round ---------------- */
      var progressHost = el('div');
      root.appendChild(el('div.section', progressHost));

      /* ---------------- the form ---------------- */
      var formTitle = el('h2');
      var formSub = el('p');
      var infoLine = el('div');
      var dupLine = el('div');

      var picker = ui.picker({
        kind: personKind,
        label: IN ? t('Supplier') : t('Customer'),
        describe: describePerson,
        isDone: isDone,
        filters: function () {
          return [
            { key: 'left', label: t('Not recorded yet'), test: function (p) { return !isDone(p); } },
            { key: 'done', label: t('Recorded'), test: isDone }
          ];
        },
        onAdd: function (typed, done) {
          DX.pages.people.openForm(personKind, null, { name: typed }, function (id) { done(id); });
        },
        onChange: function (person) {
          if (person && !editing) {
            rateField.set(defaultRate(person));
          }
          paintInfo();
          recalc();
          // Straight on to the litres — inside the tap, so the phone keyboard opens.
          if (person) { try { litresField.control.focus(); } catch (e) { /* ignore */ } }
        }
      });

      var litresField = ui.field({
        label: t('Litres'), name: 'litres', type: 'number', big: true, suffix: 'L', placeholder: '0.0', enterkeyhint: 'done'
      });
      var rateField = ui.field({
        label: t('Rate per litre'), name: 'ratePerLitre', type: 'money', prefix: store.currency() === 'INR' ? '₹' : '', value: defaultRate(null)
      });
      var fatField = IN ? ui.field({ label: t('Fat %'), name: 'fat', type: 'number', optional: true, placeholder: '4.5' }) : null;
      var snfField = IN ? ui.field({ label: t('SNF %'), name: 'snf', type: 'number', optional: true, placeholder: '8.5' }) : null;
      var noteField = ui.field({ label: t('Note'), name: 'note', optional: true, maxlength: 200 });
      var details = el('details.more', [
        el('summary', [ui.icon('down'), el('span', { text: IN ? t('More details (fat, SNF, note)') : t('Add a note') })]),
        el('div.form-stack', [IN ? el('div.form-row', [fatField, snfField]) : null, noteField])
      ]);

      var amountValue = el('b', { text: store.money(0) });
      var amountSub = el('small');
      var amountLine = el('div.amount-line', [el('div', [el('small', { text: t('Amount') }), el('br'), amountSub]), amountValue]);

      var saveBtn = el('button.btn.btn--lg.btn--block.btn--' + dir, { type: 'submit' });
      var cancelBtn = el('button.btn.btn--ghost', { type: 'button', onclick: function () { resetForm(); } }, t('Cancel'));
      var deleteBtn = el('button.btn.btn--danger', { type: 'button', onclick: function () { if (editing) askDelete(editing); } }, [ui.icon('trash'), el('span', { text: t('Delete') })]);
      var editButtons = el('div.btnrow', [cancelBtn, deleteBtn]);

      var form = el('form.form-stack', { novalidate: true, autocomplete: 'off' }, [
        picker, infoLine, dupLine,
        el('div.form-row', [litresField, rateField]),
        amountLine,
        details,
        saveBtn,
        editButtons
      ]);
      var formCard = el('div.card', [
        el('div.card__head', [formTitle, formSub]),
        el('div.card__body', form)
      ]);
      root.appendChild(el('div.section', formCard));

      litresField.control.addEventListener('input', recalc);
      rateField.control.addEventListener('input', recalc);
      form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });

      /* ---------------- this round's list, and who is left ---------------- */
      var listHead = el('div');
      var listQuery = '';
      var listLazy = null;
      var listSearch = el('input.search__input', {
        type: 'search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
        'aria-label': t('Find in this round'), placeholder: t('Find in this round: number or name')
      });
      var onListSearch = util.debounce(function () { if (!ctx.alive()) return; listQuery = listSearch.value; paintList(); }, 110);
      listSearch.addEventListener('input', onListSearch);
      var listTools = el('div.card__body', { style: 'padding-bottom:0' }, el('div.search.inline-search', { style: 'margin-bottom:0' }, [ui.icon('search'), listSearch]));
      var listBody = el('div.card__body');
      var listFoot = el('div.card__foot');
      root.appendChild(el('section.section', [listHead, el('div.card', [listTools, listBody, listFoot])]));
      ctx.cleanup(function () { onListSearch.cancel(); if (listLazy) listLazy.destroy(); });

      var todoHost = el('div');
      root.appendChild(el('section.section', todoHost));

      /* ================================================================ */

      function current() { var r = store.round(); return { date: r.date, shift: r.shift, auto: r.auto }; }

      function roundRows() {
        var r = current();
        return store.rowsOn(kind, r.date, r.shift).slice().sort(function (a, b) {
          return String(b.recordedAt).localeCompare(String(a.recordedAt));
        });
      }

      var doneCache = null;
      function doneMap() {
        if (doneCache) return doneCache;
        var map = {};
        roundRows().forEach(function (r) { if (!r._failed) map[String(r[idKey]).toLowerCase()] = r; });
        doneCache = map;
        return map;
      }

      function isDone(p) { return !!doneMap()[String(p[idKey]).toLowerCase()]; }

      function describePerson(p) {
        var done = doneMap()[String(p[idKey]).toLowerCase()];
        if (done) return { done: true, badge: util.fmtLitres(done.litres), tone: 'ok' };
        var rate = Number(p.ratePerLitre);
        return { meta: rate ? store.money(rate) + '/L' : '' };
      }

      function paintRound() {
        var r = current();
        dateField.set(r.date, true);
        shiftField.set(r.shift, true);
        util.clear(roundNote);
        if (!r.auto) {
          roundNote.appendChild(ui.banner('warn',
            t('Not the current round'),
            t('You are entering for {shift}, {date}.', { shift: shiftLabel(r.shift), date: util.fmtDay(r.date) }),
            el('button.btn.btn--sm', { type: 'button', onclick: function () { store.resetRound(); } }, t('Back to now'))));
        } else {
          roundNote.appendChild(el('p.info-line', [ui.icon('clock'), el('span', {
            text: t('Picked by the clock — it is {time}. Change it if you are catching up.', { time: util.clockLabel() })
          })]));
        }
        ctx.retitle();
      }

      function paintProgress() {
        var rows = roundRows().filter(function (r) { return !r._failed; });
        var active = store.activePeople(personKind);
        var all = active.length;
        var done = doneMap();
        var doneCount = active.filter(function (p) { return done[String(p[idKey]).toLowerCase()]; }).length;
        var litres = util.sum(rows, 'litres');
        var amount = util.sum(rows, 'amount');
        var pct = all ? Math.min(100, Math.round(doneCount / all * 100)) : 0;
        util.replace(progressHost, el('div.card', el('div.card__body', el('div.progress.progress--' + dir, [
          el('div.progress__text', [
            el('span', { text: IN ? t('{done} of {all} suppliers', { done: util.fmtCount(doneCount), all: util.fmtCount(all) }) : t('{done} of {all} customers', { done: util.fmtCount(doneCount), all: util.fmtCount(all) }) }),
            el('span', [el('b', { text: util.fmtLitres(litres) }), ' · ', store.money(amount)])
          ]),
          el('div.progress__bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all), 'aria-valuenow': String(doneCount) },
            el('div.progress__fill', { style: 'width:' + pct + '%' }))
        ]))));
      }

      function rowFor(rec) {
        var bits = [rec[idKey]];
        if (IN && rec.fat !== null && rec.fat !== undefined && rec.fat !== '') bits.push(t('Fat') + ' ' + rec.fat);
        if (IN && rec.snf !== null && rec.snf !== undefined && rec.snf !== '') bits.push('SNF ' + rec.snf);
        if (rec.note) bits.push(rec.note);
        return ui.row({
          title: rec[nameKey] || rec[idKey], id: rec[idKey], tone: rec._failed ? 'failed' : null,
          sub: bits.join(' · '),
          note: rec._failed && rec._error ? rec._error.message : null,
          end: util.fmtLitres(rec.litres), endSub: store.money(rec.amount),
          status: ui.syncMark(rec),
          onClick: function () { rowMenu(rec); }
        });
      }

      function paintList() {
        var r = current();
        var rows = roundRows();
        var keep = listLazy ? listLazy.shown() : 0;
        if (listLazy) { listLazy.destroy(); listLazy = null; }
        util.replace(listHead, ui.sectionHead(
          IN ? t('Milk in this round') : t('Milk out this round'),
          shiftLabel(r.shift) + ' · ' + util.fmtDay(r.date)));
        util.clear(listBody);
        listTools.hidden = rows.length <= 12 && !listQuery.trim();

        if (!store.isComplete(kind, r.date)) {
          listBody.appendChild(el('div.loading', [el('div.skeleton', { style: 'height:56px' }), el('div.skeleton', { style: 'height:56px' })]));
          store.ensureDay(kind, r.date).then(function (ok) {
            if (!ctx.alive() || ok) return;
            util.replace(listBody, ui.banner('warn', t('Could not load this day'), t('Older days need the internet. The sheet still blocks double entries when you save.')));
          });
          listFoot.hidden = true;
          return;
        }

        if (!rows.length) {
          listBody.appendChild(ui.empty(
            t('Nothing in this round yet'),
            IN ? t('Saved entries appear here, so you can check them against the cans.') : t('Saved deliveries appear here, so you can check the round.'),
            null, dir));
          listFoot.hidden = true;
          return;
        }
        var q = listQuery.trim();
        var shown = q ? ui.matcher(personKind, q).pick(rows,
          function (rec) { return rec[idKey]; }, function (rec) { return rec[nameKey]; }) : rows;
        if (!shown.length) {
          listBody.appendChild(ui.empty(t('No one matches “{q}”', { q: listQuery.trim() }), t('Only this round is searched.'), null, 'search'));
        } else {
          listLazy = ui.lazyList(listBody, shown, rowFor, { step: 30, initial: keep });
        }
        var ok = rows.filter(function (x) { return !x._failed; });
        listFoot.hidden = false;
        util.replace(listFoot, el('span', {
          text: t('{n} entries', { n: ok.length }) + ' · ' + util.fmtLitres(util.sum(ok, 'litres')) + ' · ' + store.money(util.sum(ok, 'amount'))
        }));
      }

      function paintTodo() {
        var done = doneMap();
        var left = store.search(personKind, '', { filter: function (p) { return p.status !== 'Inactive' && !done[String(p[idKey]).toLowerCase()]; } });
        util.clear(todoHost);
        if (!store.activePeople(personKind).length) {
          todoHost.appendChild(el('div.card', el('div.card__body', ui.empty(
            IN ? t('No suppliers yet') : t('No customers yet'),
            IN ? t('Add the people who bring you milk first.') : t('Add the people you sell milk to first.'),
            el('a.btn.btn--primary', { href: '#/people/' + (IN ? 'suppliers' : 'customers') }, [ui.icon('plus'), el('span', { text: IN ? t('Add supplier') : t('Add customer') })]),
            'people'))));
          return;
        }
        if (!left.length) {
          todoHost.appendChild(ui.banner('ok', IN ? t('Every supplier is recorded for this round') : t('Every customer is recorded for this round'), null));
          return;
        }
        var many = left.length > 40;
        var shown = left.slice(0, many ? 24 : 40);
        todoHost.appendChild(ui.sectionHead(
          t('Not recorded yet ({n})', { n: util.fmtCount(left.length) }),
          many ? t('The first numbers still to come. Tap one to fill it in above.') : t('Tap a name to fill it in above.')));
        todoHost.appendChild(el('div.todo', shown.map(function (p) {
          return el('button.todo__btn', {
            type: 'button',
            onclick: function () {
              if (editing) resetForm();
              picker.set(p[idKey]);
              formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, [ui.avatar(p.name, p[idKey], true), el('span', { text: many ? p[idKey] + ' · ' + p.name : p.name })]);
        })));
        if (many) {
          todoHost.appendChild(el('button.btn.btn--block', {
            type: 'button', style: 'margin-top:10px',
            onclick: function () {
              if (editing) resetForm();
              picker.open({ filter: 'left', keyboard: false });
            }
          }, [ui.icon('search'), el('span', { text: t('See all {n} not recorded — by village or number', { n: util.fmtCount(left.length) }) })]));
        }
      }

      function paintInfo() {
        util.clear(infoLine);
        util.clear(dupLine);
        var person = picker.get();
        if (!person) return;
        if (IN) {
          var adv = store.advanceOf(person.supplierId);
          infoLine.appendChild(el('p.info-line', [ui.icon('info'), el('span', {
            text: adv > 0.001 ? t('Advance not yet recovered: {a}', { a: store.money(adv) }) : t('No advance outstanding.')
          })]));
        } else {
          var owed = store.owedBy(person.customerId);
          infoLine.appendChild(el('p.info-line', [ui.icon('info'), el('span', {
            text: owed > 0.001 ? t('Owes you {a} so far.', { a: store.money(owed) })
              : owed < -0.001 ? t('Paid ahead: {a} in credit.', { a: store.money(-owed) }) : t('Settled up — owes nothing.')
          })]));
        }
        var r = current();
        var dup = store.findDuplicate(kind, r.date, person[idKey], r.shift, editing ? editing[rowId] : null);
        if (dup) {
          dupLine.appendChild(ui.banner('warn',
            t('Already recorded this round'),
            t('{name} already has {litres} for {shift}. Edit that entry instead of adding another.', { name: person.name, litres: util.fmtLitres(dup.litres), shift: shiftLabel(r.shift) }),
            el('button.btn.btn--sm', { type: 'button', onclick: function () { loadForEdit(dup); } }, t('Edit it'))));
        }
      }

      function recalc() {
        var litres = litresField.number();
        var rate = rateField.number();
        if (litres > 0 && rate > 0) {
          amountValue.textContent = store.money(litres * rate);
          amountSub.textContent = util.fmtLitres(litres) + ' × ' + store.money(rate);
        } else {
          amountValue.textContent = store.money(0);
          amountSub.textContent = t('Enter litres to see the amount');
        }
      }

      function paintFormMode() {
        if (editing) {
          formTitle.textContent = t('Change entry');
          formSub.textContent = (editing[nameKey] || '') + ' · ' + shiftLabel(editing.shift) + ' · ' + util.fmtDay(editing.date);
          saveBtn.innerHTML = '';
          saveBtn.appendChild(ui.icon('check'));
          saveBtn.appendChild(el('span', { text: t('Save changes') }));
          editButtons.hidden = false;
          formCard.classList.add('card--editing');
        } else {
          formTitle.textContent = IN ? t('New milk in entry') : t('New milk out entry');
          formSub.textContent = IN ? t('Choose the supplier, type the litres, save.') : t('Choose the customer, type the litres, save.');
          saveBtn.innerHTML = '';
          saveBtn.appendChild(ui.icon('check'));
          saveBtn.appendChild(el('span', { text: t('Save') }));
          editButtons.hidden = true;
          formCard.classList.remove('card--editing');
        }
      }

      function resetForm() {
        editing = null;
        ui.clearFieldErrors(form);
        picker.clear(true);
        litresField.set('');
        rateField.set(defaultRate(null));
        if (fatField) fatField.set('');
        if (snfField) snfField.set('');
        noteField.set('');
        details.open = false;
        paintInfo();
        recalc();
        paintFormMode();
      }

      function loadForEdit(rec) {
        var r = current();
        if (rec.date !== r.date || rec.shift !== r.shift) store.setRound(rec.date, rec.shift);
        editing = rec;
        ui.clearFieldErrors(form);
        picker.set(rec[idKey], true);
        litresField.set(rec.litres);
        rateField.set(rec.ratePerLitre);
        if (fatField) fatField.set(rec.fat === null || rec.fat === undefined ? '' : rec.fat);
        if (snfField) snfField.set(rec.snf === null || rec.snf === undefined ? '' : rec.snf);
        noteField.set(rec.note || '');
        details.open = !!(rec.note || (IN && (rec.fat || rec.snf)));
        paintInfo();
        recalc();
        paintFormMode();
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(function () { try { litresField.control.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 250);
      }

      function rowMenu(rec) {
        var opts;
        if (rec._failed) {
          opts = [
            { value: 'fix', label: t('Fix and save again'), icon: 'edit' },
            { value: 'retry', label: t('Try again as it is'), icon: 'refresh' },
            { value: 'discard', label: t('Remove this entry'), icon: 'trash', tone: 'danger' }
          ];
        } else {
          opts = [
            { value: 'edit', label: t('Change this entry'), icon: 'edit' },
            { value: 'delete', label: t('Delete this entry'), icon: 'trash', tone: 'danger' }
          ];
        }
        ui.actions({
          title: (rec[nameKey] || rec[idKey]) + ' · ' + util.fmtLitres(rec.litres),
          message: rec._failed && rec._error ? rec._error.message : shiftLabel(rec.shift) + ' · ' + util.fmtDay(rec.date) + ' · ' + store.money(rec.amount),
          actions: opts
        }).then(function (choice) {
          if (!ctx.alive() || !choice) return;
          if (choice === 'edit' || choice === 'fix') loadForEdit(rec);
          else if (choice === 'retry') store.retry(rec._qid);
          else if (choice === 'discard') { store.discard(rec._qid); ui.say.ok(t('Removed')); }
          else if (choice === 'delete') askDelete(rec);
        });
      }

      function askDelete(rec) {
        ui.confirm({
          title: IN ? t('Delete this entry?') : t('Delete this delivery?'),
          message: (rec[nameKey] || rec[idKey]) + ' · ' + shiftLabel(rec.shift) + ' · ' + util.fmtLitres(rec.litres) + ' · ' + util.fmtDay(rec.date),
          confirmLabel: t('Delete')
        }).then(function (yes) {
          if (!yes || !ctx.alive()) return;
          if (editing && editing[rowId] === rec[rowId]) resetForm();
          store.remove(kind, rec);
          ui.say.ok(t('Deleted'), rec[nameKey] || '');
        });
      }

      function submit() {
        ui.clearFieldErrors(form);
        var r = current();
        var person = picker.get();
        var problems = [];
        function bad(control, message) { ui.setFieldError(control, message); problems.push(control); }

        if (!person) bad(picker.control, IN ? t('Choose the supplier first.') : t('Choose the customer first.'));
        var litres = litresField.number();
        var max = store.maxLitres();
        if (!(litres > 0)) bad(litresField.control, t('Type the litres, for example 8.5'));
        else if (litres > max) bad(litresField.control, t('{n} L is more than the limit of {max} L. Check the number.', { n: litres, max: max }));
        var rate = rateField.number();
        if (!(rate > 0)) bad(rateField.control, t('Type the rate per litre.'));
        else if (rate > 5000) bad(rateField.control, t('That rate looks too high. Check the number.'));
        var fat = fatField ? fatField.value().trim() : '';
        var snf = snfField ? snfField.value().trim() : '';
        if (fat && !(util.parseNum(fat) >= 0 && util.parseNum(fat) <= 15)) { details.open = true; bad(fatField.control, t('Fat % should be between 0 and 15.')); }
        if (snf && !(util.parseNum(snf) >= 0 && util.parseNum(snf) <= 15)) { details.open = true; bad(snfField.control, t('SNF % should be between 0 and 15.')); }
        if (!store.allowFuture() && r.date > util.localToday()) bad(dateField.control, t('That date is in the future.'));

        if (person && !editing && person.status === 'Inactive') {
          bad(picker.control, t('{name} is stopped. Start them again on the People page first.', { name: person.name }));
        }
        if (person) {
          var dup = store.findDuplicate(kind, r.date, person[idKey], r.shift, editing ? editing[rowId] : null);
          if (dup) bad(picker.control, t('{name} already has {litres} for {shift} on {date}. Edit that entry instead.', {
            name: person.name, litres: util.fmtLitres(dup.litres), shift: shiftLabel(r.shift), date: util.fmtDate(r.date, 'short')
          }));
        }
        if (problems.length) {
          // The message sits under the field itself; bring the first one into view.
          try { problems[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); problems[0].focus({ preventScroll: true }); } catch (e) { /* ignore */ }
          return;
        }

        var data = {
          date: r.date, shift: r.shift, litres: litres, ratePerLitre: rate, note: noteField.value().trim()
        };
        data[idKey] = person[idKey];
        if (IN) { data.fat = fat ? util.parseNum(fat) : ''; data.snf = snf ? util.parseNum(snf) : ''; }

        var wasEditing = !!editing;
        store.save(kind, data, editing);
        var offline = store.status().offline;
        ui.say.ok(wasEditing ? t('Changes saved') : t('Saved'),
          person.name + ' · ' + util.fmtLitres(litres) + ' · ' + store.money(litres * rate) +
          (offline ? ' · ' + t('will send when online') : ''));
        resetForm();
        try { picker.control.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }

      function refresh() {
        doneCache = null;
        paintProgress();
        paintList();
        paintTodo();
        paintInfo();
        picker.repaint();
      }

      paintRound();
      paintFormMode();
      recalc();
      refresh();

      ctx.onChange(function () {
        if (editing) {
          // The row being edited may have just been confirmed under its real ID.
          var realId = store.resolve(editing[rowId]);
          var fresh = null;
          store.rows(kind).forEach(function (x) { if (x[rowId] === realId) fresh = x; });
          if (fresh) editing = fresh;
        }
        refresh();
      });
      ctx.onRound(function (r) {
        doneCache = null;
        var dirty = !!picker.get() || !!litresField.value();
        paintRound();
        refresh();
        if (r.auto && dirty) ui.say.info(t('Now the {shift} round', { shift: shiftLabel(r.shift) }));
      });
      ctx.cleanup(function () { editing = null; });
    }

    return {
      title: function () { return IN ? t('Milk In') : t('Milk Out'); },
      subtitle: function () {
        var r = store.round();
        return shiftLabel(r.shift) + ' · ' + util.fmtDay(r.date);
      },
      render: render
    };
  }

  DX.pages.milkin = makeEntryPage('in');
  DX.pages.milkout = makeEntryPage('out');
})();

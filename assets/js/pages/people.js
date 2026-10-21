/* People — suppliers (you pay them) and customers (they pay you). */
window.DX = window.DX || {}; DX.pages = DX.pages || {};

DX.pages.people = (function () {
  var util = DX.util, ui = DX.ui, store = DX.store, el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }

  var SIDES = {
    supplier: {
      sub: 'suppliers', idKey: 'supplierId', subKey: 'village', prefix: 'S',
      noun: function () { return t('supplier'); },
      Title: function () { return t('Suppliers'); },
      subLabel: function () { return t('Village'); },
      subHint: function () { return t('Village or route'); },
      blurb: function () { return t('People who bring you milk. You pay them.'); },
      rate: function () { return store.defaultRate(); },
      rateHint: function () { return t('What you pay them for one litre. Filled in on every entry.'); }
    },
    customer: {
      sub: 'customers', idKey: 'customerId', subKey: 'address', prefix: 'C',
      noun: function () { return t('customer'); },
      Title: function () { return t('Customers'); },
      subLabel: function () { return t('Address'); },
      subHint: function () { return t('Shop, street or area'); },
      blurb: function () { return t('People you sell milk to. They pay you.'); },
      rate: function () { return store.defaultSaleRate(); },
      rateHint: function () { return t('What you charge them for one litre. Filled in on every delivery.'); }
    }
  };

  function rateText(rate) {
    return store.money(rate, Math.round(rate) === rate ? 0 : 2);
  }

  function kindFromSub(sub) { return sub === 'customers' ? 'customer' : 'supplier'; }

  /** The next free number, written like the others (S0125 → S2001, S125 → S2001, S12 → S013). */
  function suggestId(kind) {
    var side = SIDES[kind];
    var re = new RegExp('^' + side.prefix + '(\\d+)$', 'i');
    var max = 0, width = 3;
    store.people(kind).forEach(function (p) {
      var m = re.exec(p[side.idKey]);
      if (!m) return;
      max = Math.max(max, Number(m[1]));
      if (m[1].charAt(0) === '0') width = Math.max(width, m[1].length);
    });
    var next = String(max + 1);
    while (next.length < width) next = '0' + next;
    return side.prefix + next;
  }

  function balanceChip(kind, p) {
    if (kind === 'supplier') {
      var adv = store.advanceOf(p.supplierId);
      return adv > 0.001 ? ui.chip(t('Advance {a}', { a: store.money(adv, 0) }), 'warn') : null;
    }
    var owed = store.owedBy(p.customerId);
    if (owed > 0.001) return ui.chip(t('Owes {a}', { a: store.money(owed, 0) }), 'danger');
    if (owed < -0.001) return ui.chip(t('Credit {a}', { a: store.money(-owed, 0) }), 'ok');
    return null;
  }

  /**
   * The add / change form, in a sheet. Also used from Milk In / Milk Out to
   * add someone new without leaving the page.
   * openForm(kind, person|null, preset, onSaved(id))
   */
  function openForm(kind, person, preset, onSaved) {
    var side = SIDES[kind];
    var isNew = !person;
    preset = preset || {};
    var typed = String(preset.name || '').trim();
    var typedIsNumber = /^[\d\s+-]{6,}$/.test(typed);

    var idField = ui.field({
      label: t('Number / ID'), name: side.idKey, maxlength: 20, autocapitalize: 'characters',
      value: person ? person[side.idKey] : suggestId(kind), readonly: !isNew,
      hint: isNew ? t('A short code like {code}. It cannot be changed later.', { code: suggestId(kind) }) : t('The ID cannot be changed.')
    });
    var nameField = ui.field({ label: t('Name'), name: 'name', maxlength: 80, autocomplete: 'off', autocapitalize: 'words', value: person ? person.name : (typedIsNumber ? '' : typed) });
    var mobileField = ui.field({ label: t('Mobile number'), name: 'mobile', type: 'tel', maxlength: 16, optional: true, value: person ? person.mobile : (typedIsNumber ? typed : '') });
    var subField = ui.field({ label: side.subLabel(), name: side.subKey, maxlength: 80, optional: true, placeholder: side.subHint(), value: person ? person[side.subKey] : '' });
    var rateField = ui.field({
      label: t('Rate per litre'), name: 'ratePerLitre', type: 'money', prefix: store.currency() === 'INR' ? '₹' : '',
      value: person && person.ratePerLitre ? person.ratePerLitre : side.rate(), hint: side.rateHint()
    });
    var activeToggle = ui.toggle({
      label: t('Active'), checked: person ? person.status !== 'Inactive' : true,
      hint: kind === 'supplier' ? t('Off = stopped. Old entries stay, but no new milk can be recorded.') : t('Off = stopped. Old entries stay, but no new deliveries can be recorded.')
    });

    var stats = null;
    if (person) {
      var id = person[side.idKey];
      var month = store.partyMonth(kind === 'supplier' ? 'collection' : 'sale', id);
      var bal = kind === 'supplier' ? store.advanceOf(id) : store.owedBy(id);
      stats = el('dl.kv', [
        el('dt', { text: t('This month') }), el('dd', { text: util.fmtLitres(month.value) + ' · ' + store.money(month.amount) }),
        el('dt', { text: kind === 'supplier' ? t('Advance outstanding') : (bal < 0 ? t('In credit') : t('Owes you')) }),
        el('dd', { text: store.money(Math.abs(bal)) })
      ]);
    }

    var form = el('form.form-stack', { novalidate: true, autocomplete: 'off' }, [
      person && person.mobile ? el('a.btn.btn--soft.btn--block', { href: 'tel:' + person.mobile }, [ui.icon('phone'), el('span', { text: t('Call {name}', { name: person.name }) })]) : null,
      stats,
      nameField, mobileField, subField, rateField, idField,
      isNew ? null : activeToggle
    ]);
    var saveBtn = el('button.btn.btn--primary', { type: 'button', onclick: save }, [ui.icon('check'), el('span', { text: isNew ? t('Add') : t('Save changes') })]);
    form.addEventListener('submit', function (e) { e.preventDefault(); save(); });

    var sheet = ui.sheet({
      title: isNew ? (kind === 'supplier' ? t('New supplier') : t('New customer')) : person.name,
      content: form,
      footer: [el('button.btn.btn--ghost', { type: 'button', onclick: function () { sheet.close(); } }, t('Cancel')), saveBtn],
      autofocus: isNew ? 'input[name="name"]' : null
    });

    function save() {
      ui.clearFieldErrors(form);
      var problems = [];
      function bad(control, msg) { ui.setFieldError(control, msg); problems.push(control); }
      var idValue = idField.value().trim();
      var name = nameField.value().trim();
      var mobile = mobileField.value().replace(/[\s-]/g, '');
      var rateText = rateField.value().trim();
      var rate = rateText ? util.parseNum(rateText) : null;

      if (isNew) {
        if (!idValue) bad(idField.control, t('Give them a short ID, like {code}.', { code: suggestId(kind) }));
        else if (!/^[A-Za-z0-9_-]+$/.test(idValue)) bad(idField.control, t('Use letters, numbers and - only. No spaces.'));
        else if (store.person(kind, idValue)) bad(idField.control, t('{id} is already used by {name}.', { id: idValue, name: store.person(kind, idValue).name }));
      }
      if (!name) bad(nameField.control, t('Type the name.'));
      if (mobile && !/^\+?\d{6,15}$/.test(mobile)) bad(mobileField.control, t('Mobile number should be 6 to 15 digits.'));
      if (rateText && !(rate >= 0 && rate <= 5000)) bad(rateField.control, t('Type the rate as a number, like 34.'));
      if (problems.length) { try { problems[0].focus(); } catch (e) { /* ignore */ } return; }

      var record = { name: name, mobile: mobile, ratePerLitre: rateText ? rate : '', status: isNew ? 'Active' : (activeToggle.get() ? 'Active' : 'Inactive') };
      record[side.idKey] = isNew ? idValue : person[side.idKey];
      record[side.subKey] = subField.value().trim();
      store.save(kind, record, person || null);
      ui.say.ok(isNew ? t('Added') : t('Changes saved'), name + ' · ' + record[side.idKey]);
      sheet.close(function () { if (onSaved) onSaved(record[side.idKey]); });
    }
    return sheet;
  }

  /* Which people to list. Counted per button so the numbers show at a glance. */
  function shows(kind) {
    if (kind === 'supplier') {
      return [
        { key: 'active', label: t('Active'), test: function (p) { return p.status !== 'Inactive'; } },
        { key: 'adv', label: t('Has advance'), test: function (p) { return store.advanceOf(p.supplierId) > 0.001; } },
        { key: 'stopped', label: t('Stopped'), test: function (p) { return p.status === 'Inactive'; } },
        { key: 'all', label: t('Everyone'), test: function () { return true; } }
      ];
    }
    return [
      { key: 'active', label: t('Active'), test: function (p) { return p.status !== 'Inactive'; } },
      { key: 'owes', label: t('Owes money'), test: function (p) { return store.owedBy(p.customerId) > 0.001; } },
      { key: 'credit', label: t('In credit'), test: function (p) { return store.owedBy(p.customerId) < -0.001; } },
      { key: 'stopped', label: t('Stopped'), test: function (p) { return p.status === 'Inactive'; } },
      { key: 'all', label: t('Everyone'), test: function () { return true; } }
    ];
  }

  // Remembered while the app is open, one set per list.
  var memory = {
    supplier: { query: '', show: 'active', area: '', sort: 'id' },
    customer: { query: '', show: 'active', area: '', sort: 'id' }
  };

  function moneyOf(kind, p) { return kind === 'supplier' ? store.advanceOf(p.supplierId) : store.owedBy(p.customerId); }

  function render(root, ctx) {
    var kind = kindFromSub(ctx.sub);
    var side = SIDES[kind];
    var mem = memory[kind];
    if (ctx.sub !== side.sub) ctx.setSub(side.sub);
    var lazy = null;
    ctx.cleanup(function () { if (lazy) lazy.destroy(); });

    var tabs = el('div.tabs.tabs--counted', { role: 'tablist', 'aria-label': t('Which list') }, ['supplier', 'customer'].map(function (k) {
      var on = k === kind;
      return el('button.tabs__btn', {
        type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false',
        onclick: function () { if (!on) { ctx.setSub(SIDES[k].sub); ctx.rerender(); } }
      }, [ui.icon(k === 'supplier' ? 'in' : 'out'), el('span', { text: SIDES[k].Title() }), el('span.tabs__count', { text: util.fmtCount(store.activePeople(k).length) })]);
    }));
    root.appendChild(tabs);
    root.appendChild(el('p.hint', { style: 'margin:-4px 2px 12px', text: side.blurb() }));

    var search = el('input.search__input', {
      type: 'search', value: mem.query, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
      enterkeyhint: 'search', 'aria-label': t('Search'),
      placeholder: kind === 'supplier' ? t('Number, name, village or mobile') : t('Number, name, area or mobile')
    });
    var clearBtn = el('button.search__clear', {
      type: 'button', 'aria-label': t('Clear'), hidden: !mem.query,
      onclick: function () { search.value = ''; mem.query = ''; clearBtn.hidden = true; drawList(); search.focus(); }
    }, ui.icon('close'));
    var onSearch = util.debounce(function () { if (!ctx.alive()) return; mem.query = search.value; clearBtn.hidden = !mem.query; drawList(); }, 110);
    search.addEventListener('input', onSearch);
    ctx.cleanup(function () { onSearch.cancel(); });

    root.appendChild(el('div.toolbar', [
      el('div.search', [ui.icon('search'), search, clearBtn]),
      el('button.btn.btn--primary', { type: 'button', onclick: function () { openForm(kind, null, null); } },
        [ui.icon('plus'), el('span', { text: kind === 'supplier' ? t('Add supplier') : t('Add customer') })])
    ]));

    /* --- filters: which people, which village, what order --- */
    var options = shows(kind);
    var byKey = {};
    options.forEach(function (s) { byKey[s.key] = s; });
    if (!byKey[mem.show]) mem.show = 'active';
    var showRow = ui.chips({ label: t('Show'), value: mem.show, options: [], onChange: function (v) { mem.show = v; drawList(); } });

    var groups = store.areas(kind);
    var showAreas = ui.areasUseful(groups);
    if (!showAreas) mem.area = '';
    var areaText = el('span');
    var areaBtn = el('button.toolbtn', {
      type: 'button', 'aria-haspopup': 'dialog',
      onclick: function () {
        ui.areaSheet({ kind: kind, value: mem.area, onChoose: function (key) { mem.area = key; paintTools(); paintCounts(); drawList(); } });
      }
    }, [ui.icon('pin'), areaText, ui.icon('down', 'toolbtn__chev')]);
    var areaClear = el('button.toolbtn__x', { type: 'button', 'aria-label': t('Show all'), onclick: function () { mem.area = ''; paintTools(); paintCounts(); drawList(); } }, ui.icon('close'));

    var sortButtons = [['id', t('Number')], ['name', t('Name')], ['money', kind === 'supplier' ? t('Advance') : t('Owes')]].map(function (s) {
      return el('button.seg__btn', { type: 'button', 'data-key': s[0], onclick: function () { mem.sort = s[0]; paintTools(); drawList(); } }, s[1]);
    });
    var tools = el('div.pick-tools', [
      showAreas ? el('div.toolbtn-wrap', [areaBtn, areaClear]) : null,
      el('div.seg', { role: 'group', 'aria-label': t('Order') }, [ui.icon('sort', 'seg__icon')].concat(sortButtons))
    ]);
    root.appendChild(el('div.filters', [showRow, tools]));

    function paintTools() {
      areaText.textContent = mem.area ? ui.areaLabel(kind, mem.area) : ui.allAreasLabel(kind);
      areaBtn.classList.toggle('toolbtn--on', !!mem.area);
      areaClear.hidden = !mem.area;
      sortButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-key') === mem.sort ? 'true' : 'false'); });
      tools.classList.toggle('pick-tools--searching', !!mem.query.trim() && mem.sort !== 'money');
    }

    /** The numbers on the filter buttons count the chosen village only. */
    function paintCounts() {
      var counts = {};
      store.search(kind, '', {
        filter: function (p, e) {
          if (!ui.inArea(e, mem.area)) return false;
          options.forEach(function (s) { if (s.test(p)) counts[s.key] = (counts[s.key] || 0) + 1; });
          return false;
        }
      });
      showRow.setOptions(options.map(function (s) { return { value: s.key, label: s.label, count: counts[s.key] || 0 }; }), mem.show);
    }

    var countLine = el('div.listcount');
    var listHost = el('div.card__body');
    root.appendChild(countLine);
    root.appendChild(el('div.card', listHost));

    function visible() {
      var show = byKey[mem.show] || byKey.active;
      var list = store.search(kind, mem.query, {
        sort: mem.sort === 'name' ? 'name' : 'id',
        filter: function (p, e) { return ui.inArea(e, mem.area) && show.test(p); }
      });
      if (mem.sort === 'money') {
        var withMoney = list.map(function (p, i) { return { p: p, m: moneyOf(kind, p), i: i }; });
        withMoney.sort(function (a, b) { return b.m - a.m || a.i - b.i; });
        list = withMoney.map(function (x) { return x.p; });
      }
      return list;
    }

    function rowFor(p) {
      var rate = Number(p.ratePerLitre);
      return ui.row({
        title: p.name, id: p[side.idKey], dim: p.status === 'Inactive',
        sub: [p[side.idKey], p[side.subKey], p.mobile].filter(Boolean).join(' · '),
        badges: [p.status === 'Inactive' ? ui.chip(t('Stopped'), 'muted') : null, ui.syncMark(p), balanceChip(kind, p)],
        end: rate ? rateText(rate) : '', endSub: rate ? t('per litre') : '',
        onClick: function () { openForm(kind, p, null); }
      });
    }

    function drawList() {
      if (!ctx.alive()) return;
      var keep = lazy ? lazy.shown() : 0;
      if (lazy) { lazy.destroy(); lazy = null; }
      paintTools();
      var rows = visible();
      var everyone = store.people(kind).length;
      util.clear(listHost);
      util.clear(countLine);
      countLine.appendChild(el('span', {
        text: t('{n} of {all} shown', { n: util.fmtCount(rows.length), all: util.fmtCount(everyone) }) +
          (mem.query.trim() && rows.length > 1 && mem.sort !== 'money' ? ' · ' + t('best match first') : '')
      }));
      if (rows.length) {
        countLine.appendChild(el('button.btn.btn--sm.btn--ghost', { type: 'button', onclick: function () { exportCsv(rows); } }, [ui.icon('download'), el('span', { text: t('CSV file') })]));
      }
      if (!rows.length) {
        var narrowed = mem.query.trim() || mem.area || mem.show !== 'all';
        listHost.appendChild(ui.empty(
          !everyone ? (kind === 'supplier' ? t('No suppliers yet') : t('No customers yet'))
            : mem.query.trim() ? t('No one matches “{q}”', { q: mem.query.trim() }) : t('Nobody here'),
          !everyone ? side.blurb() : t('Try the number, part of the name, or the mobile number.'),
          !everyone
            ? el('button.btn.btn--primary', { type: 'button', onclick: function () { openForm(kind, null, null); } },
              [ui.icon('plus'), el('span', { text: kind === 'supplier' ? t('Add supplier') : t('Add customer') })])
            : narrowed ? el('button.btn', {
              type: 'button',
              onclick: function () { mem.query = ''; search.value = ''; clearBtn.hidden = true; mem.area = ''; mem.show = 'all'; paintCounts(); drawList(); }
            }, [ui.icon('people'), el('span', { text: t('Show everyone') })]) : null,
          'people'));
        return;
      }
      lazy = ui.lazyList(listHost, rows, rowFor, { step: 50, initial: keep });
    }

    function exportCsv(rows) {
      var data = rows.map(function (p) {
        var bal = moneyOf(kind, p);
        return [p[side.idKey], p.name, p.mobile, p[side.subKey], p.ratePerLitre, p.status, bal];
      });
      util.downloadCsv('dakotax-' + side.sub + '-' + util.localToday() + '.csv', util.toCsv(
        ['ID', 'Name', 'Mobile', kind === 'supplier' ? 'Village' : 'Address', 'Rate per litre', 'Status', kind === 'supplier' ? 'Advance outstanding' : 'Balance owed'], data));
      ui.say.ok(t('File downloaded'), t('{n} rows', { n: data.length }));
    }

    paintTools();
    paintCounts();
    drawList();
    ctx.onChange(function () { paintCounts(); drawList(); });
  }

  return {
    title: function () { return t('People'); },
    subtitle: function (ctx) {
      return t('{a} suppliers · {b} customers', { a: store.activePeople('supplier').length, b: store.activePeople('customer').length });
    },
    render: render,
    openForm: openForm
  };
})();

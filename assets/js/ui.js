/* Shared interface pieces: messages, tables, the supplier picker, confirms. */
window.DX = window.DX || {};

DX.ui = (function () {
  var util = DX.util;

  /* ------------------------------------------------------------------ *
   * Messages
   * ------------------------------------------------------------------ */
  function toastHost() {
    var host = document.getElementById('toasts');
    if (!host) {
      host = util.el('div.toasts#toasts', { 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(kind, title, detail, holdMs) {
    var host = toastHost();
    var node = util.el('div.toast.toast--' + kind, { role: kind === 'error' ? 'alert' : 'status' }, [
      util.el('div', [
        util.el('strong', { text: title }),
        detail ? util.el('span', { text: detail }) : null
      ]),
      util.el('button', { type: 'button', 'aria-label': 'Dismiss', text: '×', onclick: function () { node.remove(); } })
    ]);
    host.appendChild(node);
    var hold = holdMs || (kind === 'error' ? 9000 : 4200);
    setTimeout(function () { node.remove(); }, hold);
    return node;
  }

  var say = {
    ok: function (title, detail) { return toast('ok', title, detail); },
    warn: function (title, detail) { return toast('warn', title, detail); },
    error: function (title, detail) { return toast('error', title, detail); }
  };

  /** Turns any thrown error into a message a milk clerk can act on. */
  function explain(err) {
    if (!err) return { title: 'Something went wrong', detail: '' };
    if (err.code === 'NO_ENDPOINT') {
      return { title: 'Not connected to a sheet yet', detail: 'Open Settings and paste the web-app link from Apps Script.' };
    }
    if (err.code === 'DUPLICATE') return { title: 'Already recorded', detail: err.message };
    if (err.code === 'VALIDATION') return { title: 'Check that entry', detail: err.message };
    if (err.code === 'NOT_FOUND') return { title: 'Not on the sheet', detail: err.message };
    if (err.code === 'BUSY') return { title: 'Someone else is saving', detail: err.message };
    if (err.code === 'NO_SHEET') return { title: 'A sheet tab is missing', detail: err.message };
    return { title: 'Could not reach the sheet', detail: err.message || String(err) };
  }

  function reportError(err, form) {
    var info = explain(err);
    say.error(info.title, info.detail);
    if (form && err && err.field) {
      var field = form.querySelector('[name="' + err.field + '"]');
      if (field) {
        setFieldError(field, err.message);
        field.focus();
      }
    }
  }

  function setFieldError(input, message) {
    var wrap = input.closest('.field') || input.closest('.shiftpick');
    if (!wrap) return;
    wrap.classList.add('field--error');
    var existing = wrap.querySelector('.field__error');
    if (existing) existing.remove();
    wrap.appendChild(util.el('p.field__error', { text: message, role: 'alert' }));
  }

  function clearFieldErrors(form) {
    form.querySelectorAll('.field--error').forEach(function (w) { w.classList.remove('field--error'); });
    form.querySelectorAll('.field__error').forEach(function (n) { n.remove(); });
  }

  /* ------------------------------------------------------------------ *
   * Building blocks
   * ------------------------------------------------------------------ */
  function field(options) {
    var id = options.id || ('f-' + Math.random().toString(36).slice(2, 8));
    var control;
    if (options.type === 'select') {
      control = util.el('select', { id: id, name: options.name, required: options.required || null },
        (options.options || []).map(function (o) {
          return util.el('option', { value: o.value, selected: String(o.value) === String(options.value) || null }, o.label);
        }));
    } else if (options.type === 'textarea') {
      control = util.el('textarea', { id: id, name: options.name, rows: options.rows || 2, maxlength: options.maxlength || 200 });
      control.value = options.value === undefined || options.value === null ? '' : options.value;
    } else {
      control = util.el('input', {
        id: id, name: options.name, type: options.type || 'text',
        inputmode: options.inputmode || null, step: options.step || null,
        min: options.min === undefined ? null : options.min,
        max: options.max === undefined ? null : options.max,
        maxlength: options.maxlength || null,
        placeholder: options.placeholder || null,
        autocomplete: options.autocomplete || 'off',
        required: options.required || null
      });
      control.value = options.value === undefined || options.value === null ? '' : options.value;
    }
    var wrap = util.el('div.field' + (options.big ? '.field--big' : ''), [
      util.el('label', { for: id, text: options.label }),
      control,
      options.hint ? util.el('p.hint', { text: options.hint }) : null
    ]);
    wrap.control = control;
    return wrap;
  }

  function chip(text, kind) { return util.el('span.chip.chip--' + kind, { text: text }); }

  function shiftChip(shift) {
    return chip(shift, shift === 'Morning' ? 'morning' : 'evening');
  }

  function empty(title, message, action) {
    return util.el('div.empty', [
      util.el('h3', { text: title }),
      util.el('p', { text: message }),
      action || null
    ]);
  }

  /** columns: [{key,label,right,render,label}] */
  function table(columns, rows, options) {
    options = options || {};
    if (!rows.length) {
      return options.empty || empty('Nothing here yet', 'Records will show up as soon as they are saved.');
    }
    var head = util.el('tr', columns.map(function (c) {
      return util.el('th' + (c.right ? '.right' : ''), { text: c.label });
    }));
    var body = rows.map(function (row, index) {
      return util.el('tr', columns.map(function (c) {
        var content = c.render ? c.render(row, index) : row[c.key];
        return util.el('td' + (c.right ? '.right' : ''), { 'data-label': c.label },
          content instanceof Node ? content : (content === null || content === undefined || content === '' ? '—' : String(content)));
      }));
    });
    return util.el('div.table-wrap', [
      util.el('table.data', [util.el('thead', head), util.el('tbody', body)])
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Party picker — type a name, a mobile number or a short ID.
   * Holds suppliers or customers; callers pass normalised people:
   *   { id, name, sub, mobile, status }
   * ------------------------------------------------------------------ */
  function partyPicker(options) {
    options = options || {};
    var suppliers = options.people || [];
    var selected = null;
    var id = 'sp-' + Math.random().toString(36).slice(2, 8);

    var input = util.el('input', {
      id: id, type: 'text', role: 'combobox', autocomplete: 'off',
      'aria-expanded': 'false', 'aria-autocomplete': 'list',
      placeholder: options.placeholder || 'Name, mobile or ID'
    });
    var hidden = util.el('input', { type: 'hidden', name: options.name || 'supplierId' });
    var list = util.el('div.selector__list', { hidden: true, role: 'listbox' });
    var wrap = util.el('div.field', [
      util.el('label', { for: id, text: options.label || 'Supplier' }),
      util.el('div.selector', [input, hidden, list]),
      options.hint ? util.el('p.hint', { text: options.hint }) : null
    ]);

    function match(query) {
      var q = query.trim().toLowerCase();
      var pool = suppliers.filter(function (s) { return options.includeInactive || s.status !== 'Inactive'; });
      if (!q) return pool.slice(0, 12);
      return pool.filter(function (s) {
        return String(s.name).toLowerCase().indexOf(q) > -1 ||
          String(s.id).toLowerCase().indexOf(q) > -1 ||
          String(s.mobile).indexOf(q) > -1;
      }).slice(0, 12);
    }

    function render(query) {
      util.clear(list);
      var found = match(query);
      if (!found.length) {
        list.appendChild(util.el('p.selector__empty', {
          text: suppliers.length
            ? 'No ' + (options.noun || 'supplier') + ' matches "' + query + '".'
            : 'No ' + (options.noun || 'supplier') + 's yet — add one on the People page.'
        }));
      }
      found.forEach(function (s) {
        list.appendChild(util.el('button.selector__opt', {
          type: 'button', role: 'option',
          onclick: function () { choose(s); }
        }, [
          util.el('span', s.name),
          util.el('small', s.id + (s.sub ? ' · ' + s.sub : ''))
        ]));
      });
      open(true);
    }

    function open(state) {
      list.hidden = !state;
      input.setAttribute('aria-expanded', state ? 'true' : 'false');
    }

    function choose(s) {
      selected = s;
      hidden.value = s.id;
      input.value = s.name + ' · ' + s.id;
      open(false);
      if (options.onChange) options.onChange(s);
    }

    input.addEventListener('focus', function () { render(''); });
    input.addEventListener('input', util.debounce(function () {
      hidden.value = '';
      selected = null;
      render(input.value);
      if (options.onChange) options.onChange(null);
    }, 120));
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { open(false); }
      if (e.key === 'Enter') {
        var found = match(input.value);
        if (found.length === 1) { e.preventDefault(); choose(found[0]); }
      }
      if (e.key === 'ArrowDown') {
        var first = list.querySelector('.selector__opt');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) open(false);
    });

    wrap.setPeople = function (next) { suppliers = next || []; };
    wrap.setValue = function (id) {
      var found = suppliers.filter(function (s) { return s.id === id; })[0];
      if (found) choose(found);
    };
    wrap.clear = function () { selected = null; hidden.value = ''; input.value = ''; };
    wrap.get = function () { return selected; };
    wrap.control = input;
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Mode switch — one page, two sides of the book
   * ------------------------------------------------------------------ */
  function modeSwitch(options) {
    var current = options.value || options.modes[0].key;
    var wrap = util.el('div.modeswitch', { role: 'tablist', 'aria-label': options.label || 'View' });
    options.modes.forEach(function (mode) {
      wrap.appendChild(util.el('button', {
        type: 'button', role: 'tab',
        'aria-selected': mode.key === current ? 'true' : 'false',
        onclick: function () {
          if (mode.key === current) return;
          current = mode.key;
          var buttons = wrap.querySelectorAll('button');
          for (var i = 0; i < buttons.length; i++) {
            buttons[i].setAttribute('aria-selected', options.modes[i].key === current ? 'true' : 'false');
          }
          options.onChange(current);
        }
      }, [
        mode.icon ? util.el('span', { html: mode.icon }) : null,
        util.el('b', mode.short || mode.label),
        mode.tail ? util.el('span', ' ' + mode.tail) : null
      ]));
    });
    return wrap;
  }

  function arrowOut() {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9"/><path d="M4.5 7.5 8 11l3.5-3.5"/><path d="M2.5 14h11"/></svg>';
  }
  function arrowIn() {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V4"/><path d="M4.5 7.5 8 4l3.5 3.5"/><path d="M2.5 2h11"/></svg>';
  }

  /** Normalisers so one picker can hold either side of the book. */
  function asSupplier(s) {
    return { id: s.supplierId, name: s.name, sub: s.village, mobile: s.mobile, status: s.status, ratePerLitre: s.ratePerLitre, raw: s };
  }
  function asCustomer(c) {
    return { id: c.customerId, name: c.name, sub: c.address, mobile: c.mobile, status: c.status, ratePerLitre: c.ratePerLitre, raw: c };
  }

  /* ------------------------------------------------------------------ *
   * Confirm dialog
   * ------------------------------------------------------------------ */
  function confirmAction(options) {
    return new Promise(function (resolve) {
      var dialog = util.el('dialog.sheet', [
        util.el('div.card__head', [util.el('h2', { text: options.title })]),
        util.el('div.card__body', [
          util.el('p', { text: options.message }),
          util.el('div.form-actions', [
            util.el('button.btn', { type: 'button', text: options.cancelLabel || 'Keep it', onclick: function () { close(false); } }),
            util.el('button.btn.btn--danger', { type: 'button', text: options.confirmLabel || 'Delete', onclick: function () { close(true); } })
          ])
        ])
      ]);
      function close(answer) {
        dialog.close();
        dialog.remove();
        resolve(answer);
      }
      document.body.appendChild(dialog);
      dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(false); });
      dialog.showModal();
    });
  }

  function busy(button, isBusy, busyLabel) {
    if (!button) return;
    if (isBusy) {
      button.dataset.idleLabel = button.textContent;
      button.textContent = busyLabel || 'Saving…';
      button.disabled = true;
    } else {
      if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
      button.disabled = false;
    }
  }

  return {
    say: say, explain: explain, reportError: reportError,
    setFieldError: setFieldError, clearFieldErrors: clearFieldErrors,
    field: field, chip: chip, shiftChip: shiftChip, table: table, empty: empty,
    partyPicker: partyPicker, confirmAction: confirmAction, busy: busy,
    modeSwitch: modeSwitch, arrowIn: arrowIn, arrowOut: arrowOut,
    asSupplier: asSupplier, asCustomer: asCustomer
  };
})();

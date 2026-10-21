/* Shared interface pieces: icons, messages, fields, tap-to-choose buttons,
 * the person chooser, bottom sheets and confirmations. */
window.DX = window.DX || {};

DX.ui = (function () {
  var util = DX.util;
  var el = util.el;
  function t(s, v) { return DX.i18n.t(s, v); }

  /* ------------------------------------------------------------------ *
   * Icons (24px stroke icons, drawn for this app)
   * ------------------------------------------------------------------ */
  var P = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
  var ICONS = {
    home: P + '<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v10.5h13V9"/><path d="M10 19.5v-5h4v5"/></svg>',
    in: P + '<path d="M8 3.5h8l-1 3H9z"/><path d="M7 6.5h10l1 12.2a2 2 0 0 1-2 2.3H8a2 2 0 0 1-2-2.3z"/><path d="M12 9.5v6"/><path d="m9.5 13 2.5 2.5 2.5-2.5"/></svg>',
    out: P + '<path d="M8 3.5h8l-1 3H9z"/><path d="M7 6.5h10l1 12.2a2 2 0 0 1-2 2.3H8a2 2 0 0 1-2-2.3z"/><path d="M12 16V10"/><path d="m9.5 12.5 2.5-2.5 2.5 2.5"/></svg>',
    people: P + '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.5 5.2a3 3 0 0 1 0 5.6"/><path d="M21 20a5.6 5.6 0 0 0-3.4-5.2"/></svg>',
    more: P + '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
    grid: P + '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
    pay: P + '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
    collect: P + '<path d="M4 14.5h3.5l3 2h4a1.5 1.5 0 0 0 0-3H11"/><path d="M7.5 14.5 12 11h4.5a2 2 0 0 1 1.6.8L21 15.5"/><path d="M2.5 13.5v6h3v-6z"/><circle cx="15.5" cy="5.5" r="2.5"/></svg>',
    advance: P + '<path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 1.7 2.6 4.5 3.2 4.5 1.6 4.5 3.3-2 3-4.5 3-4.5-1.3-4.5-3"/></svg>',
    reports: P + '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="12" width="3" height="5" rx="1"/><rect x="13" y="8" width="3" height="9" rx="1"/><rect x="18" y="14" width="2.5" height="3" rx="1"/></svg>',
    settings: P + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    search: P + '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    close: P + '<path d="M6 6l12 12M18 6 6 18"/></svg>',
    down: P + '<path d="m6 9 6 6 6-6"/></svg>',
    left: P + '<path d="m15 6-6 6 6 6"/></svg>',
    right: P + '<path d="m9 6 6 6-6 6"/></svg>',
    check: P + '<path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    clock: P + '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    alert: P + '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5"/><path d="M12 17.3h.01"/></svg>',
    info: P + '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.7h.01"/></svg>',
    refresh: P + '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20.5V16h-4.5"/></svg>',
    phone: P + '<path d="M5 4h3.5l1.5 4.5-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/></svg>',
    edit: P + '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 7 3 3"/></svg>',
    trash: P + '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/></svg>',
    plus: P + '<path d="M12 5v14M5 12h14"/></svg>',
    calendar: P + '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/></svg>',
    sun: P + '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
    moon: P + '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>',
    cloudOff: P + '<path d="M3 3l18 18"/><path d="M8.5 6.6A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.2 7.3"/><path d="M15.5 19H7a4.5 4.5 0 0 1-1.6-8.7"/></svg>',
    user: P + '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
    download: P + '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/></svg>',
    print: P + '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>',
    lang: P + '<path d="M4 5h9"/><path d="M8.5 3v2"/><path d="M11 5c-1 4.5-3.5 7.5-6.5 9"/><path d="M6.5 8.5c1.3 2.2 3 3.8 5 4.8"/><path d="m12.5 21 4.2-9.5 4.3 9.5"/><path d="M14 17.8h5.5"/></svg>',
    theme: P + '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/></svg>',
    note: P + '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5"/><path d="M9 13h7M9 16.5h5"/></svg>',
    wifi: P + '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.7 15.8a5 5 0 0 1 6.6 0"/><path d="M12 19.5h.01"/></svg>',
    pin: P + '<path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/></svg>',
    sort: P + '<path d="M7.5 4.5v15"/><path d="m4.5 7.5 3-3 3 3"/><path d="M16.5 19.5v-15"/><path d="m13.5 16.5 3 3 3-3"/></svg>'
  };

  function icon(name, cls) {
    return el('span.icon' + (cls ? '.' + cls : ''), { html: ICONS[name] || '' });
  }

  /* ------------------------------------------------------------------ *
   * Messages
   * ------------------------------------------------------------------ */
  function toastHost() {
    var host = document.getElementById('toasts');
    if (!host) {
      host = el('div.toasts#toasts', { 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(kind, title, detail, holdMs) {
    var host = toastHost();
    var glyph = kind === 'ok' ? 'check' : kind === 'error' ? 'alert' : kind === 'warn' ? 'alert' : 'info';
    var node = el('div.toast.toast--' + kind, { role: kind === 'error' ? 'alert' : 'status' }, [
      icon(glyph, 'toast__icon'),
      el('div.toast__text', [
        el('strong', { text: title }),
        detail ? el('span', { text: detail }) : null
      ]),
      el('button.toast__close', { type: 'button', 'aria-label': t('Close'), onclick: function () { dismiss(); } }, icon('close'))
    ]);
    function dismiss() {
      node.classList.add('toast--out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 180);
    }
    // Keep at most three on screen.
    while (host.children.length >= 3) host.removeChild(host.firstChild);
    host.appendChild(node);
    setTimeout(dismiss, holdMs || (kind === 'error' ? 9000 : kind === 'warn' ? 6500 : 3200));
    return node;
  }

  var say = {
    ok: function (title, detail) { return toast('ok', title, detail); },
    info: function (title, detail) { return toast('info', title, detail); },
    warn: function (title, detail) { return toast('warn', title, detail); },
    error: function (title, detail) { return toast('error', title, detail); }
  };

  var TITLES = {
    NO_ENDPOINT: 'Not connected to a sheet yet',
    DUPLICATE: 'Already recorded',
    VALIDATION: 'Please check this entry',
    NOT_FOUND: 'Not on the sheet',
    BUSY: 'Someone else is saving',
    NO_SHEET: 'A sheet tab is missing',
    TIMEOUT: 'No answer from the sheet',
    NETWORK: 'No internet connection',
    BAD_RESPONSE: 'The sheet link is not working',
    UNKNOWN_ACTION: 'The sheet script is out of date',
    ORPHAN: 'Not saved'
  };

  /** Turns any error into a message a milk clerk can act on. */
  function explain(err) {
    if (!err) return { title: t('Something went wrong'), detail: '' };
    var code = err.code;
    var title = TITLES[code] ? t(TITLES[code]) : t('Could not reach the sheet');
    var detail = err.message || String(err);
    if (code === 'NETWORK' || code === 'TIMEOUT') detail = t('Check the internet connection and try again.');
    if (code === 'NO_ENDPOINT') detail = t('Open Settings and paste the web-app link from Apps Script.');
    if (code === 'UNKNOWN_ACTION') detail = t('Paste the new Code.gs into Apps Script and deploy a new version.');
    return { title: title, detail: detail };
  }

  function reportError(err, form) {
    var info = explain(err);
    say.error(info.title, info.detail);
    if (form && err && err.field) {
      var control = form.querySelector('[name="' + err.field + '"]');
      if (control) { setFieldError(control, err.message); control.focus(); }
    }
  }

  function setFieldError(control, message) {
    var wrap = control.closest ? (control.closest('.field') || control.closest('.choice-field')) : null;
    if (!wrap) return;
    wrap.classList.add('field--error');
    var existing = wrap.querySelector('.field__error');
    if (existing) existing.parentNode.removeChild(existing);
    wrap.appendChild(el('p.field__error', { role: 'alert' }, [icon('alert'), el('span', { text: message })]));
  }

  function clearFieldError(control) {
    var wrap = control.closest ? (control.closest('.field') || control.closest('.choice-field')) : null;
    if (!wrap) return;
    wrap.classList.remove('field--error');
    var existing = wrap.querySelector('.field__error');
    if (existing) existing.parentNode.removeChild(existing);
  }

  function clearFieldErrors(root) {
    root.querySelectorAll('.field--error').forEach(function (w) { w.classList.remove('field--error'); });
    root.querySelectorAll('.field__error').forEach(function (n) { n.parentNode.removeChild(n); });
  }

  /* ------------------------------------------------------------------ *
   * Fields
   * ------------------------------------------------------------------ */
  var seq = 0;
  function nextId(prefix) { seq++; return (prefix || 'f') + '-' + seq; }

  /**
   * field({ label, name, value, type: 'text'|'number'|'money'|'tel'|'textarea',
   *         placeholder, hint, big, prefix, suffix, maxlength, autocomplete })
   * Numbers use a text box with a number keypad, so "8,5" and "8.5" both work.
   */
  function field(o) {
    var id = o.id || nextId('f');
    var control;
    var numeric = o.type === 'number' || o.type === 'money';
    if (o.type === 'textarea') {
      control = el('textarea', { id: id, name: o.name, rows: o.rows || 2, maxlength: o.maxlength || 200, placeholder: o.placeholder || null });
    } else {
      control = el('input', {
        id: id, name: o.name,
        type: numeric ? 'text' : (o.type || 'text'),
        inputmode: numeric ? 'decimal' : (o.inputmode || (o.type === 'tel' ? 'tel' : null)),
        enterkeyhint: o.enterkeyhint || null,
        maxlength: o.maxlength || (numeric ? 12 : null),
        placeholder: o.placeholder || null,
        autocomplete: o.autocomplete || 'off',
        autocapitalize: o.autocapitalize || null,
        spellcheck: numeric ? 'false' : null,
        readonly: o.readonly || null
      });
    }
    control.value = o.value === undefined || o.value === null ? '' : String(o.value);
    var box = el('div.input' + (o.big ? '.input--big' : '') + (numeric ? '.input--num' : ''), [
      o.prefix ? el('span.input__pre', { text: o.prefix }) : null,
      control,
      o.suffix ? el('span.input__suf', { text: o.suffix }) : null
    ]);
    var wrap = el('div.field' + (o.big ? '.field--big' : ''), [
      o.label ? el('label', { for: id }, [el('span', { text: o.label }), o.optional ? el('small.optional', { text: t('optional') }) : null]) : null,
      box,
      o.hint ? el('p.hint', { text: o.hint }) : null
    ]);
    control.addEventListener('input', function () { clearFieldError(control); });
    wrap.control = control;
    wrap.value = function () { return control.value; };
    wrap.number = function () { return util.parseNum(control.value); };
    wrap.set = function (v) { control.value = v === undefined || v === null ? '' : String(v); };
    return wrap;
  }

  /**
   * Tap-to-choose buttons in place of a dropdown.
   * choice({ label, name, value, options: [{value, label, sub, icon, tone}], onChange, columns, compact })
   */
  function choice(o) {
    var name = o.name || nextId('c');
    var groupId = nextId('cg');
    var current = o.value;
    var inputs = [];
    var group = el('div.choice' + (o.compact ? '.choice--compact' : '') + (o.stack ? '.choice--stack' : ''), {
      role: 'radiogroup', 'aria-labelledby': o.label ? groupId + '-l' : null, 'aria-label': o.label ? null : (o.ariaLabel || null)
    });
    if (o.columns) group.style.gridTemplateColumns = 'repeat(' + o.columns + ', minmax(0, 1fr))';
    (o.options || []).forEach(function (opt) {
      var input = el('input', { type: 'radio', name: name, value: opt.value });
      input.checked = String(opt.value) === String(current);
      input.addEventListener('change', function () {
        if (!input.checked) return;
        current = opt.value;
        clearFieldError(input);
        if (o.onChange) o.onChange(opt.value, opt);
      });
      inputs.push(input);
      group.appendChild(el('label.choice__opt' + (opt.tone ? '.tone-' + opt.tone : ''), [
        input,
        el('span.choice__box', [
          opt.icon ? icon(opt.icon, 'choice__icon') : null,
          el('span.choice__text', [
            el('b', { text: opt.label }),
            opt.sub ? el('small', { text: opt.sub }) : null
          ]),
          el('span.choice__tick', icon('check'))
        ])
      ]));
    });
    var wrap = el('div.choice-field', [
      o.label ? el('p.choice-field__label#' + groupId + '-l', { text: o.label }) : null,
      group,
      o.hint ? el('p.hint', { text: o.hint }) : null
    ]);
    wrap.control = inputs[0] || group;
    wrap.get = function () { return current; };
    wrap.set = function (v, silent) {
      current = v;
      inputs.forEach(function (i) { i.checked = String(i.value) === String(v); });
      if (!silent && o.onChange) o.onChange(v);
    };
    return wrap;
  }

  /** An on/off switch with its meaning written next to it. */
  function toggle(o) {
    var id = nextId('tg');
    var input = el('input', { type: 'checkbox', id: id, role: 'switch', name: o.name || null });
    input.checked = !!o.checked;
    input.addEventListener('change', function () { if (o.onChange) o.onChange(input.checked); });
    var wrap = el('label.toggle', { for: id }, [
      input,
      el('span.toggle__track', el('span.toggle__thumb')),
      el('span.toggle__text', [el('b', { text: o.label }), o.hint ? el('small', { text: o.hint }) : null])
    ]);
    wrap.control = input;
    wrap.get = function () { return input.checked; };
    wrap.set = function (v) { input.checked = !!v; };
    return wrap;
  }

  /**
   * A big, readable date button that opens the phone's own calendar.
   * dateField({ label, value, max, min, onChange, arrows })
   */
  function dateField(o) {
    var id = nextId('d');
    var value = o.value;
    var input = el('input.date__native', { type: 'date', id: id, name: o.name || null, max: o.max || null, min: o.min || null, tabindex: '-1', 'aria-hidden': 'true' });
    input.value = value || '';
    var text = el('span.date__text');
    var face = el('button.date__face', { type: 'button', 'aria-label': o.label || t('Date') }, [icon('calendar'), text, icon('down', 'date__chev')]);

    function paint() {
      text.textContent = value ? (o.compact ? util.fmtDayMonth(value) : util.fmtShortDay(value)) : t('Choose a date');
      face.setAttribute('aria-label', (o.label ? o.label + ': ' : '') + (value ? util.fmtDay(value, true) : t('Choose a date')));
    }

    function set(v, silent) {
      if (!util.isIsoDate(v)) return;
      if (o.max && v > o.max) v = o.max;
      if (o.min && v < o.min) v = o.min;
      value = v; input.value = v; paint();
      updateArrows();
      if (!silent && o.onChange) o.onChange(v);
    }

    face.addEventListener('click', function () {
      try {
        if (typeof input.showPicker === 'function') { input.showPicker(); return; }
      } catch (err) { /* fall through */ }
      input.focus();
      input.click();
    });
    input.addEventListener('change', function () { if (input.value) set(input.value); });

    var prev = o.arrows ? el('button.date__step', { type: 'button', 'aria-label': t('Previous day'), onclick: function () { set(util.addDays(value, -1)); } }, icon('left')) : null;
    var next = o.arrows ? el('button.date__step', { type: 'button', 'aria-label': t('Next day'), onclick: function () { set(util.addDays(value, 1)); } }, icon('right')) : null;

    function updateArrows() {
      if (next) next.disabled = !!(o.max && value >= o.max);
      if (prev) prev.disabled = !!(o.min && value <= o.min);
    }

    var wrap = el('div.field.date', [
      o.label ? el('label', { for: id, text: o.label }) : null,
      el('div.date__row', [prev, el('div.date__face-wrap', [face, input]), next])
    ]);
    paint(); updateArrows();
    wrap.control = face;
    wrap.get = function () { return value; };
    wrap.set = set;
    wrap.setMax = function (m) { o.max = m; input.max = m || ''; updateArrows(); };
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Bottom sheets. The phone's Back button closes the sheet instead of
   * leaving the page.
   * ------------------------------------------------------------------ */
  var openSheets = [];
  var popWaiters = [];

  function ownBack(after) {
    var done = false;
    var timer = null;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (after) after();
    }
    popWaiters.push(finish);
    timer = setTimeout(function () {
      var i = popWaiters.indexOf(finish);
      if (i >= 0) popWaiters.splice(i, 1);
      finish();
    }, 900);
    history.back();
  }

  window.addEventListener('popstate', function () {
    if (popWaiters.length) { popWaiters.shift()(); return; }
    var top = openSheets[openSheets.length - 1];
    if (top) top.dismissFromBack();
  });

  /**
   * sheet({ title, content, footer, onClose, wide, autofocus })
   * Returns { el, body, close(after) }.
   */
  function sheet(o) {
    var opener = document.activeElement;
    var titleId = nextId('sh');
    var body = el('div.sheet__body', o.content);
    var panel = el('div.sheet' + (o.wide ? '.sheet--wide' : '') + (o.full ? '.sheet--full' : ''), {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1'
    }, [
      el('div.sheet__grip', { 'aria-hidden': 'true' }),
      el('div.sheet__head', [
        el('h2#' + titleId, { text: o.title || '' }),
        el('button.iconbtn.sheet__close', { type: 'button', 'aria-label': t('Close'), onclick: function () { api.close(); } }, icon('close'))
      ]),
      body,
      o.footer ? el('div.sheet__foot', o.footer) : null
    ]);
    var backdrop = el('div.sheet-backdrop', { onclick: function () { api.close(); } });
    var layer = el('div.sheet-layer', [backdrop, panel]);
    document.body.appendChild(layer);
    document.body.classList.add('has-sheet');

    var pushed = false;
    try { history.pushState({ dxSheet: titleId }, ''); pushed = true; } catch (err) { pushed = false; }

    var api = {
      el: panel, body: body, closed: false,
      close: function (after) { shut(false, after); },
      dismissFromBack: function () { shut(true); }
    };

    function shut(fromBack, after) {
      if (api.closed) return;
      api.closed = true;
      openSheets.splice(openSheets.indexOf(api), 1);
      layer.classList.add('sheet-layer--out');
      setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 200);
      if (!openSheets.length) document.body.classList.remove('has-sheet');
      document.removeEventListener('keydown', onKey);
      if (o.onClose) { try { o.onClose(); } catch (err) { /* ignore */ } }
      // Hand focus back only if nothing else has taken it (a chosen person may have moved it on).
      var active = document.activeElement;
      if ((!active || active === document.body || panel.contains(active)) && opener && opener.focus && document.body.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
      }
      // Anything that opens another sheet or changes page waits until the
      // browser history has stepped back past this sheet.
      var then = function () {
        if (after) after();
        if (o.onClosed) { try { o.onClosed(); } catch (err) { /* ignore */ } }
      };
      if (pushed && !fromBack) ownBack(then);
      else then();
    }

    function onKey(e) { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === api) api.close(); }
    document.addEventListener('keydown', onKey);

    openSheets.push(api);
    requestAnimationFrame(function () {
      layer.classList.add('sheet-layer--in');
      var target = o.autofocus ? panel.querySelector(o.autofocus) : null;
      try { (target || panel).focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    });
    return api;
  }

  function closeAllSheets() {
    openSheets.slice().reverse().forEach(function (s) { s.dismissFromBack(); });
  }

  /** Resolves true or false once the sheet has fully closed. */
  function confirmAction(o) {
    return new Promise(function (resolve) {
      var answer = false;
      var s = sheet({
        title: o.title,
        content: [
          o.message ? el('p.sheet__message', { text: o.message }) : null,
          o.detail || null
        ],
        footer: [
          el('button.btn.btn--ghost', { type: 'button', onclick: function () { answer = false; s.close(); } }, o.cancelLabel || t('Cancel')),
          el('button.btn' + (o.danger === false ? '.btn--primary' : '.btn--danger'), { type: 'button', onclick: function () { answer = true; s.close(); } }, o.confirmLabel || t('Delete'))
        ],
        onClosed: function () { resolve(answer); }
      });
    });
  }

  /** A short list of big buttons. Resolves with the chosen value, or null, once closed. */
  function actions(o) {
    return new Promise(function (resolve) {
      var answer = null;
      var s = sheet({
        title: o.title,
        content: [
          o.message ? el('p.sheet__message', { text: o.message }) : null,
          el('div.actionlist', o.actions.map(function (a) {
            return el('button.actionlist__btn' + (a.tone ? '.tone-' + a.tone : ''), {
              type: 'button',
              onclick: function () { answer = a.value; s.close(); }
            }, [a.icon ? icon(a.icon) : null, el('span', [el('b', { text: a.label }), a.sub ? el('small', { text: a.sub }) : null])]);
          }))
        ],
        onClosed: function () { resolve(answer); }
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Little pieces
   * ------------------------------------------------------------------ */
  function avatar(name, id, small) {
    return el('span.avatar' + (small ? '.avatar--sm' : '') + '.av-' + util.hashIndex(id || name, 6), { 'aria-hidden': 'true', text: util.initials(name) });
  }

  function chip(text, tone) { return el('span.chip' + (tone ? '.chip--' + tone : ''), { text: text }); }

  function stat(o) {
    return el('div.stat' + (o.tone ? '.stat--' + o.tone : ''), [
      el('p.stat__label', [o.icon ? icon(o.icon) : null, el('span', { text: o.label })]),
      el('p.stat__value', [el('span', { text: o.value }), o.unit ? el('span.stat__unit', { text: o.unit }) : null]),
      o.sub ? el('p.stat__sub', { text: o.sub }) : null
    ]);
  }

  function empty(title, message, action, glyph) {
    return el('div.empty', [
      glyph ? icon(glyph, 'empty__icon') : null,
      el('h3', { text: title }),
      message ? el('p', { text: message }) : null,
      action || null
    ]);
  }

  function banner(tone, title, text, action) {
    return el('div.banner.banner--' + tone, { role: tone === 'error' ? 'alert' : null }, [
      icon(tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert', 'banner__icon'),
      el('div.banner__body', [
        title ? el('strong', { text: title }) : null,
        text ? el('p', { text: text }) : null
      ]),
      action || null
    ]);
  }

  function busy(button, isBusy, label) {
    if (!button) return;
    if (isBusy) {
      if (!button.dataset.idle) button.dataset.idle = button.innerHTML;
      button.innerHTML = '';
      button.appendChild(el('span.spinner', { 'aria-hidden': 'true' }));
      button.appendChild(document.createTextNode(label || t('Please wait…')));
      button.disabled = true;
    } else {
      if (button.dataset.idle) { button.innerHTML = button.dataset.idle; delete button.dataset.idle; }
      button.disabled = false;
    }
  }

  function sectionHead(title, sub, right) {
    return el('div.sechead', [
      el('div.sechead__text', [el('h2', { text: title }), sub ? el('p', { text: sub }) : null]),
      right || null
    ]);
  }

  /** A tappable list row: avatar | name + detail | figures | status. */
  function row(o) {
    var tag = o.onClick ? 'button' : 'div';
    var node = el(tag + '.row' + (o.tone ? '.row--' + o.tone : '') + (o.dim ? '.row--dim' : ''), {
      type: o.onClick ? 'button' : null,
      onclick: o.onClick || null
    }, [
      o.avatar === false ? null : (o.avatar || avatar(o.title, o.id)),
      el('span.row__main', [
        el('b.row__title', { text: o.title }),
        o.sub ? el('small.row__sub', { text: o.sub }) : null,
        o.note ? el('small.row__note', o.note) : null,
        o.badges && o.badges.filter(Boolean).length ? el('span.row__badges', o.badges) : null
      ]),
      (o.end || o.endSub) ? el('span.row__end', [
        o.end ? el('b', { text: o.end }) : null,
        o.endSub ? el('small', { text: o.endSub }) : null
      ]) : null,
      o.status ? el('span.row__status', o.status) : null,
      o.onClick && o.chevron !== false ? icon('right', 'row__chev') : null
    ]);
    return node;
  }

  /** The small ✓ / clock / warning shown on a row while it is being sent. */
  function syncMark(rec) {
    if (rec._failed) return el('span.mark.mark--failed', { title: t('Not saved') }, [icon('alert'), el('span', { text: t('Not saved') })]);
    if (rec._pending) return el('span.mark.mark--pending', { title: t('Sending…') }, [icon('clock'), el('span', { text: t('Sending…') })]);
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Long lists: draw the first part, add more as the person scrolls.
   * lazyList(host, items, renderItem(item, i), { step, initial, root, listTag })
   * Returns { list, shown(), destroy() }. Call destroy() before redrawing.
   * ------------------------------------------------------------------ */
  function lazyList(host, items, renderItem, o) {
    o = o || {};
    var step = o.step || 50;
    var shown = 0;
    var observer = null;
    var list = el(o.listTag || 'div.list', o.listAttrs || null);
    var moreBtn = el('button.btn.btn--soft.btn--block.lazy-more', { type: 'button', onclick: function () { grow(step); } });
    host.appendChild(list);
    host.appendChild(moreBtn);

    function grow(n) {
      var end = Math.min(items.length, shown + n);
      var frag = document.createDocumentFragment();
      for (var i = shown; i < end; i++) {
        var node = renderItem(items[i], i);
        if (node) frag.appendChild(node);
      }
      list.appendChild(frag);
      shown = end;
      var left = items.length - shown;
      moreBtn.hidden = left <= 0;
      if (left > 0) moreBtn.textContent = t('Show more') + ' · ' + t('{n} left', { n: util.fmtCount(left) });
      else if (observer) { observer.disconnect(); observer = null; }
    }

    grow(Math.max(step, o.initial || 0));
    if (shown < items.length && typeof window.IntersectionObserver === 'function') {
      observer = new IntersectionObserver(function (entries) {
        if (!observer) return;
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          grow(step);
          // Look again: on a tall screen the button may still be in view.
          if (observer) { observer.unobserve(moreBtn); observer.observe(moreBtn); }
          break;
        }
      }, { root: o.root || null, rootMargin: '0px 0px 500px 0px' });
      observer.observe(moreBtn);
    }
    return {
      list: list,
      shown: function () { return shown; },
      destroy: function () { if (observer) { observer.disconnect(); observer = null; } }
    };
  }

  /**
   * A row of filter buttons that scrolls sideways on a phone.
   * chips({ options: [{ value, label, count, icon }], value, onChange(value), label })
   */
  function chips(o) {
    var current = o.value === undefined || o.value === null ? '' : o.value;
    var options = o.options || [];
    var row = el('div.chips', { role: 'group', 'aria-label': o.label || null });
    function paint() {
      util.clear(row);
      options.forEach(function (opt) {
        var on = String(opt.value) === String(current);
        row.appendChild(el('button.chips__btn', {
          type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            if (String(opt.value) === String(current)) return;
            current = opt.value;
            paint();
            if (o.onChange) o.onChange(current, opt);
          }
        }, [
          opt.icon ? icon(opt.icon) : null,
          el('span', { text: opt.label }),
          opt.count === undefined || opt.count === null ? null : el('b.chips__count', { text: util.fmtCount(opt.count) })
        ]));
      });
    }
    paint();
    row.get = function () { return current; };
    row.set = function (v) { current = v; paint(); };
    row.setOptions = function (opts, v) { options = opts; if (v !== undefined) current = v; paint(); };
    return row;
  }

  function same(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
  function finePointer() { return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); }

  var NO_AREA = '\u0000none';   // "no village written" — no real village can be called this

  function areaWord(kind) { return kind === 'customer' ? t('Area') : t('Village'); }
  function allAreasLabel(kind) { return kind === 'customer' ? t('All areas') : t('All villages'); }

  /** Label for a chosen village / area key ('' = all, NO_AREA = not written). */
  function areaLabel(kind, key) {
    if (!key) return allAreasLabel(kind);
    if (key === NO_AREA) return kind === 'customer' ? t('No area written') : t('No village written');
    var groups = DX.store.areas(kind);
    for (var i = 0; i < groups.length; i++) if (groups[i].key === key) return groups[i].label;
    return key;
  }

  /** Villages / areas are worth a filter only when several people share them. */
  function areasUseful(groups) {
    var shared = 0;
    for (var i = 0; i < groups.length && shared < 2; i++) if (groups[i].count > 1) shared++;
    return shared >= 2;
  }

  /** Does this person live in the chosen village / area? */
  function inArea(entry, key) {
    if (!key) return true;
    if (key === NO_AREA) return !entry.area;
    return entry.area === key;
  }

  /**
   * Choose a village (suppliers) or area (customers), with how many people are in each.
   * areaSheet({ kind, filter(person, entry), value, onChoose(key) })
   */
  function areaSheet(o) {
    var kind = o.kind;
    var groups = DX.store.areas(kind, o.filter);
    var answer = null;
    var query = '';
    var listHost = el('div.pick-list', { role: 'listbox', 'aria-label': areaWord(kind) });
    var lazy = null;
    var input = groups.length > 8 ? el('input.search__input', {
      type: 'search', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': t('Search'),
      placeholder: kind === 'customer' ? t('Search areas') : t('Search villages')
    }) : null;

    function option(key, label, count) {
      var on = key === (o.value || '');
      return el('button.pick.pick--area' + (on ? '.pick--on' : ''), {
        type: 'button', role: 'option', 'aria-selected': on ? 'true' : 'false',
        onclick: function () { answer = key; s.close(); }
      }, [
        el('span.pick__pin', icon(key === '' ? 'people' : 'pin')),
        el('span.pick__main', [el('b', { text: label })]),
        el('span.pick__badge', { text: util.fmtCount(count) })
      ]);
    }

    function draw() {
      if (s && s.closed) return;
      if (lazy) lazy.destroy();
      util.clear(listHost);
      var q = query.trim().toLowerCase();
      var items = [];
      if (!q) items.push({ key: '', label: allAreasLabel(kind), count: groups.total });
      groups.forEach(function (g) { if (!q || g.key.indexOf(q) > -1) items.push(g); });
      if (!q && groups.blank) items.push({ key: NO_AREA, label: areaLabel(kind, NO_AREA), count: groups.blank });
      if (!items.length) { listHost.appendChild(empty(t('No match'), t('Check the spelling.'), null, 'search')); return; }
      lazy = lazyList(listHost, items, function (g) { return option(g.key, g.label, g.count); }, { step: 80, root: s.body, listTag: 'div.pick-list__items' });
    }

    var s = null;
    s = sheet({
      title: kind === 'customer' ? t('Choose area') : t('Choose village'),
      full: groups.length > 8,
      content: [input ? el('div.search', [icon('search'), input]) : null, listHost],
      autofocus: input && finePointer() ? '.search__input' : null,
      onClose: function () { if (lazy) lazy.destroy(); },
      onClosed: function () { if (answer !== null && o.onChoose) o.onChoose(answer); }
    });
    if (input) input.addEventListener('input', util.debounce(function () { query = input.value; draw(); }, 80));
    draw();
    return s;
  }

  /* ------------------------------------------------------------------ *
   * Person chooser — built for thousands of names.
   *   Type a number (125 finds S125 first) or part of a name, village or
   *   mobile number, then Enter takes the best match. Filter buttons and the
   *   village / area button narrow the list; it loads more as you scroll.
   * picker({ kind: 'supplier'|'customer', label, value, includeInactive,
   *          allowAll, allLabel, placeholder, title, hint,
   *          onChange(person | '*' | null),
   *          describe(person) → { badge, tone, meta },
   *          isDone(person) → true when already done (shown last, with a tick),
   *          filters: () → [{ key, label, test(person) }], filter: first filter key,
   *          onAdd(typed, done(newId)) })
   * picker.open({ filter, area, query, keyboard }) opens it from elsewhere.
   * ------------------------------------------------------------------ */
  function picker(o) {
    var kind = o.kind || 'supplier';
    var idKey = kind === 'customer' ? 'customerId' : 'supplierId';
    var subKey = kind === 'customer' ? 'address' : 'village';
    var selectedId = o.value || '';
    var btnId = nextId('pk');
    // Remembered between openings, so a round can be worked village by village.
    var mem = { filter: o.filter || '', area: '', sort: 'id' };

    var button = el('button.picker', { type: 'button', id: btnId, 'aria-haspopup': 'dialog' });
    var wrap = el('div.field.picker-field', [
      o.label ? el('label', { for: btnId, text: o.label }) : null,
      button,
      o.hint ? el('p.hint', { text: o.hint }) : null
    ]);

    function find(id) { return DX.store.person(kind, id); }

    function paint() {
      util.clear(button);
      var p = selectedId && selectedId !== '*' ? find(selectedId) : null;
      if (selectedId === '*' && o.allowAll) {
        button.classList.remove('picker--empty');
        button.appendChild(el('span.avatar.avatar--all', { 'aria-hidden': 'true' }, icon('people')));
        button.appendChild(el('span.picker__text', [el('b', { text: o.allLabel || t('Everyone') })]));
      } else if (p) {
        button.classList.remove('picker--empty');
        button.appendChild(avatar(p.name, p[idKey]));
        button.appendChild(el('span.picker__text', [
          el('b', { text: p.name }),
          el('small', { text: [p[idKey], p[subKey]].filter(Boolean).join(' · ') })
        ]));
      } else {
        button.classList.add('picker--empty');
        button.appendChild(el('span.avatar.avatar--empty', { 'aria-hidden': 'true' }, icon('search')));
        button.appendChild(el('span.picker__text', [
          el('b', { text: o.placeholder || (kind === 'customer' ? t('Choose customer') : t('Choose supplier')) }),
          el('small', { text: t('Tap, then type the number or name') })
        ]));
      }
      button.appendChild(el('span.picker__change', { text: p || selectedId === '*' ? t('Change') : '' }));
      button.appendChild(icon('down', 'picker__chev'));
    }

    function choose(id, silent) {
      selectedId = id || '';
      paint();
      clearFieldError(button);
      if (!silent && o.onChange) o.onChange(selectedId === '*' ? '*' : (selectedId ? find(selectedId) : null));
    }

    /** Who can be chosen at all: stopped people only where the page allows them. */
    function allowed(p) {
      return o.includeInactive || p.status !== 'Inactive' || same(p[idKey], selectedId);
    }

    function open(preset) {
      preset = preset && preset.type !== 'click' ? preset : {};
      if (preset.filter !== undefined) mem.filter = preset.filter || '';
      if (preset.area !== undefined) mem.area = preset.area || '';
      var filters = o.filters ? (o.filters() || []) : [];
      var byKey = {};
      filters.forEach(function (f) { byKey[f.key] = f; });
      if (mem.filter && !byKey[mem.filter]) mem.filter = '';

      var groups = DX.store.areas(kind, allowed);
      var showAreas = areasUseful(groups);
      if (!showAreas) mem.area = '';
      var total = groups.total;
      var small = total <= 12;
      var query = preset.query || '';
      var found = [];
      var sure = null;     // what Enter takes: the typed number, or the only match
      var lazy = null;

      var input = el('input.search__input', {
        type: 'search', value: query, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
        enterkeyhint: 'go', 'aria-label': t('Search'),
        placeholder: kind === 'customer' ? t('Number, name, area or mobile') : t('Number, name, village or mobile')
      });
      var clearBtn = el('button.search__clear', {
        type: 'button', 'aria-label': t('Clear'), hidden: !query,
        onclick: function () { input.value = ''; query = ''; clearBtn.hidden = true; draw(); try { input.focus(); } catch (e) { /* ignore */ } }
      }, icon('close'));

      // Filter buttons: everyone, then the page's own (e.g. "Not recorded yet").
      var chipRow = filters.length ? chips({ label: t('Show'), value: mem.filter, options: [], onChange: function (v) { mem.filter = v; draw(true); } }) : null;

      var areaBtnText = el('span');
      var areaClear = el('button.toolbtn__x', { type: 'button', 'aria-label': t('Show all'), onclick: function () { mem.area = ''; paintTools(); draw(true); } }, icon('close'));
      var areaBtn = el('button.toolbtn', {
        type: 'button', 'aria-haspopup': 'dialog',
        onclick: function () {
          areaSheet({
            kind: kind, filter: allowed, value: mem.area,
            onChoose: function (key) { mem.area = key; paintTools(); draw(true); }
          });
        }
      }, [icon('pin'), areaBtnText, icon('down', 'toolbtn__chev')]);
      var sortId = el('button.seg__btn', { type: 'button', onclick: function () { mem.sort = 'id'; paintTools(); draw(); } }, t('Number'));
      var sortName = el('button.seg__btn', { type: 'button', onclick: function () { mem.sort = 'name'; paintTools(); draw(); } }, t('Name'));
      var tools = el('div.pick-tools', [
        showAreas ? el('div.toolbtn-wrap', [areaBtn, areaClear]) : null,
        el('div.seg', { role: 'group', 'aria-label': t('Order') }, [icon('sort', 'seg__icon'), sortId, sortName])
      ]);

      var count = el('p.pick-count', { 'aria-live': 'polite' });
      var listHost = el('div.pick-host');
      var addBtn = o.onAdd ? el('button.btn.btn--soft.btn--block.pick-add', {
        type: 'button',
        onclick: function () {
          var typed = query.trim();
          s.close(function () { o.onAdd(typed, function (newId) { choose(newId); }); });
        }
      }, [icon('plus'), el('span', { text: kind === 'customer' ? t('Add a new customer') : t('Add a new supplier') })]) : null;

      function paintTools() {
        areaBtnText.textContent = mem.area ? areaLabel(kind, mem.area) : allAreasLabel(kind);
        areaBtn.classList.toggle('toolbtn--on', !!mem.area);
        areaClear.hidden = !mem.area;
        sortId.setAttribute('aria-pressed', mem.sort === 'id' ? 'true' : 'false');
        sortName.setAttribute('aria-pressed', mem.sort === 'name' ? 'true' : 'false');
        tools.classList.toggle('pick-tools--searching', !!query.trim());
      }

      function paintChips() {
        if (!chipRow) return;
        var counts = {};
        var everyone = 0;
        DX.store.search(kind, '', {
          filter: function (p, e) {
            if (!allowed(p) || !inArea(e, mem.area)) return false;
            everyone++;
            filters.forEach(function (f) { if (f.test(p)) counts[f.key] = (counts[f.key] || 0) + 1; });
            return false;
          }
        });
        chipRow.setOptions([{ value: '', label: t('Everyone'), count: everyone }].concat(filters.map(function (f) {
          return { value: f.key, label: f.label, count: counts[f.key] || 0 };
        })), mem.filter);
      }

      function passes(p, e, narrow) {
        if (!allowed(p)) return false;
        if (!narrow) return true;
        if (!inArea(e, mem.area)) return false;
        if (mem.filter && byKey[mem.filter] && !byKey[mem.filter].test(p)) return false;
        return true;
      }

      function renderPick(p, i) {
        var d = o.describe ? (o.describe(p) || {}) : {};
        var done = o.isDone ? !!o.isDone(p) : !!d.done;
        var on = same(p[idKey], selectedId);
        var top = !!sure && p === sure;
        return el('button.pick' + (on ? '.pick--on' : '') + (done ? '.pick--done' : '') + (p.status === 'Inactive' ? '.pick--off' : '') + (top ? '.pick--top' : ''), {
          type: 'button', role: 'option', 'aria-selected': on ? 'true' : 'false',
          onclick: function () { take(p[idKey]); }
        }, [
          avatar(p.name, p[idKey]),
          el('span.pick__main', [
            el('b', { text: p.name }),
            el('small', { text: [p[idKey], p[subKey], d.meta].filter(Boolean).join(' · ') })
          ]),
          p.status === 'Inactive' ? chip(t('Stopped'), 'muted') : null,
          d.badge ? el('span.pick__badge' + (d.tone ? '.tone-' + d.tone : ''), [done ? icon('check') : null, el('span', { text: d.badge })]) : null
        ]);
      }

      /** full = the filters changed too, so their counts are worked out again. */
      function draw(full) {
        if (s && s.closed) return;
        if (lazy) { lazy.destroy(); lazy = null; }
        util.clear(listHost);
        if (full) paintChips();
        var q = query.trim();
        clearBtn.hidden = !q;
        tools.classList.toggle('pick-tools--searching', !!q);
        found = DX.store.search(kind, q, { sort: mem.sort, filter: function (p, e) { return passes(p, e, true); } });
        if (!q && o.isDone) {
          // Those already done go to the bottom, keeping their order.
          var todo = [], done = [];
          found.forEach(function (p) { (o.isDone(p) ? done : todo).push(p); });
          found = todo.concat(done);
        }
        var narrowed = !!(mem.area || mem.filter);
        // Enter takes a person only when it is sure: the number typed, or the only match.
        var typed = q ? DX.store.exact(kind, q) : null;
        sure = q && found.length === 1 ? found[0] : typed && found[0] === typed ? typed : null;
        if (typed && found.indexOf(typed) < 0) {
          var shownHere = allowed(typed);
          listHost.appendChild(el('div.pick-note', { role: 'status' }, [
            icon('info'),
            el('span', {
              text: shownHere
                ? t('{name} ({id}) is not in this list.', { name: typed.name, id: typed[idKey] })
                : t('{name} is stopped. Start them again on the People page first.', { name: typed.name })
            }),
            shownHere ? el('button.btn.btn--sm', {
              type: 'button', onclick: function () { mem.area = ''; mem.filter = ''; paintTools(); draw(true); }
            }, t('Show')) : null
          ]));
        }
        var n = util.fmtCount(found.length), all = util.fmtCount(total);
        count.textContent = q
          ? t('{n} found', { n: n }) + (found.length > 1 ? ' · ' + t('best match first') : '')
          : narrowed
            ? (kind === 'customer' ? t('{n} of {all} customers', { n: n, all: all }) : t('{n} of {all} suppliers', { n: n, all: all }))
            : (kind === 'customer' ? t('{n} customers', { n: n }) : t('{n} suppliers', { n: n }));

        var items = found.slice();
        if (o.allowAll && !q && !narrowed) items.unshift('*');
        if (!items.length) {
          if (typed && allowed(typed)) return;   // the note above already offers to show them
          var wide = narrowed ? DX.store.search(kind, q, { filter: function (p, e) { return passes(p, e, false); } }).length : 0;
          listHost.appendChild(empty(
            q ? t('No one matches “{q}”', { q: q }) : t('Nobody here'),
            q ? t('Try the number, part of the name, or the mobile number.') : null,
            wide ? el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () { mem.area = ''; mem.filter = ''; paintTools(); draw(true); }
            }, [icon('search'), el('span', { text: t('Look in everyone ({n} found)', { n: util.fmtCount(wide) }) })]) : null,
            'search'));
          return;
        }
        lazy = lazyList(listHost, items, function (p, i) {
          if (p === '*') {
            return el('button.pick' + (selectedId === '*' ? '.pick--on' : ''), {
              type: 'button', role: 'option', 'aria-selected': selectedId === '*' ? 'true' : 'false',
              onclick: function () { take('*'); }
            }, [el('span.avatar.avatar--all', icon('people')), el('span.pick__main', [el('b', { text: o.allLabel || t('Everyone') })])]);
          }
          return renderPick(p, o.allowAll && !q && !narrowed ? i - 1 : i);
        }, { step: 30, root: s.body, listTag: 'div.pick-list', listAttrs: { role: 'listbox', 'aria-label': o.label || '' } });
      }

      function take(id) {
        choose(id);
        s.close();
      }

      var wantKeyboard = preset.keyboard === false ? false : (finePointer() || !small);
      var onType = util.debounce(function () { query = input.value; draw(); }, 70);
      var s = null;
      s = sheet({
        title: o.title || o.label || (kind === 'customer' ? t('Choose customer') : t('Choose supplier')),
        full: true,
        content: [
          el('div.search', [icon('search'), input, clearBtn]),
          small ? null : el('div.pick-head', [chipRow, tools]),
          small && chipRow ? chipRow : null,
          count,
          listHost,
          addBtn
        ],
        autofocus: wantKeyboard ? '.search__input' : null,
        onClose: function () { onType.cancel(); if (lazy) { lazy.destroy(); lazy = null; } }
      });
      // Focus now, inside the tap, so the phone opens its keyboard.
      if (wantKeyboard) { try { input.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

      input.addEventListener('input', onType);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          var first = listHost.querySelector('.pick');
          if (first) { e.preventDefault(); first.focus(); }
          return;
        }
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (input.value.trim() !== query.trim()) { onType.cancel(); query = input.value; draw(); }
        if (sure) { take(sure[idKey]); return; }
        // Not sure which one: put the keyboard away so the whole list can be seen.
        if (found.length) { try { input.blur(); } catch (err) { /* ignore */ } }
      });
      paintTools();
      draw(true);
      return s;
    }

    button.addEventListener('click', function () { open(); });
    paint();

    wrap.control = button;
    wrap.open = open;
    wrap.get = function () { return selectedId === '*' ? '*' : (selectedId ? find(selectedId) : null); };
    wrap.id = function () { return selectedId; };
    wrap.set = function (id, silent) { choose(id, silent); };
    wrap.clear = function (silent) { choose('', silent); };
    wrap.repaint = paint;
    return wrap;
  }

  /**
   * matcher('supplier', 's12') → test(id, name): the same search as the chooser
   * (S12 finds S0012, part of a name, village or mobile), plus plain text in
   * the name for rows whose person is no longer on the list.
   */
  function matcher(kind, q) {
    var ranks = {};
    DX.store.search(kind, q).forEach(function (p, i) { ranks[String(p[kind === 'customer' ? 'customerId' : 'supplierId']).toLowerCase()] = i + 1; });
    var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    var test = function (id, name) {
      if (ranks[String(id || '').toLowerCase()]) return true;
      var hay = (String(id || '') + ' ' + String(name || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    };
    /** Best match first: 1, 2, 3… (plain text matches after all the others). */
    test.rank = function (id) { return ranks[String(id || '').toLowerCase()] || 1e9; };
    /** The items that match, best match first; equal ones keep their order. */
    test.pick = function (items, idOf, nameOf) {
      return items.map(function (it, i) { return { it: it, i: i, id: idOf(it) }; })
        .filter(function (x) { return test(x.id, nameOf(x.it)); })
        .sort(function (a, b) { return test.rank(a.id) - test.rank(b.id) || a.i - b.i; })
        .map(function (x) { return x.it; });
    };
    return test;
  }

  /** Does this person match what was typed (number, name, village / area or mobile)? */
  function personMatch(kind, p, q) {
    if (!p) return false;
    return matcher(kind, q)(p[kind === 'customer' ? 'customerId' : 'supplierId'], p.name);
  }

  /**
   * A list on a page that gets its own search box once it is long, and draws
   * a part at a time. searchList({ items: () → [], render(item),
   *   kind + person(item) → searched like the chooser, or match(item, q),
   *   empty: () → node, placeholder, step, searchFrom })  → node with .refresh(), .destroy()
   */
  function searchList(o) {
    var query = '';
    var lazy = null;
    var input = el('input.search__input', {
      type: 'search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
      enterkeyhint: 'search', 'aria-label': t('Search'), placeholder: o.placeholder || t('Number or name')
    });
    var box = el('div.search.inline-search', [icon('search'), input]);
    var host = el('div');
    var wrap = el('div.searchlist', [box, host]);
    input.addEventListener('input', util.debounce(function () { query = input.value; draw(); }, 110));

    var destroyed = false;
    function draw() {
      if (destroyed) return;
      var keep = lazy ? lazy.shown() : 0;
      if (lazy) { lazy.destroy(); lazy = null; }
      util.clear(host);
      var items = o.items() || [];
      var q = query.trim().toLowerCase();
      box.hidden = items.length <= (o.searchFrom || 15) && !q;
      if (!items.length) { if (o.empty) host.appendChild(o.empty()); return; }
      var shown = items;
      if (q && o.kind && o.person) {
        var idKey = o.kind === 'customer' ? 'customerId' : 'supplierId';
        shown = matcher(o.kind, q).pick(items,
          function (it) { var p = o.person(it); return p ? p[idKey] : ''; },
          function (it) { var p = o.person(it); return p ? p.name : ''; });
      } else if (q) {
        shown = items.filter(function (it) { return o.match(it, q); });
      }
      if (!shown.length) { host.appendChild(empty(t('No one matches “{q}”', { q: query.trim() }), null, null, 'search')); return; }
      lazy = lazyList(host, shown, o.render, { step: o.step || 30, initial: keep });
    }
    wrap.refresh = draw;
    wrap.destroy = function () { destroyed = true; if (lazy) { lazy.destroy(); lazy = null; } };
    draw();
    return wrap;
  }

  function personSub(kind, p) {
    if (!p) return '';
    return [kind === 'customer' ? p.customerId : p.supplierId, kind === 'customer' ? p.address : p.village].filter(Boolean).join(' · ');
  }

  return {
    icon: icon, ICONS: ICONS,
    toast: toast, say: say, explain: explain, reportError: reportError,
    setFieldError: setFieldError, clearFieldError: clearFieldError, clearFieldErrors: clearFieldErrors,
    field: field, choice: choice, toggle: toggle, dateField: dateField,
    sheet: sheet, closeAllSheets: closeAllSheets, confirm: confirmAction, actions: actions,
    avatar: avatar, chip: chip, stat: stat, empty: empty, banner: banner, busy: busy,
    sectionHead: sectionHead, row: row, syncMark: syncMark, picker: picker, personSub: personSub,
    lazyList: lazyList, chips: chips, areaSheet: areaSheet, areaLabel: areaLabel, areasUseful: areasUseful, inArea: inArea,
    allAreasLabel: allAreasLabel, finePointer: finePointer, personMatch: personMatch, matcher: matcher, searchList: searchList
  };
})();

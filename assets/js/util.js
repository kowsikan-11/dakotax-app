/* Small helpers shared by every page. No dependencies, no build step. */
window.DX = window.DX || {};

DX.util = (function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toIso(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /** Today on this phone, as yyyy-mm-dd. */
  function localToday() { return toIso(new Date()); }

  function parseIso(iso) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function isIsoDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    var d = parseIso(iso);
    return !!d && toIso(d) === iso;
  }

  function addDays(iso, days) {
    var d = parseIso(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + days);
    return toIso(d);
  }

  function monthStart(iso) { var d = parseIso(iso) || new Date(); return toIso(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function monthEnd(iso) { var d = parseIso(iso) || new Date(); return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }

  function months() { return DX.i18n.months(); }
  function weekdays() { return DX.i18n.weekdays(); }

  /** 21 Oct 2026, or 21 Oct with style 'short'. */
  function fmtDate(iso, style) {
    var d = parseIso(iso);
    if (!d) return iso || '';
    var m = months()[d.getMonth()];
    if (style === 'short') return d.getDate() + ' ' + m;
    return d.getDate() + ' ' + m + ' ' + d.getFullYear();
  }

  /** Wed, 21 Oct — with Today / Yesterday where that is clearer. */
  function fmtDay(iso, withYear) {
    var d = parseIso(iso);
    if (!d) return iso || '';
    var today = localToday();
    var base = weekdays()[d.getDay()] + ', ' + d.getDate() + ' ' + months()[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '');
    if (iso === today) return DX.i18n.t('Today') + ' · ' + base;
    if (iso === addDays(today, -1)) return DX.i18n.t('Yesterday') + ' · ' + base;
    return base;
  }

  /** Today, 21 Oct · Yesterday, 20 Oct · Mon, 19 Oct — short enough for a phone button. */
  function fmtShortDay(iso) {
    var d = parseIso(iso);
    if (!d) return iso || '';
    var today = localToday();
    var tail = d.getDate() + ' ' + months()[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
    if (iso === today) return DX.i18n.t('Today') + ', ' + tail;
    if (iso === addDays(today, -1)) return DX.i18n.t('Yesterday') + ', ' + tail;
    return weekdays()[d.getDay()] + ', ' + tail;
  }

  /** 21 Oct, with the year only when it is not this year. */
  function fmtDayMonth(iso) {
    var d = parseIso(iso);
    if (!d) return iso || '';
    return d.getDate() + ' ' + months()[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /* One formatter per style, made once: long lists format thousands of numbers. */
  var FORMATTERS = {};
  function formatter(minDp, maxDp) {
    var key = minDp + ':' + maxDp;
    if (!FORMATTERS[key]) {
      try {
        FORMATTERS[key] = new Intl.NumberFormat('en-IN', { minimumFractionDigits: minDp, maximumFractionDigits: maxDp });
      } catch (err) {
        FORMATTERS[key] = { format: function (n) { return Number(n).toFixed(maxDp); } };
      }
    }
    return FORMATTERS[key];
  }

  function fmtNum(value, dp) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    dp = dp === undefined ? 2 : dp;
    return formatter(dp, dp).format(n);
  }

  /** A count with thousands marks: 1,950. */
  function fmtCount(value) { return fmtNum(Number(value) || 0, 0); }

  /** Litres with at most one decimal, no trailing ".0" noise on whole numbers. */
  function fmtLitres(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    return formatter(whole ? 0 : 1, 2).format(n) + ' L';
  }

  var SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

  function fmtMoney(value, currency, dp) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    var symbol = SYMBOLS[currency || 'INR'] || '';
    var places = dp === undefined ? 2 : dp;
    var text = formatter(places, places).format(Math.abs(n));
    return (n < 0 ? '−' : '') + symbol + text;
  }

  /** Reads what a person typed into a number box: "8,5", " 12 " and "1,250.50" all work. */
  function parseNum(value) {
    if (value === null || value === undefined) return NaN;
    var s = String(value).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');   // 8,5 typed on a comma keypad
    s = s.replace(/,/g, '');
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
    return Number(s);
  }

  function round(n, dp) {
    var f = Math.pow(10, dp === undefined ? 2 : dp);
    return Math.round(Number(n) * f) / f;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Tiny element builder: el('div.card#x', {attr: 1, onclick: fn}, [child, 'text']) */
  function el(spec, attrs, children) {
    var parts = String(spec).split(/(?=[.#])/);
    var node = document.createElement(parts[0] || 'div');
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    }
    if (attrs && (Array.isArray(attrs) || typeof attrs === 'string' || typeof attrs === 'number' || attrs instanceof Node)) {
      children = attrs; attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'class') String(value).split(/\s+/).forEach(function (c) { if (c) node.classList.add(c); });
        else if (key === 'style' && typeof value === 'object') Object.keys(value).forEach(function (s) { node.style[s] = value[s]; });
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        else if (key === 'value' && ('value' in node)) node.value = value;
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach(function (c) { appendChildren(node, c); }); return; }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  }

  function clear(node) { if (node && node.firstChild) node.textContent = ''; }

  function replace(node, children) { clear(node); appendChildren(node, children); return node; }

  function debounce(fn, wait) {
    var timer;
    var wrapped = function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 200);
    };
    wrapped.cancel = function () { clearTimeout(timer); };
    return wrapped;
  }

  function toCsv(headers, rows) {
    function cell(v) {
      var s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return [headers.map(cell).join(',')]
      .concat(rows.map(function (r) { return r.map(cell).join(','); }))
      .join('\r\n');
  }

  function downloadCsv(filename, csv) {
    // The BOM makes Excel open UTF-8 (and the rupee sign, and Tamil names) correctly.
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /** Which round the clock says we are in. Cutover hour comes from Settings. */
  function detectShift(cutoverHour) {
    var hour = new Date().getHours();
    var cut = Number(cutoverHour);
    if (!(cut >= 0 && cut <= 23)) cut = 12;
    return hour < cut ? 'Morning' : 'Evening';
  }

  function clockLabel(date) {
    var d = date || new Date();
    var h = d.getHours(), m = pad(d.getMinutes());
    var suffix = h < 12 ? 'am' : 'pm';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + m + ' ' + suffix;
  }

  function sum(rows, key) {
    return rows.reduce(function (t, r) { return t + (Number(r[key]) || 0); }, 0);
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function initials(name) {
    var words = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    var first = Array.from ? Array.from(words[0])[0] : words[0][0];
    var second = words.length > 1 ? (Array.from ? Array.from(words[words.length - 1])[0] : words[words.length - 1][0]) : '';
    // Latin initials read well in pairs; other scripts are clearer with one letter.
    return /^[A-Za-z]$/.test(first) && /^[A-Za-z]?$/.test(second) ? (first + second).toUpperCase() : first;
  }

  function hashIndex(text, buckets) {
    var h = 0;
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % buckets;
  }

  /** Compares IDs like S2 and S10 the way a person would. */
  function naturalCompare(a, b) {
    var ax = String(a || '').toLowerCase().match(/(\d+|\D+)/g) || [];
    var bx = String(b || '').toLowerCase().match(/(\d+|\D+)/g) || [];
    for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
      var x = ax[i], y = bx[i];
      if (x === y) continue;
      var nx = /^\d/.test(x), ny = /^\d/.test(y);
      if (nx && ny) return Number(x) - Number(y);
      return x < y ? -1 : 1;
    }
    return ax.length - bx.length;
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (err) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (err) { return false; }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (err) { /* private mode */ }
  }

  return {
    pad: pad, toIso: toIso, localToday: localToday, parseIso: parseIso, isIsoDate: isIsoDate,
    addDays: addDays, monthStart: monthStart, monthEnd: monthEnd,
    fmtDate: fmtDate, fmtDay: fmtDay, fmtShortDay: fmtShortDay, fmtDayMonth: fmtDayMonth, fmtNum: fmtNum, fmtCount: fmtCount, fmtLitres: fmtLitres, fmtMoney: fmtMoney,
    parseNum: parseNum, round: round, escapeHtml: escapeHtml,
    el: el, clear: clear, replace: replace, appendChildren: appendChildren, debounce: debounce,
    toCsv: toCsv, downloadCsv: downloadCsv,
    detectShift: detectShift, clockLabel: clockLabel, sum: sum, uid: uid,
    initials: initials, hashIndex: hashIndex, naturalCompare: naturalCompare,
    storageGet: storageGet, storageSet: storageSet, storageRemove: storageRemove
  };
})();

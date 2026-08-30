/* Small helpers shared by every page. No dependencies, no build step. */
window.DX = window.DX || {};

DX.util = (function () {
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseIso(iso) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[0]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function toIso(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function addDays(iso, days) {
    var d = parseIso(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + days);
    return toIso(d);
  }

  function monthStart(iso) { var d = parseIso(iso) || new Date(); return toIso(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function monthEnd(iso) { var d = parseIso(iso) || new Date(); return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }

  function fmtDate(iso, style) {
    var d = parseIso(iso);
    if (!d) return iso || '';
    if (style === 'short') return d.getDate() + ' ' + MONTHS[d.getMonth()];
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtNum(value, dp) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    dp = dp === undefined ? 2 : dp;
    return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function fmtMoney(value, currency) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    var symbol = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[currency || 'INR'] || '';
    return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Tiny element builder: el('div.card', {id:'x'}, [child, 'text']) */
  function el(spec, attrs, children) {
    var parts = String(spec).split(/(?=[.#])/);
    var node = document.createElement(parts[0] || 'div');
    parts.slice(1).forEach(function (p) {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    });
    if (attrs && (Array.isArray(attrs) || typeof attrs === 'string' || attrs instanceof Node)) {
      children = attrs; attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
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

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 200);
    };
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
    // The BOM makes Excel open UTF-8 (and the rupee sign) correctly.
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** Which shift the clock says we are in. Cutover hour comes from Settings. */
  function detectShift(cutoverHour) {
    var hour = new Date().getHours();
    return hour < (Number(cutoverHour) || 12) ? 'Morning' : 'Evening';
  }

  function clockLabel() {
    var d = new Date();
    var h = d.getHours(), m = pad(d.getMinutes());
    var suffix = h < 12 ? 'am' : 'pm';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + m + ' ' + suffix;
  }

  function sum(rows, key) {
    return rows.reduce(function (t, r) { return t + (Number(r[key]) || 0); }, 0);
  }

  return {
    isoToday: isoToday, parseIso: parseIso, toIso: toIso, addDays: addDays,
    monthStart: monthStart, monthEnd: monthEnd, fmtDate: fmtDate,
    fmtNum: fmtNum, fmtMoney: fmtMoney, escapeHtml: escapeHtml,
    el: el, clear: clear, debounce: debounce,
    toCsv: toCsv, downloadCsv: downloadCsv,
    detectShift: detectShift, clockLabel: clockLabel, sum: sum, pad: pad
  };
})();

/* Hand-drawn SVG charts. No chart library to download over a weak signal.
 *
 * Colours come from CSS custom properties (--c-in, --c-out, --c-morning,
 * --c-evening) that are re-stepped for dark mode in app.css. Every chart has a
 * legend and a tap/hover readout, so nothing depends on colour alone.
 * On a phone, tap a bar to read it; tap anywhere else to close the readout.
 */
window.DX = window.DX || {};

DX.charts = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var tip = null;
  var tipOwner = null;

  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'charttip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
      document.addEventListener('touchstart', function (e) {
        if (tipOwner && !(e.target.closest && e.target.closest('.chart'))) hideTip();
      }, { passive: true });
      window.addEventListener('scroll', hideTip, { passive: true });
    }
    return tip;
  }

  function showTip(html, x, y, owner) {
    var node = tooltip();
    node.innerHTML = html;
    node.dataset.open = 'true';
    tipOwner = owner || null;
    var w = node.offsetWidth || 160;
    var left = Math.min(Math.max(x, w / 2 + 8), window.innerWidth - w / 2 - 8);
    node.style.left = left + 'px';
    node.style.top = Math.max(y, node.offsetHeight + 12) + 'px';
  }

  function hideTip() {
    if (tip) tip.dataset.open = 'false';
    tipOwner = null;
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /** Rounded only on the end away from the baseline. */
  function barPath(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) +
      'L' + x + ',' + (y + r) +
      'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'L' + (x + w - r) + ',' + y +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'L' + (x + w) + ',' + (y + h) + 'Z';
  }

  function niceMax(value) {
    if (value <= 0) return 10;
    var pow = Math.pow(10, Math.floor(Math.log10(value)));
    var scaled = value / pow;
    var step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
    return step * pow;
  }

  function legend(series) {
    var util = DX.util;
    return util.el('ul.legend', series.map(function (s) {
      return util.el('li', [util.el('span.swatch', { style: 'background:' + s.color }), s.label]);
    }));
  }

  /** Redraws when the box changes width; lets go once the chart leaves the page. */
  function watch(container, draw) {
    draw();
    if (container.__dxObserver) container.__dxObserver.disconnect();
    if (typeof ResizeObserver !== 'function') return;
    var last = container.clientWidth;
    var obs = new ResizeObserver(function () {
      if (!container.isConnected) { obs.disconnect(); return; }
      if (Math.abs(container.clientWidth - last) < 8) return;
      last = container.clientWidth;
      draw();
    });
    obs.observe(container);
    container.__dxObserver = obs;
  }

  function hitArea(svg, attrs, label, html) {
    var hit = svgEl('rect', Object.assign({ fill: 'transparent', tabindex: '0', role: 'button', 'aria-label': label }, attrs));
    function show() {
      var box = hit.getBoundingClientRect();
      showTip(html(), box.left + box.width / 2, box.top + 4, hit);
    }
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('mouseleave', hideTip);
    hit.addEventListener('blur', hideTip);
    hit.addEventListener('click', function () { if (tipOwner === hit) hideTip(); else show(); });
    svg.appendChild(hit);
    return hit;
  }

  function showTick(rows, i) {
    return rows.length <= 10 || i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2);
  }

  /* ---------------------------------------------------------------------- *
   * Stacked columns: litres per day, split by shift.
   * ---------------------------------------------------------------------- */
  function stacked(container, options) {
    var util = DX.util;
    var rows = options.rows || [];
    var series = options.series || [];
    var unit = options.unit || '';

    function draw() {
      util.clear(container);
      var totals = rows.map(function (r) {
        return series.reduce(function (t, s) { return t + (Number(r[s.key]) || 0); }, 0);
      });
      if (!rows.length || !totals.some(function (v) { return v > 0; })) {
        container.appendChild(util.el('p.chart-empty', { text: options.emptyText || '' }));
        return;
      }
      container.appendChild(legend(series));

      var width = Math.max(container.clientWidth || 640, 260);
      var height = options.height || 200;
      var pad = { top: 10, right: 6, bottom: 24, left: 36 };
      var plotW = width - pad.left - pad.right;
      var plotH = height - pad.top - pad.bottom;
      var max = niceMax(Math.max.apply(null, totals.concat([1])));
      var step = plotW / rows.length;
      var barW = Math.max(3, Math.min(28, step - 6));

      var svg = svgEl('svg', {
        class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
        width: '100%', height: height, role: 'img', 'aria-label': options.ariaLabel || ''
      });

      [0, 0.5, 1].forEach(function (f) {
        var y = pad.top + plotH - plotH * f;
        svg.appendChild(svgEl('line', { class: f === 0 ? 'axis-line' : 'grid-line', x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
        var label = svgEl('text', { x: pad.left - 6, y: y + 3, 'text-anchor': 'end' });
        label.textContent = util.fmtNum(max * f, 0);
        svg.appendChild(label);
      });

      rows.forEach(function (row, i) {
        var x = pad.left + i * step + (step - barW) / 2;
        var cursor = pad.top + plotH;
        series.forEach(function (s, si) {
          var value = Number(row[s.key]) || 0;
          if (value <= 0) return;
          var h = (value / max) * plotH;
          var gap = si > 0 ? 2 : 0;
          var isTop = series.slice(si + 1).every(function (later) { return !(Number(row[later.key]) > 0); });
          var y = cursor - h;
          svg.appendChild(svgEl('path', { class: 'bar', d: barPath(x, y + gap, barW, Math.max(h - gap, 1), isTop ? 4 : 0), fill: s.color }));
          cursor = y;
        });

        var title = options.labelOf ? options.labelOf(row) : row.date;
        hitArea(svg, { x: pad.left + i * step, y: pad.top, width: step, height: plotH },
          title + ': ' + util.fmtNum(totals[i], 1) + ' ' + unit,
          function () {
            return '<h4>' + util.escapeHtml(title) + '</h4><dl>' +
              series.map(function (s) {
                return '<dt><span class="swatch" style="background:' + s.color + '"></span>' + util.escapeHtml(s.label) + '</dt>' +
                  '<dd>' + util.fmtNum(Number(row[s.key]) || 0, 1) + '</dd>';
              }).join('') +
              '<dt><b>' + util.escapeHtml(options.totalLabel || 'Total') + '</b></dt><dd><b>' + util.fmtNum(totals[i], 1) + '</b></dd></dl>';
          });

        if (showTick(rows, i)) {
          var tick = svgEl('text', { x: pad.left + i * step + step / 2, y: height - 7, 'text-anchor': 'middle' });
          tick.textContent = options.tickOf ? options.tickOf(row) : util.fmtDate(row.date, 'short');
          svg.appendChild(tick);
        }
      });
      container.appendChild(svg);
    }
    watch(container, draw);
  }

  /* ---------------------------------------------------------------------- *
   * Horizontal bars, directly labelled. Used to rank people.
   * ---------------------------------------------------------------------- */
  function ranked(container, options) {
    var util = DX.util;
    var rows = (options.rows || []).slice(0, options.limit || 8);

    function draw() {
      util.clear(container);
      if (!rows.length) {
        container.appendChild(util.el('p.chart-empty', { text: options.emptyText || '' }));
        return;
      }
      var width = Math.max(container.clientWidth || 520, 240);
      var rowH = 32;
      var height = rows.length * rowH + 6;
      var labelW = Math.min(150, Math.max(92, Math.round(width * 0.34)));
      var valueW = 70;
      var plotW = Math.max(40, width - labelW - valueW - 8);
      var max = Math.max.apply(null, rows.map(function (r) { return Number(r.value) || 0; }).concat([1]));

      var svg = svgEl('svg', {
        class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
        width: '100%', height: height, role: 'img', 'aria-label': options.ariaLabel || ''
      });

      rows.forEach(function (row, i) {
        var y = i * rowH + 6;
        var barH = 16;
        var w = Math.max(2, ((Number(row.value) || 0) / max) * plotW);
        var fmt = options.format || function (v) { return util.fmtNum(v, 1); };

        var name = svgEl('text', { x: 0, y: y + barH - 3, 'text-anchor': 'start', class: 'rank-label' });
        var label = String(row.label || '');
        name.textContent = label.length > 18 ? label.slice(0, 17) + '…' : label;
        svg.appendChild(name);

        svg.appendChild(svgEl('path', {
          class: 'bar',
          d: 'M' + labelW + ',' + y + 'h' + Math.max(w - 4, 0) + 'q4,0 4,4v' + (barH - 8) + 'q0,4 -4,4h-' + Math.max(w - 4, 0) + 'z',
          fill: options.color || 'var(--c-in)'
        }));

        var value = svgEl('text', { class: 'value-label', x: labelW + w + 6, y: y + barH - 3, 'text-anchor': 'start' });
        value.textContent = fmt(row.value);
        svg.appendChild(value);

        hitArea(svg, { x: 0, y: y - 6, width: width, height: rowH }, label + ': ' + fmt(row.value), function () {
          return '<h4>' + util.escapeHtml(label) + '</h4><dl><dt>' + util.escapeHtml(options.measure || '') + '</dt><dd>' + fmt(row.value) + '</dd>' +
            (row.meta ? '<dt>' + util.escapeHtml(row.meta.label) + '</dt><dd>' + util.escapeHtml(row.meta.value) + '</dd>' : '') + '</dl>';
        });
      });
      container.appendChild(svg);
    }
    watch(container, draw);
  }

  /* ---------------------------------------------------------------------- *
   * Milk in above the line, milk out below it. The gap is the day's margin.
   * ---------------------------------------------------------------------- */
  function diverging(container, options) {
    var util = DX.util;
    var rows = options.rows || [];
    var up = options.up, down = options.down;
    var unit = options.unit || '';

    function draw() {
      util.clear(container);
      var any = rows.some(function (r) { return (Number(r[up.key]) || 0) > 0 || (Number(r[down.key]) || 0) > 0; });
      if (!rows.length || !any) {
        container.appendChild(util.el('p.chart-empty', { text: options.emptyText || '' }));
        return;
      }
      container.appendChild(legend([up, down]));

      var width = Math.max(container.clientWidth || 640, 260);
      var height = options.height || 230;
      var pad = { top: 10, right: 6, bottom: 24, left: 36 };
      var plotW = width - pad.left - pad.right;
      var plotH = height - pad.top - pad.bottom;
      var half = plotH / 2;
      var zeroY = pad.top + half;
      var max = niceMax(Math.max.apply(null, rows.map(function (r) {
        return Math.max(Number(r[up.key]) || 0, Number(r[down.key]) || 0);
      }).concat([1])));
      var step = plotW / rows.length;
      var barW = Math.max(3, Math.min(24, step - 8));
      var fmt = options.format || function (v) { return util.fmtNum(v, 1); };

      var svg = svgEl('svg', {
        class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
        width: '100%', height: height, role: 'img', 'aria-label': options.ariaLabel || ''
      });

      [1, 0.5, 0, -0.5, -1].forEach(function (f) {
        var y = zeroY - half * f;
        svg.appendChild(svgEl('line', { class: f === 0 ? 'zero-line' : 'grid-line', x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
        if (f === 1 || f === -1 || f === 0) {
          var label = svgEl('text', { x: pad.left - 6, y: y + 3, 'text-anchor': 'end' });
          label.textContent = util.fmtNum(Math.abs(max * f), 0);
          svg.appendChild(label);
        }
      });

      rows.forEach(function (row, i) {
        var x = pad.left + i * step + (step - barW) / 2;
        var upValue = Number(row[up.key]) || 0;
        var downValue = Number(row[down.key]) || 0;
        var upH = (upValue / max) * half;
        var downH = (downValue / max) * half;
        if (upValue > 0) {
          svg.appendChild(svgEl('path', { class: 'bar', fill: up.color, d: barPath(x, zeroY - upH - 2, barW, Math.max(upH, 1), 4) }));
        }
        if (downValue > 0) {
          var g = svgEl('g', { transform: 'translate(0,' + (2 * zeroY) + ') scale(1,-1)' });
          g.appendChild(svgEl('path', { class: 'bar', fill: down.color, d: barPath(x, zeroY - downH - 2, barW, Math.max(downH, 1), 4) }));
          svg.appendChild(g);
        }
        var title = options.labelOf ? options.labelOf(row) : row.date;
        var diff = downValue - upValue;
        hitArea(svg, { x: pad.left + i * step, y: pad.top, width: step, height: plotH },
          title + ': ' + up.label + ' ' + fmt(upValue) + ', ' + down.label + ' ' + fmt(downValue),
          function () {
            return '<h4>' + util.escapeHtml(title) + '</h4><dl>' +
              '<dt><span class="swatch" style="background:' + up.color + '"></span>' + util.escapeHtml(up.label) + '</dt><dd>' + fmt(upValue) + '</dd>' +
              '<dt><span class="swatch" style="background:' + down.color + '"></span>' + util.escapeHtml(down.label) + '</dt><dd>' + fmt(downValue) + '</dd>' +
              '<dt><b>' + util.escapeHtml(options.marginLabel || '') + '</b></dt><dd><b>' + (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)) + '</b></dd></dl>';
          });
        if (showTick(rows, i)) {
          var tick = svgEl('text', { x: pad.left + i * step + step / 2, y: height - 7, 'text-anchor': 'middle' });
          tick.textContent = options.tickOf ? options.tickOf(row) : util.fmtDate(row.date, 'short');
          svg.appendChild(tick);
        }
      });
      container.appendChild(svg);
    }
    watch(container, draw);
  }

  return { stacked: stacked, ranked: ranked, diverging: diverging, hideTip: hideTip };
})();

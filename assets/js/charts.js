/* Hand-drawn SVG charts. No chart library, so the app still works on a phone
 * with no signal once the page itself is cached.
 *
 * Colours come from CSS custom properties (--series-1..3), which are re-stepped
 * for dark mode in app.css. Every chart ships a legend, a hover tooltip and a
 * matching table elsewhere on the page, so identity is never colour alone.
 */
window.DX = window.DX || {};

DX.charts = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var tip = null;

  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'charttip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showTip(html, x, y) {
    var node = tooltip();
    node.innerHTML = html;
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.dataset.open = 'true';
  }

  function hideTip() { if (tip) tip.dataset.open = 'false'; }

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
      return util.el('li', [
        util.el('span.swatch', { style: 'background:' + s.color }),
        s.label
      ]);
    }));
  }

  function watch(container, draw) {
    draw();
    if (container.__dxObserver) container.__dxObserver.disconnect();
    if (typeof ResizeObserver === 'function') {
      var last = container.clientWidth;
      var obs = new ResizeObserver(function () {
        if (Math.abs(container.clientWidth - last) < 8) return;
        last = container.clientWidth;
        draw();
      });
      obs.observe(container);
      container.__dxObserver = obs;
    }
  }

  /* ---------------------------------------------------------------------- *
   * Stacked column chart: litres per day, split by shift.
   * ---------------------------------------------------------------------- */
  function stacked(container, options) {
    var util = DX.util;
    var rows = options.rows || [];
    var series = options.series || [];
    var unit = options.unit || '';

    function draw() {
      util.clear(container);
      if (!rows.length) {
        container.appendChild(util.el('p.empty', { text: options.emptyText || 'Nothing recorded in this period yet.' }));
        return;
      }
      container.appendChild(legend(series));

      var width = Math.max(container.clientWidth || 640, 280);
      var height = options.height || 220;
      var pad = { top: 12, right: 8, bottom: 26, left: 40 };
      var plotW = width - pad.left - pad.right;
      var plotH = height - pad.top - pad.bottom;

      var totals = rows.map(function (r) {
        return series.reduce(function (t, s) { return t + (Number(r[s.key]) || 0); }, 0);
      });
      var max = niceMax(Math.max.apply(null, totals.concat([1])));
      var step = plotW / rows.length;
      var barW = Math.max(3, Math.min(30, step - 6));

      var svg = svgEl('svg', {
        class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
        width: '100%', height: height, role: 'img',
        'aria-label': options.ariaLabel || 'Column chart'
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
        var stackTotal = totals[i];

        series.forEach(function (s, si) {
          var value = Number(row[s.key]) || 0;
          if (value <= 0) return;
          var h = (value / max) * plotH;
          // 2px of surface between stacked segments keeps the boundary readable.
          var gap = si > 0 ? 2 : 0;
          var isTop = series.slice(si + 1).every(function (later) { return !(Number(row[later.key]) > 0); });
          var y = cursor - h;
          var path = svgEl('path', {
            class: 'bar',
            d: barPath(x, y + gap, barW, Math.max(h - gap, 1), isTop ? 4 : 0),
            fill: s.color
          });
          svg.appendChild(path);
          cursor = y;
        });

        var hit = svgEl('rect', {
          x: pad.left + i * step, y: pad.top, width: step, height: plotH,
          fill: 'transparent', tabindex: '0', role: 'button',
          'aria-label': (options.labelOf ? options.labelOf(row) : row.date) + ': ' + util.fmtNum(stackTotal, 1) + ' ' + unit
        });
        function show(evt) {
          var box = hit.getBoundingClientRect();
          var html = '<h4>' + util.escapeHtml(options.labelOf ? options.labelOf(row) : row.date) + '</h4><dl>' +
            series.map(function (s) {
              return '<dt><span class="swatch" style="background:' + s.color + '"></span>' + util.escapeHtml(s.label) + '</dt>' +
                '<dd>' + util.fmtNum(Number(row[s.key]) || 0, 1) + '</dd>';
            }).join('') +
            '<dt><b>Total</b></dt><dd><b>' + util.fmtNum(stackTotal, 1) + '</b></dd></dl>';
          showTip(html, box.left + box.width / 2, box.top + 4);
        }
        hit.addEventListener('mouseenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('mouseleave', hideTip);
        hit.addEventListener('blur', hideTip);
        svg.appendChild(hit);

        // Label only the ends and the middle, so the axis never collides.
        if (rows.length <= 10 || i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2)) {
          var tick = svgEl('text', { x: pad.left + i * step + step / 2, y: height - 8, 'text-anchor': 'middle' });
          tick.textContent = options.tickOf ? options.tickOf(row) : util.fmtDate(row.date, 'short');
          svg.appendChild(tick);
        }
      });

      container.appendChild(svg);
    }

    watch(container, draw);
  }

  /* ---------------------------------------------------------------------- *
   * Horizontal bars: one series, directly labelled. Used for supplier ranks.
   * ---------------------------------------------------------------------- */
  function ranked(container, options) {
    var util = DX.util;
    var rows = (options.rows || []).slice(0, options.limit || 8);

    function draw() {
      util.clear(container);
      if (!rows.length) {
        container.appendChild(util.el('p.empty', { text: options.emptyText || 'No suppliers to rank yet.' }));
        return;
      }
      var width = Math.max(container.clientWidth || 520, 260);
      var rowH = 30;
      var height = rows.length * rowH + 8;
      var labelW = Math.min(140, Math.max(90, Math.round(width * 0.32)));
      var valueW = 62;
      var plotW = Math.max(40, width - labelW - valueW - 8);
      var max = Math.max.apply(null, rows.map(function (r) { return Number(r.value) || 0; }).concat([1]));

      var svg = svgEl('svg', {
        class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
        width: '100%', height: height, role: 'img',
        'aria-label': options.ariaLabel || 'Ranked bar chart'
      });

      rows.forEach(function (row, i) {
        var y = i * rowH + 4;
        var barH = 14;
        var w = Math.max(2, ((Number(row.value) || 0) / max) * plotW);

        var name = svgEl('text', { x: 0, y: y + barH - 2, 'text-anchor': 'start' });
        name.textContent = row.label.length > 18 ? row.label.slice(0, 17) + '…' : row.label;
        name.setAttribute('fill', 'var(--ink-2)');
        svg.appendChild(name);

        var bar = svgEl('path', {
          class: 'bar',
          d: 'M' + labelW + ',' + y + 'h' + Math.max(w - 4, 0) +
             'q4,0 4,4v' + (barH - 8) + 'q0,4 -4,4h-' + Math.max(w - 4, 0) + 'z',
          fill: options.color || 'var(--series-3)'
        });
        svg.appendChild(bar);

        var value = svgEl('text', { class: 'value-label', x: labelW + w + 7, y: y + barH - 2, 'text-anchor': 'start' });
        value.textContent = options.format ? options.format(row.value) : util.fmtNum(row.value, 1);
        svg.appendChild(value);

        var hit = svgEl('rect', {
          x: 0, y: y - 4, width: width, height: rowH, fill: 'transparent',
          tabindex: '0', role: 'button',
          'aria-label': row.label + ': ' + (options.format ? options.format(row.value) : util.fmtNum(row.value, 1))
        });
        function show() {
          var box = hit.getBoundingClientRect();
          showTip('<h4>' + util.escapeHtml(row.label) + '</h4><dl><dt>' +
            util.escapeHtml(options.measure || 'Value') + '</dt><dd>' +
            (options.format ? options.format(row.value) : util.fmtNum(row.value, 1)) + '</dd>' +
            (row.meta ? '<dt>' + util.escapeHtml(row.meta.label) + '</dt><dd>' + util.escapeHtml(row.meta.value) + '</dd>' : '') +
            '</dl>', box.left + box.width / 2, box.top + 4);
        }
        hit.addEventListener('mouseenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('mouseleave', hideTip);
        hit.addEventListener('blur', hideTip);
        svg.appendChild(hit);
      });

      container.appendChild(svg);
    }

    watch(container, draw);
  }

  function seriesColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  return { stacked: stacked, ranked: ranked, seriesColor: seriesColor, hideTip: hideTip };
})();

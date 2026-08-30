/* One place for the data the pages share, and one place that refreshes it. */
window.DX = window.DX || {};

DX.store = (function () {
  var util = DX.util;
  var listeners = {};

  var state = {
    ready: false,
    loading: false,
    lastError: null,
    settings: {},
    serverDate: util.isoToday(),
    timezone: '',
    suppliers: [],
    collections: [],
    advances: [],
    payments: [],
    advanceBalances: {},
    recentDays: [],
    shift: 'Morning',
    shiftIsAuto: true
  };

  function on(event, handler) {
    (listeners[event] || (listeners[event] = [])).push(handler);
    return function () { listeners[event] = listeners[event].filter(function (h) { return h !== handler; }); };
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (h) {
      try { h(payload); } catch (err) { console.error('listener for ' + event, err); }
    });
  }

  function applyShift(shift, isAuto) {
    state.shift = shift;
    state.shiftIsAuto = isAuto !== false;
    document.body.dataset.shift = shift;
    emit('shift', shift);
  }

  function autoShift() {
    applyShift(util.detectShift(state.settings.shift_cutover_hour), true);
  }

  function load() {
    state.loading = true;
    emit('loading', true);
    return DX.api.bootstrap().then(function (data) {
      state.settings = data.settings || {};
      state.serverDate = data.serverDate || util.isoToday();
      state.timezone = data.timezone || '';
      state.suppliers = data.suppliers || [];
      state.collections = data.collections || [];
      state.advances = data.advances || [];
      state.payments = data.payments || [];
      state.advanceBalances = data.advanceBalances || {};
      state.recentDays = data.recentDays || [];
      state.ready = true;
      state.loading = false;
      state.lastError = null;
      if (state.shiftIsAuto) autoShift();
      emit('loading', false);
      emit('data', state);
      return state;
    }, function (err) {
      state.loading = false;
      state.lastError = err;
      emit('loading', false);
      emit('error', err);
      throw err;
    });
  }

  function refresh() {
    return load().catch(function (err) {
      DX.ui.reportError(err);
      return state;
    });
  }

  /* --- derived reads -------------------------------------------------- */

  function activeSuppliers() {
    return state.suppliers.filter(function (s) { return s.status !== 'Inactive'; });
  }

  function supplier(supplierId) {
    return state.suppliers.filter(function (s) { return s.supplierId === supplierId; })[0] || null;
  }

  function balanceFor(supplierId) {
    return Number(state.advanceBalances[supplierId] || 0);
  }

  function collectionsOn(dateIso) {
    return state.collections.filter(function (c) { return c.date === dateIso; });
  }

  function todayTotals() {
    var rows = collectionsOn(state.serverDate);
    return {
      litres: util.sum(rows, 'litres'),
      amount: util.sum(rows, 'amount'),
      entries: rows.length,
      morning: util.sum(rows.filter(function (r) { return r.shift === 'Morning'; }), 'litres'),
      evening: util.sum(rows.filter(function (r) { return r.shift === 'Evening'; }), 'litres'),
      suppliers: rows.reduce(function (set, r) { set[r.supplierId] = 1; return set; }, {})
    };
  }

  function monthTotals() {
    var from = util.monthStart(state.serverDate);
    var rows = state.collections.filter(function (c) { return c.date >= from && c.date <= state.serverDate; });
    return { litres: util.sum(rows, 'litres'), amount: util.sum(rows, 'amount'), entries: rows.length };
  }

  function totalOutstanding() {
    return Object.keys(state.advanceBalances).reduce(function (t, k) {
      return t + Math.max(0, Number(state.advanceBalances[k]) || 0);
    }, 0);
  }

  function currency() { return state.settings.currency || 'INR'; }
  function money(value) { return util.fmtMoney(value, currency()); }
  function defaultRate() { return Number(state.settings.default_rate) || 0; }
  function businessName() { return state.settings.business_name || 'Dakotax Milk Collection'; }

  /** Last n days as a dense series, so a quiet day still shows as a gap. */
  function denseDays(days) {
    var byDate = {};
    state.recentDays.forEach(function (d) { byDate[d.date] = d; });
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var iso = util.addDays(state.serverDate, -i);
      out.push(byDate[iso] || { date: iso, litres: 0, amount: 0, morningLitres: 0, eveningLitres: 0 });
    }
    return out;
  }

  return {
    state: state, on: on, emit: emit, load: load, refresh: refresh,
    applyShift: applyShift, autoShift: autoShift,
    activeSuppliers: activeSuppliers, supplier: supplier, balanceFor: balanceFor,
    collectionsOn: collectionsOn, todayTotals: todayTotals, monthTotals: monthTotals,
    totalOutstanding: totalOutstanding, denseDays: denseDays,
    currency: currency, money: money, defaultRate: defaultRate, businessName: businessName
  };
})();

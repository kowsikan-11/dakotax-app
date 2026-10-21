/* The app's data, and the queue that sends saves to the sheet.
 *
 * How a save works now:
 *   1. The page calls store.save(). The entry is put in a queue (the
 *      "outbox", kept in this phone's storage) and shows on screen at once.
 *   2. The queue sends it to the sheet in the background — several at a time
 *      when they pile up — and retries by itself when the signal drops.
 *   3. When the sheet answers, the saved row (and any new balance) replaces
 *      the temporary one. Nothing has to reload.
 *
 * What pages read is always "the last thing the sheet told us" with the
 * queue laid on top, so an unsent entry is never lost from view and a page
 * never has to wait for the network to draw.
 *
 * The last copy of the data is also kept on the phone, so the app opens
 * straight away and refreshes itself in the background.
 */
window.DX = window.DX || {};

DX.store = (function () {
  var util = DX.util;
  var t = function (s, v) { return DX.i18n.t(s, v); };

  var CACHE_KEY = 'dakotax.cache.v2';
  var OUTBOX_KEY = 'dakotax.outbox.v2';
  var BACKOFF = [2, 4, 8, 15, 30, 60];
  var BATCH_SIZE = 15;
  var STALE_MS = 60 * 1000;
  var AUTO_SYNC_MS = 3 * 60 * 1000;

  var KINDS = {
    collection: { list: 'collections', id: 'entryId', key: 'entry', save: 'collections.save', del: 'collections.delete', party: 'supplierId', partyList: 'suppliers', partyName: 'supplierName' },
    sale: { list: 'sales', id: 'saleId', key: 'sale', save: 'sales.save', del: 'sales.delete', party: 'customerId', partyList: 'customers', partyName: 'customerName' },
    advance: { list: 'advances', id: 'advanceId', key: 'advance', save: 'advances.save', del: 'advances.delete', party: 'supplierId', partyList: 'suppliers', partyName: 'supplierName' },
    payment: { list: 'payments', id: 'paymentId', key: 'payment', save: 'payments.save', del: 'payments.delete', party: 'supplierId', partyList: 'suppliers', partyName: 'supplierName' },
    receipt: { list: 'receipts', id: 'receiptId', key: 'receipt', save: 'receipts.save', del: 'receipts.delete', party: 'customerId', partyList: 'customers', partyName: 'customerName' },
    supplier: { list: 'suppliers', id: 'supplierId', key: 'supplier', save: 'suppliers.save', status: 'suppliers.setStatus', person: true },
    customer: { list: 'customers', id: 'customerId', key: 'customer', save: 'customers.save', status: 'customers.setStatus', person: true }
  };

  var COLLECTION_FIELDS = ['entryId', 'date', 'supplierId', 'supplierName', 'shift', 'litres', 'fat', 'snf', 'ratePerLitre', 'amount', 'note', 'recordedAt'];
  var SALE_FIELDS = ['saleId', 'date', 'customerId', 'customerName', 'shift', 'litres', 'ratePerLitre', 'amount', 'note', 'recordedAt'];
  var SUPPLIER_FIELDS = ['supplierId', 'name', 'mobile', 'village', 'ratePerLitre', 'status', 'createdAt'];
  var CUSTOMER_FIELDS = ['customerId', 'name', 'mobile', 'address', 'ratePerLitre', 'status', 'createdAt'];

  var listeners = {};
  var server = emptyServer();
  var view = emptyServer();
  var outbox = { items: [], idMap: {} };
  var recentConfirms = [];
  var needsSync = false;
  var batchBroken = false;
  var pumpTimer = null;
  var syncPromise = null;
  var unsavedConfirms = [];  // confirmed by the sheet but not yet in the quick-start copy on the phone
  var peopleRev = 0;        // goes up whenever the sheet's lists of people change
  var peopleMemo = null;    // the last people lists built, reused while nothing about people changed

  var meta = {
    ready: false,
    fromCache: false,
    syncing: false,
    lastSync: 0,
    syncError: null,
    sending: false,
    sendError: null
  };

  var round = { date: util.localToday(), shift: 'Morning', auto: true };

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  function on(event, handler) {
    (listeners[event] || (listeners[event] = [])).push(handler);
    return function off() {
      listeners[event] = (listeners[event] || []).filter(function (h) { return h !== handler; });
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).slice().forEach(function (h) {
      try { h(payload); } catch (err) { if (window.console) console.error('listener for ' + event, err); }
    });
  }

  /* ------------------------------------------------------------------ *
   * Shapes
   * ------------------------------------------------------------------ */

  function emptyServer() {
    return {
      version: '', settings: {}, serverDate: '', timezone: '', windowFrom: '',
      windows: { collection: '', sale: '' },
      daily: { collection: {}, sale: {} },
      monthParties: { collection: {}, sale: {} },
      monthOf: '', space: null,
      suppliers: [], customers: [], collections: [], sales: [],
      advances: [], payments: [], receipts: [],
      advanceBalances: {}, customerBalances: {},
      loadedDays: { collection: {}, sale: {} }
    };
  }

  function pack(rows, fields) {
    return { fields: fields, rows: rows.map(function (r) { return fields.map(function (f) { return r[f] === undefined ? null : r[f]; }); }) };
  }

  function unpack(p) {
    if (!p || !p.fields || !p.rows) return [];
    return p.rows.map(function (row) {
      var o = {};
      for (var i = 0; i < p.fields.length; i++) o[p.fields[i]] = row[i];
      return o;
    });
  }

  /** The first version of the script sent "the latest 400 rows" instead of whole days. */
  function legacyWindow(collections, sales) {
    function from(rows) {
      if (rows.length < 400) return '';
      var oldest = rows.reduce(function (m, r) { return r.date && r.date < m ? r.date : m; }, '9999-12-31');
      return util.addDays(oldest, 1);
    }
    var a = from(collections), b = from(sales);
    return a > b ? a : b;
  }

  function normalize(data) {
    peopleRev++;
    var s = emptyServer();
    s.version = data.version || '1';
    s.settings = data.settings || {};
    s.serverDate = data.serverDate || '';
    s.timezone = data.timezone || '';
    s.suppliers = data.packed && data.packed.suppliers ? unpack(data.packed.suppliers) : (data.suppliers || []).slice();
    s.customers = data.packed && data.packed.customers ? unpack(data.packed.customers) : (data.customers || []).slice();
    s.collections = data.packed ? unpack(data.packed.collections) : (data.collections || []).slice();
    s.sales = data.packed ? unpack(data.packed.sales) : (data.sales || []).slice();
    s.advances = (data.advances || []).slice();
    s.payments = (data.payments || []).slice();
    s.receipts = (data.receipts || []).slice();
    s.advanceBalances = Object.assign({}, data.advanceBalances || {});
    s.customerBalances = Object.assign({}, data.customerBalances || {});
    s.windowFrom = data.windowFrom !== undefined ? data.windowFrom : legacyWindow(s.collections, s.sales);
    // A big centre gets today's rows plus totals for the older days of the month.
    s.windows = data.windows ? { collection: data.windows.collection || '', sale: data.windows.sale || '' } : { collection: s.windowFrom, sale: s.windowFrom };
    if (data.daily) s.daily = { collection: data.daily.collection || {}, sale: data.daily.sale || {} };
    if (data.monthParties) s.monthParties = { collection: data.monthParties.collection || {}, sale: data.monthParties.sale || {} };
    s.monthOf = data.monthOf || (s.serverDate ? s.serverDate.slice(0, 7) : '');
    if (data.loadedDays) s.loadedDays = data.loadedDays;
    if (data.space && data.space.limit) s.space = { cells: Number(data.space.cells) || 0, limit: Number(data.space.limit), countedAt: data.space.countedAt || '' };
    return s;
  }

  function isV2() { return Number(String(server.version || '1').split('.')[0]) >= 2; }

  /* ------------------------------------------------------------------ *
   * Phone storage: last data from the sheet, and the outbox
   * ------------------------------------------------------------------ */

  function saveCacheNow() {
    if (!meta.ready) return;
    var snapshot = {};
    Object.keys(server).forEach(function (k) {
      if (k !== 'collections' && k !== 'sales' && k !== 'suppliers' && k !== 'customers') snapshot[k] = server[k];
    });
    snapshot.packed = {
      collections: pack(server.collections, COLLECTION_FIELDS), sales: pack(server.sales, SALE_FIELDS),
      suppliers: pack(server.suppliers, SUPPLIER_FIELDS), customers: pack(server.customers, CUSTOMER_FIELDS)
    };
    var body = JSON.stringify({ v: 2, url: DX.config.get(), savedAt: Date.now(), lastSync: meta.lastSync, server: snapshot });
    if (!util.storageSet(CACHE_KEY, body)) { util.storageRemove(CACHE_KEY); return; }
    // The copy now holds every confirmed change, so the list kept beside the outbox can go.
    if (unsavedConfirms.length) { unsavedConfirms = []; saveOutbox(); }
  }
  /* The copy kept for a quick start is big at a busy centre, so it is written
   * when the phone is idle (and at once when the app is put away), not after
   * every save. Unsent entries have their own small store, written at once. */
  var cacheTimer = null;
  var cacheDirty = false;
  function saveCache() {
    cacheDirty = true;
    if (cacheTimer) return;
    cacheTimer = setTimeout(function () {
      cacheTimer = null;
      var run = function () { if (cacheDirty) { cacheDirty = false; saveCacheNow(); } };
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 5000 }); else run();
    }, 4000);
  }
  function flushCache() {
    if (!cacheDirty) return;
    clearTimeout(cacheTimer);
    cacheTimer = null;
    cacheDirty = false;
    saveCacheNow();
  }

  function loadCache() {
    var raw = util.storageGet(CACHE_KEY);
    if (!raw) return false;
    var data = null;
    try { data = JSON.parse(raw); } catch (err) { data = null; }
    if (!data || data.v !== 2 || !data.server || data.url !== DX.config.get()) return false;
    server = normalize(data.server);
    meta.lastSync = data.lastSync || data.savedAt || 0;
    meta.ready = true;
    meta.fromCache = true;
    return true;
  }

  function loadOutbox() {
    var raw = util.storageGet(OUTBOX_KEY);
    var data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (err) { data = null; }
    var box = { items: [], idMap: {} };
    if (data && Array.isArray(data.items)) {
      box.items = data.items.filter(function (i) { return i && KINDS[i.kind] && i.qid; });
      box.idMap = data.idMap || {};
    }
    unsavedConfirms = data && Array.isArray(data.confirmed) ? data.confirmed.filter(function (c) { return c && c.item && KINDS[c.item.kind] && c.data; }) : [];
    // Anything that was on its way when the page closed is simply sent again;
    // its requestId makes sure the sheet does not save it twice.
    box.items.forEach(function (i) { if (i.status === 'sending') i.status = 'queued'; i.nextAt = 0; });
    return box;
  }

  function saveOutbox() {
    var keys = Object.keys(outbox.idMap);
    if (keys.length > 400) keys.slice(0, keys.length - 300).forEach(function (k) { delete outbox.idMap[k]; });
    if (unsavedConfirms.length > 300) unsavedConfirms = unsavedConfirms.slice(-300);
    var body = JSON.stringify({ items: outbox.items, idMap: outbox.idMap, confirmed: unsavedConfirms });
    if (!util.storageSet(OUTBOX_KEY, body)) {
      // Phone storage is full. Unsent entries matter more than the copy of the
      // sheet kept for quick start-up, so drop that copy and try again.
      util.storageRemove(CACHE_KEY);
      util.storageSet(OUTBOX_KEY, body);
    }
  }

  /* ------------------------------------------------------------------ *
   * List helpers
   * ------------------------------------------------------------------ */

  function same(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }

  function indexOf(list, idKey, id) {
    for (var i = 0; i < list.length; i++) if (list[i][idKey] === id) return i;
    return -1;
  }

  function findPerson(list, idKey, id) {
    for (var i = 0; i < list.length; i++) if (same(list[i][idKey], id)) return list[i];
    return null;
  }

  function upsert(list, idKey, rec) {
    var i = indexOf(list, idKey, rec[idKey]);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
  }

  function removeById(list, idKey, id) {
    var i = indexOf(list, idKey, id);
    if (i >= 0) list.splice(i, 1);
  }

  function strip(rec) {
    if (!rec) return null;
    var out = {};
    Object.keys(rec).forEach(function (k) { if (k[0] !== '_') out[k] = rec[k]; });
    return out;
  }

  function isTmp(ref) { return /^tmp-/.test(String(ref || '')); }
  function resolveId(ref) { return outbox.idMap[ref] || ref; }

  function stamp(ms) {
    var d = new Date(ms || Date.now());
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    off = Math.abs(off);
    return util.toIso(d) + 'T' + util.pad(d.getHours()) + ':' + util.pad(d.getMinutes()) + ':' + util.pad(d.getSeconds()) +
      sign + util.pad(Math.floor(off / 60)) + ':' + util.pad(off % 60);
  }

  /* ------------------------------------------------------------------ *
   * Balances move with each change
   * ------------------------------------------------------------------ */

  function addTo(map, key, amount) {
    if (!key || !amount) return;
    map[key] = util.round((Number(map[key]) || 0) + amount, 2);
  }

  function applyDelta(target, kind, rec, sign, item) {
    if (!rec) return;
    var amount = Number(rec.amount) || 0;
    if (kind === 'advance') addTo(target.advanceBalances, rec.supplierId, sign * (rec.type === 'Given' ? amount : -amount));
    else if (kind === 'sale') addTo(target.customerBalances, rec.customerId, sign * amount);
    else if (kind === 'receipt') addTo(target.customerBalances, rec.customerId, -sign * amount);
    else if (kind === 'payment' && item && item.isNew && sign > 0) addTo(target.advanceBalances, rec.supplierId, -(Number(rec.advanceRecovered) || 0));
  }

  /* ------------------------------------------------------------------ *
   * What pages see: the sheet's data with the queue laid on top
   * ------------------------------------------------------------------ */

  function materialize(v, item, id, existing) {
    var spec = KINDS[item.kind];
    var d = item.data || {};
    var rec = Object.assign({}, existing || {}, d);
    rec[spec.id] = id;
    if (spec.person) {
      rec.status = rec.status || 'Active';
    } else {
      var party = findPerson(v[spec.partyList], spec.party, d[spec.party]);
      rec[spec.party] = party ? party[spec.party] : d[spec.party];
      rec[spec.partyName] = party ? party.name : ((existing && existing[spec.partyName]) || d[spec.party]);
      if (item.kind === 'collection' || item.kind === 'sale') {
        rec.litres = Number(d.litres) || 0;
        rec.ratePerLitre = Number(d.ratePerLitre) || 0;
        rec.amount = util.round(rec.litres * rec.ratePerLitre, 2);
      }
      if (item.kind === 'collection') {
        rec.fat = d.fat === '' || d.fat === null || d.fat === undefined ? null : Number(d.fat);
        rec.snf = d.snf === '' || d.snf === null || d.snf === undefined ? null : Number(d.snf);
      }
      if (item.kind === 'advance' || item.kind === 'receipt') rec.amount = Number(d.amount) || 0;
      if (item.kind === 'payment') {
        rec.milkAmount = Number(d.milkAmount) || 0;
        rec.advanceRecovered = Number(d.advanceRecovered) || 0;
        rec.netAmount = util.round(rec.milkAmount - rec.advanceRecovered, 2);
      }
      if (item.isNew || !rec.recordedAt) rec.recordedAt = stamp(item.at);
    }
    rec._pending = item.status !== 'failed';
    rec._failed = item.status === 'failed';
    rec._error = item.error || null;
    rec._qid = item.qid;
    rec._new = !!item.isNew;
    return rec;
  }

  function overlay(v, item) {
    var spec = KINDS[item.kind];
    var list = v[spec.list];
    var id = resolveId(item.ref);
    var idx = spec.person ? indexOfPerson(list, spec.id, id) : indexOf(list, spec.id, id);
    var failed = item.status === 'failed';

    if (item.op === 'delete') {
      if (idx < 0) {
        if (!failed && item.prev) applyDelta(v, item.kind, item.prev, -1, item);
        return;
      }
      var gone = list[idx];
      if (failed) {
        list[idx] = Object.assign({}, gone, { _failed: true, _error: item.error, _qid: item.qid, _op: 'delete' });
        return;
      }
      list.splice(idx, 1);
      applyDelta(v, item.kind, gone, -1, item);
      return;
    }

    if (item.op === 'status') {
      if (idx < 0) return;
      list[idx] = Object.assign({}, list[idx], {
        status: item.data.status, _pending: !failed, _failed: failed, _error: item.error, _qid: item.qid
      });
      return;
    }

    var before = idx >= 0 ? list[idx] : null;
    var rec = materialize(v, item, spec.person ? (before ? before[spec.id] : id) : id, before);
    if (!failed) {
      if (before) applyDelta(v, item.kind, before, -1, item);
      else if (!item.isNew && item.prev) applyDelta(v, item.kind, item.prev, -1, item);
      applyDelta(v, item.kind, rec, +1, item);
    }
    if (idx >= 0) list[idx] = rec; else list.unshift(rec);
  }

  function indexOfPerson(list, idKey, id) {
    for (var i = 0; i < list.length; i++) if (same(list[i][idKey], id)) return i;
    return -1;
  }

  function indexPeople(list, idKey) {
    var idx = {};
    for (var i = 0; i < list.length; i++) idx[String(list[i][idKey] || '').toLowerCase()] = list[i];
    return idx;
  }

  function rebuild() {
    // Thousands of people: keep the same lists (and their search index) while
    // no change to a person is waiting and the sheet's lists are unchanged.
    var personWaiting = outbox.items.some(function (it) { return KINDS[it.kind].person; });
    var memo = !personWaiting && peopleMemo && peopleMemo.rev === peopleRev &&
      peopleMemo.srcS === server.suppliers && peopleMemo.srcC === server.customers ? peopleMemo : null;
    var v = {
      version: server.version, settings: server.settings, serverDate: server.serverDate,
      timezone: server.timezone, windowFrom: server.windowFrom, loadedDays: server.loadedDays,
      windows: server.windows, daily: server.daily, monthParties: server.monthParties, monthOf: server.monthOf, space: server.space,
      suppliers: memo ? memo.suppliers : server.suppliers.slice(), customers: memo ? memo.customers : server.customers.slice(),
      collections: server.collections.slice(), sales: server.sales.slice(),
      advances: server.advances.slice(), payments: server.payments.slice(), receipts: server.receipts.slice(),
      advanceBalances: Object.assign({}, server.advanceBalances),
      customerBalances: Object.assign({}, server.customerBalances)
    };
    outbox.items.forEach(function (item) {
      try { overlay(v, item); } catch (err) { if (window.console) console.error('overlay', err, item); }
    });
    v.index = memo ? memo.index : { supplier: indexPeople(v.suppliers, 'supplierId'), customer: indexPeople(v.customers, 'customerId') };
    peopleMemo = personWaiting ? null : {
      rev: peopleRev, srcS: server.suppliers, srcC: server.customers,
      suppliers: v.suppliers, customers: v.customers, index: v.index
    };
    view = v;
    emit('change', view);
  }

  /* ------------------------------------------------------------------ *
   * Saving: pages call these. They return at once.
   * ------------------------------------------------------------------ */

  function newItem(kind, op, ref, data, prev, isNew) {
    return {
      qid: util.uid('q'),
      requestId: util.uid('r'),
      kind: kind, op: op, ref: ref, isNew: !!isNew,
      data: data || null, prev: prev || null,
      status: 'queued', error: null, tries: 0, at: Date.now(), nextAt: 0
    };
  }

  /** A queued change that has never left the phone, or that the sheet refused, can be rewritten. */
  function mergeable(kind, ref, op) {
    for (var i = outbox.items.length - 1; i >= 0; i--) {
      var it = outbox.items[i];
      if (it.kind !== kind || !same(it.ref, ref)) continue;
      if (op && it.op !== op) return null;
      if (it.status === 'failed' || (it.status === 'queued' && !it.tries)) return it;
      return null;
    }
    return null;
  }

  /**
   * save('collection', {date, supplierId, shift, litres, ratePerLitre, fat, snf, note}, existing)
   * existing is the row being edited (as the page got it from the store), or null for new.
   */
  function save(kind, data, existing) {
    var spec = KINDS[kind];
    var clean = Object.assign({}, data);
    delete clean[spec.id];
    var ref;
    if (spec.person) ref = existing ? existing[spec.id] : data[spec.id];
    else ref = existing ? existing[spec.id] : util.uid('tmp');

    var item = existing ? mergeable(kind, ref, 'save') : null;
    if (item) {
      item.data = spec.person ? Object.assign({}, data) : clean;
      if (item.isNew && spec.person) item.ref = data[spec.id];
      if (item.status === 'failed') item.requestId = util.uid('r');
      item.status = 'queued'; item.error = null; item.tries = 0; item.nextAt = 0;
    } else {
      item = newItem(kind, 'save', ref, spec.person ? Object.assign({}, data) : clean, existing ? strip(existing) : null, !existing);
      outbox.items.push(item);
    }
    saveOutbox();
    rebuild();
    pump();
    return item;
  }

  function remove(kind, record) {
    var spec = KINDS[kind];
    var ref = record[spec.id];
    var create = null;
    outbox.items.forEach(function (it) { if (it.kind === kind && it.ref === ref && it.isNew) create = it; });
    if (create && (create.status === 'failed' || (create.status === 'queued' && !create.tries))) {
      // Never left the phone: forget it and everything queued after it.
      outbox.items = outbox.items.filter(function (it) { return !(it.kind === kind && it.ref === ref); });
    } else {
      outbox.items = outbox.items.filter(function (it) {
        return !(it.kind === kind && it.ref === ref && it.op === 'save' && !it.isNew &&
          (it.status === 'failed' || (it.status === 'queued' && !it.tries)));
      });
      var original = findPerson(server[spec.list], spec.id, resolveId(ref)) || record;
      outbox.items.push(newItem(kind, 'delete', ref, null, strip(original), false));
    }
    saveOutbox();
    rebuild();
    pump();
  }

  function setStatus(kind, person, status) {
    var spec = KINDS[kind];
    var ref = person[spec.id];
    var item = mergeable(kind, ref, 'status');
    if (item) {
      item.data = { status: status };
      if (item.status === 'failed') item.requestId = util.uid('r');
      item.status = 'queued'; item.error = null; item.tries = 0;
    } else {
      outbox.items.push(newItem(kind, 'status', ref, { status: status }, strip(person), false));
    }
    saveOutbox();
    rebuild();
    pump();
  }

  /** Forget a change the sheet refused. */
  function discard(qid) {
    var item = itemById(qid);
    if (!item) return;
    outbox.items = outbox.items.filter(function (it) {
      if (it === item) return false;
      // An unsaved new row takes its later edits with it.
      return !(item.isNew && it.kind === item.kind && it.ref === item.ref);
    });
    saveOutbox();
    rebuild();
  }

  function retry(qid) {
    var item = itemById(qid);
    if (!item || item.status !== 'failed') return;
    item.status = 'queued'; item.error = null; item.tries = 0; item.nextAt = 0; item.requestId = util.uid('r');
    saveOutbox();
    rebuild();
    pump();
  }

  function itemById(qid) {
    for (var i = 0; i < outbox.items.length; i++) if (outbox.items[i].qid === qid) return outbox.items[i];
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Sending
   * ------------------------------------------------------------------ */

  function backoff(tries) { return BACKOFF[Math.min(Math.max(tries, 1), BACKOFF.length) - 1] * 1000; }

  function buildRequest(item) {
    var spec = KINDS[item.kind];
    var payload = { requestId: item.requestId };
    if (item.op === 'delete') {
      payload[spec.id] = resolveId(item.ref);
      return { action: spec.del, payload: payload };
    }
    if (item.op === 'status') {
      payload[spec.id] = item.ref;
      payload.status = item.data.status;
      return { action: spec.status, payload: payload };
    }
    var rec = Object.assign({}, item.data);
    if (spec.person) rec.mode = item.isNew ? 'create' : 'update';
    else if (!item.isNew) rec[spec.id] = resolveId(item.ref);
    payload[spec.key] = rec;
    return { action: spec.save, payload: payload };
  }

  function nextBatch() {
    var items = [];
    var now = Date.now();
    var creating = {};
    for (var i = 0; i < outbox.items.length; i++) {
      var it = outbox.items[i];
      if (it.status === 'failed') continue;
      if (it.status === 'sending') return { items: [] };
      if ((it.nextAt || 0) > now) return { items: items, wakeAt: items.length ? 0 : it.nextAt };
      // A change to a row we have not heard back about yet has to wait for it.
      if (!it.isNew && isTmp(it.ref) && !outbox.idMap[it.ref]) {
        if (creating[it.ref] || items.length) break;
        var parentWaiting = outbox.items.some(function (p) { return p.isNew && p.ref === it.ref && p.status !== 'failed'; });
        if (parentWaiting) break;
        it.status = 'failed';
        it.error = { code: 'ORPHAN', message: t('The entry this change belongs to was not saved.') };
        continue;
      }
      if (it.isNew) creating[it.ref] = true;
      items.push(it);
      if (!canBatch() || items.length >= BATCH_SIZE) break;
    }
    return { items: items };
  }

  function canBatch() { return isV2() && !batchBroken; }

  function pump() {
    clearTimeout(pumpTimer);
    pumpTimer = null;
    if (meta.sending || !DX.config.get()) return;
    var next = nextBatch();
    if (!next.items.length) {
      if (next.wakeAt) pumpTimer = setTimeout(pump, Math.max(next.wakeAt - Date.now(), 300));
      emit('status', status());
      return;
    }
    meta.sending = true;
    next.items.forEach(function (i) { i.status = 'sending'; i.tries = (i.tries || 0) + 1; });
    saveOutbox();
    emit('status', status());

    var sending = next.items.length > 1 ? sendBatch(next.items) : sendOne(next.items[0]);
    sending.then(function () {
      meta.sendError = null;
    }, function (err) {
      meta.sendError = err || { transport: true };
      next.items.forEach(function (i) {
        if (i.status === 'sending') { i.status = 'queued'; i.nextAt = Date.now() + backoff(i.tries); }
      });
    }).then(function () {
      meta.sending = false;
      saveOutbox();
      saveCache();
      if (document.visibilityState === 'hidden') flushCache();
      rebuild();
      emit('status', status());
      if (needsSync && !pendingCount()) { needsSync = false; sync('after-save'); }
      pump();
    });
  }

  function sendOne(item) {
    var req = buildRequest(item);
    return DX.api.call(req.action, req.payload, { timeout: 45000 }).then(function (data) {
      settle(item, true, data);
    }, function (err) {
      if (!err || err.transport) throw err;
      if (needsCheck(item, err)) {
        return findOnSheet(item).then(function (rec) {
          if (rec) { var found = {}; found[KINDS[item.kind].key] = rec; settle(item, true, found); }
          else settle(item, false, null, err);
        }, function () { settle(item, false, null, err); });
      }
      settle(item, false, null, err);
    });
  }

  /**
   * The first-version script cannot recognise a repeated save, so a save whose
   * answer was lost comes back as "already recorded". Look on the sheet: if the
   * very same entry is there, it is ours and it is saved.
   */
  function needsCheck(item, err) {
    return err.code === 'DUPLICATE' && item.op === 'save' && item.isNew &&
      (item.kind === 'collection' || item.kind === 'sale') && !(err.details && err.details.existing);
  }

  function findOnSheet(item) {
    var spec = KINDS[item.kind];
    var d = item.data;
    var filter = { from: d.date, to: d.date, shift: d.shift };
    filter[spec.party] = d[spec.party];
    return DX.api.call(item.kind === 'collection' ? 'collections.list' : 'sales.list', { filter: filter }, { timeout: 30000 }).then(function (data) {
      var list = data[spec.list] || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (same(r[spec.party], d[spec.party]) && r.date === d.date && same(r.shift, d.shift) &&
            Math.abs((Number(r.litres) || 0) - (Number(d.litres) || 0)) < 0.001) return r;
      }
      return null;
    });
  }

  function sendBatch(items) {
    var requests = items.map(buildRequest);
    return DX.api.call('batch', { requests: requests }, { timeout: 60000 }).then(function (data) {
      var results = (data && data.results) || [];
      items.forEach(function (item, i) {
        var r = results[i];
        if (!r) { item.status = 'queued'; item.nextAt = Date.now() + 2000; return; }
        if (r.ok) settle(item, true, r.data || {});
        else settle(item, false, null, DX.api.apiError(r));
      });
    }, function (err) {
      if (!err || err.transport) throw err;
      if (err.code === 'UNKNOWN_ACTION') {
        // Script older than the app: send one at a time instead.
        batchBroken = true;
        items.forEach(function (i) { i.status = 'queued'; i.tries = Math.max(0, i.tries - 1); i.nextAt = 0; });
        return;
      }
      if (err.code === 'BUSY' || err.code === 'SERVER_ERROR') { err.transport = true; throw err; }
      items.forEach(function (i) { settle(i, false, null, err); });
    });
  }

  function sameAsExisting(item, details) {
    var spec = KINDS[item.kind];
    var ex = details && details.existing;
    if (!ex || !item.data) return false;
    return same(ex[spec.party], item.data[spec.party]) && ex.date === item.data.date &&
      same(ex.shift, item.data.shift) && Math.abs((Number(ex.litres) || 0) - (Number(item.data.litres) || 0)) < 0.001;
  }

  function settle(item, success, data, err) {
    var spec = KINDS[item.kind];
    if (success) {
      confirm(item, data || {});
      dropItem(item);
      if (data && data.warning) emit('warning', { item: item, message: data.warning });
      return;
    }
    var code = (err && err.code) || 'SERVER_ERROR';
    if (item.op === 'delete' && code === 'NOT_FOUND') { confirm(item, {}); dropItem(item); return; }
    // Our own earlier attempt got through but its answer was lost on the way back.
    if (code === 'DUPLICATE' && item.op === 'save' && item.isNew && item.tries > 1 && sameAsExisting(item, err.details)) {
      var fake = {}; fake[spec.key] = err.details.existing;
      confirm(item, fake);
      dropItem(item);
      return;
    }
    if (code === 'BUSY' || (code === 'SERVER_ERROR' && item.tries < 3)) {
      item.status = 'queued';
      item.nextAt = Date.now() + backoff(item.tries);
      return;
    }
    item.status = 'failed';
    item.error = { code: code, message: (err && err.message) || t('Not saved'), field: (err && err.field) || null };
    emit('failed', item);
  }

  function dropItem(item) {
    outbox.items = outbox.items.filter(function (it) { return it !== item; });
  }

  function confirm(item, data) {
    var spec = KINDS[item.kind];
    var list = server[spec.list];
    var before = null;
    if (spec.person) peopleRev++;
    if (item.op === 'save') {
      var rec = data[spec.key];
      if (rec) {
        var realId = rec[spec.id];
        if (item.isNew && !spec.person && item.ref !== realId) outbox.idMap[item.ref] = realId;
        before = spec.person ? findPerson(list, spec.id, realId) : (list[indexOf(list, spec.id, realId)] || null);
        if (spec.person) {
          var pi = indexOfPerson(list, spec.id, realId);
          if (pi >= 0) list[pi] = rec; else list.push(rec);
        } else {
          upsert(list, spec.id, rec);
        }
      }
      if (item.kind === 'payment' && data.advance) upsert(server.advances, 'advanceId', data.advance);
    } else if (item.op === 'delete') {
      var id = resolveId(item.ref);
      before = list[indexOf(list, spec.id, id)] || item.prev;
      removeById(list, spec.id, id);
    } else if (item.op === 'status') {
      var person = data[spec.key];
      var idx = indexOfPerson(list, spec.id, item.ref);
      if (person) { if (idx >= 0) list[idx] = person; else list.push(person); }
      else if (idx >= 0) list[idx] = Object.assign({}, list[idx], { status: data.status || item.data.status });
    }
    applyServerBalances(item, data, before);
    var done = { at: Date.now(), item: { kind: item.kind, op: item.op, ref: item.ref, data: item.op === 'status' ? item.data : null }, data: data };
    recentConfirms.push(done);
    unsavedConfirms.push(done);
  }

  function applyServerBalances(item, data, before) {
    var kind = item.kind;
    if (data.balances) {
      Object.keys(data.balances).forEach(function (k) { server.customerBalances[k] = Number(data.balances[k]) || 0; });
    }
    if (typeof data.balance === 'number') {
      if (data.supplierId && (kind === 'advance' || kind === 'payment')) server.advanceBalances[data.supplierId] = data.balance;
      if (data.customerId && (kind === 'sale' || kind === 'receipt')) server.customerBalances[data.customerId] = data.balance;
      return;
    }
    if (isV2() || data.balances) return;
    // First-version script: no balance in its answer, so move it ourselves and
    // ask for fresh numbers once the queue is empty.
    if (kind !== 'advance' && kind !== 'sale' && kind !== 'receipt' && kind !== 'payment') return;
    if (item.op === 'save') {
      if (before) applyDelta(server, kind, before, -1, item);
      else if (!item.isNew && item.prev) applyDelta(server, kind, item.prev, -1, item);
      applyDelta(server, kind, data[KINDS[kind].key], +1, item);
    } else if (item.op === 'delete') {
      applyDelta(server, kind, before, -1, item);
    }
    needsSync = true;
  }

  /** Lays one change the sheet has confirmed onto the data. Doing it twice changes nothing. */
  function applyConfirm(c) {
    var spec = KINDS[c.item.kind];
    var list = server[spec.list];
    if (spec.person) peopleRev++;
    if (c.item.op === 'save' && c.data[spec.key]) {
      if (spec.person) {
        var pi = indexOfPerson(list, spec.id, c.data[spec.key][spec.id]);
        if (pi >= 0) list[pi] = c.data[spec.key]; else list.push(c.data[spec.key]);
      } else {
        upsert(list, spec.id, c.data[spec.key]);
      }
      if (c.item.kind === 'payment' && c.data.advance) upsert(server.advances, 'advanceId', c.data.advance);
    } else if (c.item.op === 'delete') {
      removeById(list, spec.id, resolveId(c.item.ref));
    } else if (c.item.op === 'status') {
      var idx = indexOfPerson(list, spec.id, c.item.ref);
      var person = c.data[spec.key];
      if (person) { if (idx >= 0) list[idx] = person; else list.push(person); }
      else if (idx >= 0) list[idx] = Object.assign({}, list[idx], { status: c.data.status || (c.item.data && c.item.data.status) || list[idx].status });
    }
    if (c.data.balances) Object.keys(c.data.balances).forEach(function (k) { server.customerBalances[k] = c.data.balances[k]; });
    if (typeof c.data.balance === 'number') {
      if (c.data.supplierId && (c.item.kind === 'advance' || c.item.kind === 'payment')) server.advanceBalances[c.data.supplierId] = c.data.balance;
      if (c.data.customerId && (c.item.kind === 'sale' || c.item.kind === 'receipt')) server.customerBalances[c.data.customerId] = c.data.balance;
    }
  }

  /** A refresh that started before a save finished may not include it; lay it back on. */
  function replayConfirms(since) {
    recentConfirms = recentConfirms.filter(function (c) { return Date.now() - c.at < 5 * 60 * 1000; });
    recentConfirms.forEach(function (c) { if (c.at >= since) applyConfirm(c); });
  }

  /** Try everything waiting right now — called when the signal comes back. */
  function kick() {
    outbox.items.forEach(function (i) { if (i.status === 'queued') i.nextAt = 0; });
    pump();
  }

  /* ------------------------------------------------------------------ *
   * Reading from the sheet
   * ------------------------------------------------------------------ */

  /** Fetches everything fresh. Never rejects; resolves true or false. */
  function sync() {
    if (syncPromise) return syncPromise;
    if (!DX.config.get()) return Promise.resolve(false);
    var startedAt = Date.now();
    meta.syncing = true;
    emit('status', status());
    syncPromise = DX.api.call('bootstrap', { client: 2 }, { timeout: 45000 }).then(function (data) {
      server = normalize(data);
      replayConfirms(startedAt);
      meta.ready = true;
      meta.fromCache = false;
      meta.lastSync = Date.now();
      meta.syncError = null;
      saveCache();
      checkRound();
      rebuild();
      emit('synced', view);
      return true;
    }, function (err) {
      meta.syncError = err;
      emit('syncFailed', err);
      return false;
    }).then(function (result) {
      syncPromise = null;
      meta.syncing = false;
      emit('status', status());
      if (result) pump();
      return result;
    });
    return syncPromise;
  }

  function isStale(ms) { return !meta.lastSync || Date.now() - meta.lastSync > (ms || STALE_MS); }

  function syncIfStale(ms) {
    if (meta.syncing || !isStale(ms)) return Promise.resolve(false);
    return sync();
  }

  /** Is every row for this date on the phone? Older days are fetched on request. */
  function windowOf(kind) {
    var w = server.windows && server.windows[kind];
    return w === undefined ? server.windowFrom : w;
  }

  function isComplete(kind, date) {
    var from = windowOf(kind);
    if (!from || date >= from) return true;
    return !!(server.loadedDays[kind] && server.loadedDays[kind][date]);
  }

  /** The sheet's totals for an older day whose rows were not sent: [litres, amount, entries, morning, evening]. */
  function dailyOf(kind, date) {
    var d = server.daily && server.daily[kind];
    return d && d[date] ? d[date] : null;
  }

  function ensureDay(kind, date) {
    if (isComplete(kind, date)) return Promise.resolve(true);
    var spec = KINDS[kind];
    var action = kind === 'collection' ? 'collections.list' : 'sales.list';
    return DX.api.call(action, { filter: { from: date, to: date } }, { timeout: 30000 }).then(function (data) {
      (data[spec.list] || []).forEach(function (r) { upsert(server[spec.list], spec.id, r); });
      if (!server.loadedDays[kind]) server.loadedDays[kind] = {};
      server.loadedDays[kind][date] = true;
      rebuild();
      return true;
    }, function () { return false; });
  }

  /** Settings are saved straight to the sheet: they are rare and every phone needs them. */
  function saveSettings(values) {
    return DX.api.call('settings.save', { settings: values }, { timeout: 45000 }).then(function (data) {
      server.settings = data.settings || server.settings;
      saveCacheNow();
      checkRound();
      rebuild();
      return server.settings;
    });
  }

  /* ------------------------------------------------------------------ *
   * The round being recorded: date + Morning/Evening
   * ------------------------------------------------------------------ */

  function autoShift() { return util.detectShift(server.settings.shift_cutover_hour); }

  function setRound(date, shift) {
    round = { date: date, shift: shift, auto: date === util.localToday() && shift === autoShift() };
    emit('round', round);
  }

  function resetRound() {
    round = { date: util.localToday(), shift: autoShift(), auto: true };
    emit('round', round);
  }

  function checkRound() {
    var today = util.localToday();
    var shift = autoShift();
    if (round.auto && (round.date !== today || round.shift !== shift)) {
      round = { date: today, shift: shift, auto: true };
      emit('round', round);
    } else if (!round.auto && round.date === today && round.shift === shift) {
      round.auto = true;
      emit('round', round);
    }
  }

  /* ------------------------------------------------------------------ *
   * Reads for pages
   * ------------------------------------------------------------------ */

  function data() { return view; }
  function spec(kind) { return KINDS[kind]; }
  function rows(kind) { return view[KINDS[kind].list]; }

  function people(kind) { return kind === 'customer' ? view.customers : view.suppliers; }
  function person(kind, id) {
    if (!id) return null;
    var idx = view.index && view.index[kind === 'customer' ? 'customer' : 'supplier'];
    if (idx) return idx[String(id).toLowerCase()] || null;
    return findPerson(people(kind), kind === 'customer' ? 'customerId' : 'supplierId', id);
  }
  function activePeople(kind) { return people(kind).filter(function (p) { return p.status !== 'Inactive'; }); }

  function rowsOn(kind, date, shift) {
    return rows(kind).filter(function (r) { return r.date === date && (!shift || r.shift === shift); });
  }

  /** An entry already on this date + round for this person (ignoring one being edited). */
  function findDuplicate(kind, date, partyId, shift, exceptId) {
    var s = KINDS[kind];
    var list = rows(kind);
    var except = exceptId ? resolveId(exceptId) : null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r._failed || (except && (r[s.id] === except || r[s.id] === exceptId))) continue;
      if (r.date === date && same(r.shift, shift) && same(r[s.party], partyId)) return r;
    }
    return null;
  }

  function totalsOf(list, partyKey) {
    var out = { litres: 0, amount: 0, entries: 0, morning: 0, evening: 0, parties: {} };
    list.forEach(function (r) {
      if (r._failed) return;
      out.litres += Number(r.litres) || 0;
      out.amount += Number(r.amount) || 0;
      out.entries++;
      if (r.shift === 'Morning') out.morning += Number(r.litres) || 0; else out.evening += Number(r.litres) || 0;
      out.parties[r[partyKey]] = 1;
    });
    out.partyCount = Object.keys(out.parties).length;
    return out;
  }

  /** One day of one kind: counted from the rows when they are all here, otherwise the sheet's totals. */
  function kindDay(kind, date) {
    var agg = isComplete(kind, date) ? null : dailyOf(kind, date);
    if (agg) return { litres: agg[0], amount: agg[1], entries: agg[2], morning: agg[3], evening: agg[4], parties: {}, partyCount: null, fromTotals: true };
    return totalsOf(rowsOn(kind, date), KINDS[kind].party);
  }

  function dayTotals(date) {
    return { bought: kindDay('collection', date), sold: kindDay('sale', date) };
  }

  function between(kind, from, to) {
    return rows(kind).filter(function (r) { return r.date >= from && r.date <= to; });
  }

  function monthTotals(dateIso) {
    var to = dateIso || util.localToday();
    var from = util.monthStart(to);
    var bought = { litres: 0, amount: 0, entries: 0 };
    var sold = { litres: 0, amount: 0, entries: 0 };
    var complete = true;
    for (var d = from; d <= to; d = util.addDays(d, 1)) {
      var b = kindDay('collection', d), s = kindDay('sale', d);
      bought.litres += b.litres; bought.amount += b.amount; bought.entries += b.entries;
      sold.litres += s.litres; sold.amount += s.amount; sold.entries += s.entries;
      if ((!isComplete('collection', d) && !dailyOf('collection', d)) || (!isComplete('sale', d) && !dailyOf('sale', d))) complete = false;
    }
    return { from: from, to: to, bought: bought, sold: sold, complete: complete, margin: sold.amount - bought.amount };
  }

  /** The last n days, one entry per day even when nothing happened. */
  function denseDays(n, endIso) {
    var end = endIso || util.localToday();
    var start = util.addDays(end, -(n - 1));
    var out = [];
    for (var i = 0; i < n; i++) {
      var iso = util.addDays(start, i);
      var b = kindDay('collection', iso), s = kindDay('sale', iso);
      out.push({
        date: iso, litres: b.litres, amount: b.amount, morningLitres: b.morning, eveningLitres: b.evening,
        soldLitres: s.litres, soldAmount: s.amount, soldMorningLitres: s.morning, soldEveningLitres: s.evening
      });
    }
    return out;
  }

  /**
   * Litres and money per person over a stretch of this month. Days whose rows
   * were not sent come from the sheet's per-person month totals.
   */
  function partyTotals(kind, from, to) {
    var s = KINDS[kind];
    var per = {};
    var cut = windowOf(kind) || '';
    if (server.monthOf === from.slice(0, 7) && cut > from) {
      var mp = (server.monthParties && server.monthParties[kind]) || {};
      Object.keys(mp).forEach(function (id) { per[id] = { id: id, label: id, value: mp[id][0], amount: mp[id][1], entries: mp[id][2] }; });
    } else {
      cut = '';
    }
    between(kind, from, to).forEach(function (r) {
      if (r._failed || (cut && r.date < cut)) return;
      var key = r[s.party];
      var e = per[key] || (per[key] = { id: key, label: r[s.partyName] || key, value: 0, amount: 0, entries: 0 });
      e.value += Number(r.litres) || 0; e.amount += Number(r.amount) || 0; e.entries++;
      if (r[s.partyName]) e.label = r[s.partyName];
    });
    return per;
  }

  function rank(kind, from, to) {
    var per = partyTotals(kind, from, to);
    var pk = kind === 'collection' ? 'supplier' : 'customer';
    return Object.keys(per).map(function (k) {
      var p = person(pk, k);
      if (p) per[k].label = p.name;
      return per[k];
    }).sort(function (a, b) { return b.value - a.value; });
  }

  /** This month so far for one person. */
  function partyMonth(kind, id) {
    var today = util.localToday();
    var per = partyTotals(kind, util.monthStart(today), today);
    var key = Object.keys(per).filter(function (k) { return same(k, id); })[0];
    return key ? per[key] : { value: 0, amount: 0, entries: 0 };
  }

  /* ------------------------------------------------------------------ *
   * Finding people among thousands: ranked search and area groups
   * ------------------------------------------------------------------ */

  var searchCache = {};

  function searchEntries(kind) {
    var list = people(kind);
    var c = searchCache[kind];
    if (c && c.list === list) return c.entries;
    var idKey = kind === 'customer' ? 'customerId' : 'supplierId';
    var areaKey = kind === 'customer' ? 'address' : 'village';
    var entries = list.map(function (p) {
      var id = String(p[idKey] || '');
      var lowerId = id.toLowerCase();
      var digits = (id.match(/\d+/g) || []).join('');
      var name = String(p.name || '').toLowerCase();
      var area = String(p[areaKey] || '').trim();
      return {
        p: p, id: lowerId, idCompact: lowerId.replace(/[^a-z0-9]/g, ''), parts: lowerId.match(/(\d+|\D+)/g) || [],
        alpha: (lowerId.match(/^[a-z]+/) || [''])[0],
        num: digits.replace(/^0+(?=\d)/, ''), digits: digits,
        name: name, words: name.split(/\s+/).filter(Boolean),
        area: area.toLowerCase(), areaLabel: area, areaWords: area.toLowerCase().split(/\s+/).filter(Boolean),
        mobile: String(p.mobile || '').replace(/\D/g, '')
      };
    });
    entries.sort(byParts);
    entries.forEach(function (e, i) { e.order = i; });
    searchCache[kind] = { list: list, entries: entries };
    return entries;
  }

  /** S2 before S10: IDs compared piece by piece, numbers as numbers (pieces worked out once). */
  function byParts(a, b) {
    var ax = a.parts, bx = b.parts;
    for (var i = 0; i < ax.length && i < bx.length; i++) {
      var x = ax[i], y = bx[i];
      if (x === y) continue;
      var nx = x.charCodeAt(0) <= 57 && x.charCodeAt(0) >= 48, ny = y.charCodeAt(0) <= 57 && y.charCodeAt(0) >= 48;
      if (nx && ny) return Number(x) - Number(y) || (x.length - y.length);
      return x < y ? -1 : 1;
    }
    return ax.length - bx.length;
  }

  /** 0 = best. -1 = no match. A number finds the ID with that number first. */
  function scoreTerm(e, term) {
    if (/^\d+$/.test(term)) {
      var n = term.replace(/^0+(?=\d)/, '');
      if (e.digits === term) return 0;                                    // the number exactly as typed
      if (e.num === n) return 1;                                          // the same number, other zeros
      // 12 also finds 120–129; 0012 typed with its zeros means that number only.
      if (term.charAt(0) === '0' ? e.digits.indexOf(term) === 0 : e.num.indexOf(n) === 0) return 2;
      if (e.areaWords.indexOf(term) > -1) return 3;                       // "Ward 7"
      if (e.words.indexOf(term) > -1) return 4;
      if (term.length >= 3 && e.mobile.indexOf(term) > -1) return 4;      // part of a mobile number
      if (term.length >= 2 && (e.name.indexOf(term) > -1 || e.area.indexOf(term) > -1)) return 5;
      return -1;
    }
    var compact = term.replace(/[^a-z0-9]/g, '');
    if (e.id === term || (compact && e.idCompact === compact)) return 0;
    // "S12" or "s-12" finds S0012: letters, then the number without its leading zeros.
    var lettered = /^([a-z]+)[\s-]*(0*)(\d+)$/.exec(term);
    if (lettered && lettered[1] === e.alpha) {
      if (e.digits === lettered[2] + lettered[3]) return 0;
      if (e.num === lettered[3]) return 1;
      if (lettered[2] ? e.digits.indexOf(lettered[2] + lettered[3]) === 0 : e.num.indexOf(lettered[3]) === 0) return 2;
    }
    if (compact && compact.length === term.length && e.idCompact.indexOf(compact) === 0) return 2;
    for (var i = 0; i < e.words.length; i++) {
      if (e.words[i].indexOf(term) === 0) return i === 0 ? 2 : 3;
    }
    if (e.name.indexOf(term) > -1) return 4;
    if (e.area.indexOf(term) === 0) return 5;
    if (e.area.indexOf(term) > -1) return 6;
    // A mobile number typed with spaces, dashes or +91 (letters mean it is not a mobile number).
    if (/^[\d\s+()-]+$/.test(term) && term.replace(/\D/g, '').length >= 4 && e.mobile.indexOf(term.replace(/\D/g, '')) > -1) return 6;
    return -1;
  }

  /**
   * search('supplier', 'ravi', { filter: fn(person), sort: 'id'|'name' })
   * → people in order: best match first (or by number / by name when no words are typed).
   */
  /** A mobile number however it was typed: "+91 98765 43210" → "9876543210". */
  function phoneQuery(q) {
    if (!/^[\d\s+().-]+$/.test(q)) return null;
    var digits = q.replace(/\D/g, '');
    if (digits.length < 6 || (!/[\s+().-]/.test(q) && digits.length < 8)) return null;
    if (digits.length > 10 && /^(91|0)/.test(digits)) digits = digits.slice(digits.length - 10);
    return digits;
  }

  function search(kind, query, opts) {
    opts = opts || {};
    var q = String(query || '').toLowerCase().trim();
    var phone = phoneQuery(q);
    var terms = phone ? [phone] : q ? q.split(/\s+/) : [];
    var entries = searchEntries(kind);
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (opts.filter && !opts.filter(e.p, e)) continue;
      if (!terms.length) { out.push({ e: e, score: 0 }); continue; }
      var score = 0, okAll = true;
      for (var k = 0; k < terms.length; k++) {
        var sc = scoreTerm(e, terms[k]);
        if (sc < 0) { okAll = false; break; }
        score += sc;
      }
      if (okAll) out.push({ e: e, score: score });
    }
    if (terms.length) out.sort(function (a, b) { return a.score - b.score || a.e.order - b.e.order; });
    else if (opts.sort === 'name') out.sort(function (a, b) { return a.e.name < b.e.name ? -1 : a.e.name > b.e.name ? 1 : 0; });
    return out.map(function (x) { return x.e.p; });
  }

  /** Is this typed text a person's number (S12, s 12, 0012, S0012 — not a name)? 2 = as typed, 1 = other zeros. */
  function numberHit(e, q) {
    var term = q.replace(/[\s-]+/g, '');
    if (!term) return 0;
    if (e.id === term || e.idCompact === term) return 2;
    var m = /^([a-z]*)(0*)(\d+)$/.exec(term);
    if (!m || (m[1] && m[1] !== e.alpha) || e.num !== m[3]) return 0;
    return e.digits === m[2] + m[3] ? 2 : 1;
  }

  /**
   * The one person whose number is what was typed, among everyone (stopped
   * people too), or null. Exact digits beat the same number with other zeros.
   */
  function exact(kind, query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q || !/\d/.test(q)) return null;
    var best = [], bestScore = 0;
    var entries = searchEntries(kind);
    for (var i = 0; i < entries.length; i++) {
      var s = numberHit(entries[i], q);
      if (!s || s < bestScore) continue;
      if (s > bestScore) { best = []; bestScore = s; }
      best.push(entries[i].p);
    }
    return best.length === 1 ? best[0] : null;
  }

  /**
   * Villages (suppliers) or areas (customers), most people first.
   * The list also carries .total (everyone counted) and .blank (no village written).
   */
  function areas(kind, filter) {
    var groups = {};
    var total = 0, blank = 0;
    searchEntries(kind).forEach(function (e) {
      if (filter && !filter(e.p, e)) return;
      total++;
      if (!e.area) { blank++; return; }
      var g = groups[e.area] || (groups[e.area] = { key: e.area, label: e.areaLabel, count: 0 });
      g.count++;
    });
    var out = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
      return b.count - a.count || util.naturalCompare(a.label.toLowerCase(), b.label.toLowerCase());
    });
    out.total = total;
    out.blank = blank;
    return out;
  }

  function areaOf(kind, p) {
    return String((kind === 'customer' ? p.address : p.village) || '').trim().toLowerCase();
  }

  function advanceOf(supplierId) {
    var key = (person('supplier', supplierId) || {}).supplierId || supplierId;
    return Number(view.advanceBalances[key] || 0);
  }

  /** Positive = they owe us. Negative = they are in credit. */
  function owedBy(customerId) {
    var key = (person('customer', customerId) || {}).customerId || customerId;
    return Number(view.customerBalances[key] || 0);
  }

  function positiveSum(map) {
    return Object.keys(map).reduce(function (tot, k) { return tot + Math.max(0, Number(map[k]) || 0); }, 0);
  }
  function totalAdvances() { return positiveSum(view.advanceBalances); }
  function totalReceivable() { return positiveSum(view.customerBalances); }

  /** How full the Google Sheet file is: { cells, limit, share 0–1 }, or null when the script does not say. */
  function space() {
    var s = view.space;
    if (!s || !s.limit) return null;
    return { cells: s.cells, limit: s.limit, share: s.cells / s.limit, countedAt: s.countedAt };
  }

  function setting(key) { return view.settings[key]; }
  function currency() { return view.settings.currency || 'INR'; }
  function money(value, dp) { return util.fmtMoney(value, currency(), dp); }
  function defaultRate() { return Number(view.settings.default_rate) || 0; }
  function defaultSaleRate() { return Number(view.settings.default_sale_rate) || 0; }
  function maxLitres() { return Number(view.settings.max_litres_per_entry) || 200; }
  function allowFuture() { return view.settings.allow_future_dates === 'yes'; }
  function businessName() { return view.settings.business_name || 'Dakotax'; }

  function pendingCount() { return outbox.items.filter(function (i) { return i.status !== 'failed'; }).length; }
  function failedItems() { return outbox.items.filter(function (i) { return i.status === 'failed'; }); }
  function queue() { return outbox.items.slice(); }

  function status() {
    var offline = (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      !!(meta.sendError && meta.sendError.transport && pendingCount());
    return {
      ready: meta.ready, fromCache: meta.fromCache, syncing: meta.syncing, sending: meta.sending,
      pending: pendingCount(), failed: failedItems().length, offline: offline,
      lastSync: meta.lastSync, syncError: meta.syncError, sendError: meta.sendError,
      version: server.version
    };
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  var started = false;
  function init() {
    if (started) return;
    started = true;
    outbox = loadOutbox();
    if (loadCache() && unsavedConfirms.length) {
      // Confirmed by the sheet after the copy on the phone was last written.
      unsavedConfirms.forEach(function (c) { try { applyConfirm(c); } catch (err) { /* skip a bad one */ } });
      saveCache();
    }
    resetRound();
    rebuild();

    window.addEventListener('online', function () { kick(); syncIfStale(STALE_MS); });
    window.addEventListener('offline', function () { emit('status', status()); });
    window.addEventListener('pagehide', flushCache);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') { flushCache(); return; }
      checkRound();
      kick();
      syncIfStale(STALE_MS);
    });
    setInterval(checkRound, 30000);
    setInterval(function () {
      if (document.visibilityState === 'hidden' || meta.syncing || pendingCount()) return;
      syncIfStale(AUTO_SYNC_MS);
    }, 60000);
    pump();
  }

  return {
    init: init, on: on, emit: emit,
    KINDS: KINDS, spec: spec,
    sync: sync, syncIfStale: syncIfStale, isStale: isStale, ensureDay: ensureDay, isComplete: isComplete,
    save: save, remove: remove, setStatus: setStatus, discard: discard, retry: retry, kick: kick,
    saveSettings: saveSettings,
    data: data, rows: rows, rowsOn: rowsOn, people: people, person: person, activePeople: activePeople,
    findDuplicate: findDuplicate, dayTotals: dayTotals, monthTotals: monthTotals, totalsOf: totalsOf,
    between: between, denseDays: denseDays, rank: rank, partyMonth: partyMonth,
    search: search, exact: exact, areas: areas, areaOf: areaOf,
    advanceOf: advanceOf, owedBy: owedBy, totalAdvances: totalAdvances, totalReceivable: totalReceivable, space: space,
    setting: setting, currency: currency, money: money, defaultRate: defaultRate, defaultSaleRate: defaultSaleRate,
    maxLitres: maxLitres, allowFuture: allowFuture, businessName: businessName,
    pendingCount: pendingCount, failedItems: failedItems, queue: queue, itemById: itemById, status: status,
    round: function () { return round; }, setRound: setRound, resetRound: resetRound, autoShift: autoShift,
    isV2: isV2, strip: strip, resolve: resolveId
  };
})();

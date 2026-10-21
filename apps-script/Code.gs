/**
 * Dakotax Milk Collection — Google Apps Script API  (version 2)
 * ---------------------------------------------------------------------------
 * Backing store: the Google Sheet this script is bound to.
 * Transport:     doPost (text/plain JSON body) with a doGet/JSONP fallback,
 *                so a static site on GitHub Pages can talk to it without CORS
 *                preflight trouble.
 *
 * What changed in version 2
 *  - Saves no longer read whole sheets. The duplicate check reads one column
 *    (the date) and then only the rows for that date, so a save stays quick
 *    after years of entries.
 *  - Every write can carry a requestId. If a phone on weak signal sends the
 *    same save twice, the second one gets the first one's answer instead of
 *    creating a second row.
 *  - "batch" sends several queued saves in one trip.
 *  - Saves that change a balance return the new balance, so the app does not
 *    have to reload everything after each save.
 *  - Start-up sends every entry of this month (and at least the last 17
 *    days), not "the latest 400 rows", so the month totals on the dashboard
 *    are always complete. The new app asks for a compact form of it.
 *
 * Run setup() once from the editor to build the sheets. Running it again is
 * safe: it only adds what is missing.
 * ---------------------------------------------------------------------------
 */

var VERSION = '2.0.0';

var SHEET = {
  suppliers: 'Suppliers',
  collections: 'Collections',
  advances: 'Advances',
  payments: 'Payments',
  customers: 'Customers',
  sales: 'Sales',
  receipts: 'Receipts',
  settings: 'Settings'
};

var HEADERS = {
  Suppliers: ['supplier_id', 'name', 'mobile', 'village', 'rate_per_litre', 'status', 'created_at'],
  Collections: ['entry_id', 'date', 'supplier_id', 'supplier_name', 'shift', 'litres', 'fat', 'snf', 'rate_per_litre', 'amount', 'note', 'recorded_at'],
  Advances: ['advance_id', 'date', 'supplier_id', 'supplier_name', 'type', 'amount', 'note', 'recorded_at'],
  Payments: ['payment_id', 'date', 'supplier_id', 'supplier_name', 'period_from', 'period_to', 'milk_amount', 'advance_recovered', 'net_amount', 'mode', 'reference', 'note', 'recorded_at'],
  Customers: ['customer_id', 'name', 'mobile', 'address', 'rate_per_litre', 'status', 'created_at'],
  Sales: ['sale_id', 'date', 'customer_id', 'customer_name', 'shift', 'litres', 'rate_per_litre', 'amount', 'note', 'recorded_at'],
  Receipts: ['receipt_id', 'date', 'customer_id', 'customer_name', 'amount', 'mode', 'reference', 'note', 'recorded_at'],
  Settings: ['key', 'value', 'note']
};

var DEFAULT_SETTINGS = [
  ['business_name', 'Dakotax Milk Collection', 'Shown in the app header'],
  ['currency', 'INR', 'Currency code used for display'],
  ['default_rate', '32', 'Rate per litre paid to a supplier, suggested on a new entry'],
  ['default_sale_rate', '40', 'Rate per litre charged to a customer, suggested on a new delivery'],
  ['shift_cutover_hour', '12', 'Before this hour the app pre-selects Morning, from it Evening (0-23)'],
  ['allow_future_dates', 'no', 'yes = collection entries may be dated in the future'],
  ['max_litres_per_entry', '200', 'Entries above this are rejected as a typing mistake']
];

var SHIFTS = ['Morning', 'Evening'];
var ADVANCE_TYPES = ['Given', 'Recovered'];
var PAYMENT_MODES = ['Cash', 'Bank transfer', 'UPI', 'Cheque', 'Adjusted'];

var WINDOW_MIN_DAYS = 17;    // start-up sends this month, and never fewer than this many days
var WINDOW_MAX_ROWS = 4000;  // most rows per sheet sent at start-up; older days come as totals
var RECENT_ADVANCES = 300;
var RECENT_PAYMENTS = 200;
var RECENT_RECEIPTS = 300;
var REQUEST_TTL = 21600;     // seconds a finished write is remembered (6 hours)
var BATCH_MAX = 25;
var GAP_MERGE = 25;          // read through gaps this small instead of making another call
var SCAN_CHUNK = 4000;       // rows of one column read at a time when looking back from the bottom
var SCAN_MARGIN_DAYS = 2;    // a late entry may sit this many days out of date order and still be found
var AGG_TTL = 21600;         // seconds a finished day's totals are remembered (6 hours)
var BALANCE_TTL = 1800;      // seconds the customer balance list is remembered between full counts
var CELL_LIMIT = 10000000;   // Google's limit for one spreadsheet file, counting every cell of every tab
var SPACE_TTL = 21600;       // seconds the space count is remembered

/* ========================================================================= *
 * Entry points
 * ========================================================================= */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var payload = params.payload ? safeParse(params.payload, 'payload') : params;
  var result = payload && payload.__error ? payload : route(params.action || payload.action, payload);
  if (params.callback) {
    var name = String(params.callback).replace(/[^\w$.]/g, '');
    return ContentService
      .createTextOutput(name + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json(result);
}

function doPost(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    body = safeParse(e.postData.contents, 'request body');
  }
  if (body && body.__error) return json(body);
  return json(route(body.action, body));
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeParse(text, what) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return { __error: true, ok: false, error: { code: 'BAD_REQUEST', message: 'The ' + what + ' was not valid JSON.' } };
  }
}

/* ========================================================================= *
 * Router
 * ========================================================================= */

var READS = {
  'ping': function () { return { service: 'dakotax-milk', version: VERSION, time: nowIso(), features: ['requestId', 'batch', 'window', 'balances'] }; },
  'bootstrap': function (p) { return apiBootstrap(p); },
  'suppliers.list': function () { return { suppliers: readSuppliers() }; },
  'customers.list': function () { return { customers: readCustomers() }; },
  'collections.list': function (p) { return { collections: apiListCollections(p.filter || {}) }; },
  'sales.list': function (p) { return { sales: apiListSales(p.filter || {}) }; },
  'advances.list': function (p) { return { advances: apiListAdvances(p.filter || {}) }; },
  'payments.list': function (p) { return { payments: apiListPayments(p.filter || {}) }; },
  'receipts.list': function (p) { return { receipts: apiListReceipts(p.filter || {}) }; },
  'payments.due': function (p) { return apiPaymentDue(p.supplierId, p.from, p.to); },
  'reports.summary': function (p) { return apiReportSummary(p.filter || {}); }
};

var WRITES = {
  'suppliers.save': function (p) { return apiSaveSupplier(p.supplier || {}); },
  'suppliers.setStatus': function (p) { return apiSetSupplierStatus(p.supplierId, p.status); },
  'customers.save': function (p) { return apiSaveCustomer(p.customer || {}); },
  'customers.setStatus': function (p) { return apiSetCustomerStatus(p.customerId, p.status); },
  'collections.save': function (p) { return apiSaveCollection(p.entry || {}); },
  'collections.delete': function (p) { return apiDeleteRow(SHEET.collections, 'entry_id', p.entryId, 'collection entry'); },
  'sales.save': function (p) { return apiSaveSale(p.sale || {}); },
  'sales.delete': function (p) { return apiDeleteRow(SHEET.sales, 'sale_id', p.saleId, 'delivery'); },
  'advances.save': function (p) { return apiSaveAdvance(p.advance || {}); },
  'advances.delete': function (p) { return apiDeleteRow(SHEET.advances, 'advance_id', p.advanceId, 'advance'); },
  'payments.save': function (p) { return apiSavePayment(p.payment || {}); },
  'payments.delete': function (p) { return apiDeleteRow(SHEET.payments, 'payment_id', p.paymentId, 'payment'); },
  'receipts.save': function (p) { return apiSaveReceipt(p.receipt || {}); },
  'receipts.delete': function (p) { return apiDeleteRow(SHEET.receipts, 'receipt_id', p.receiptId, 'receipt'); },
  'settings.save': function (p) { return apiSaveSettings(p.settings || {}); }
};

function route(action, payload) {
  payload = payload || {};
  try {
    if (action === 'batch') return ok(apiBatch(payload.requests || []));
    if (Object.prototype.hasOwnProperty.call(READS, action)) return ok(READS[action](payload));
    if (Object.prototype.hasOwnProperty.call(WRITES, action)) {
      return withLock(function () { return runWrite(action, payload); });
    }
    return fail('UNKNOWN_ACTION', action
      ? 'This app asked for "' + action + '", which this script version does not handle. Re-deploy the script from the latest Code.gs.'
      : 'No action was sent. The app and the script may be out of step — re-deploy the script.');
  } catch (err) {
    return failure(err);
  }
}

function failure(err) {
  if (err && err.__api) {
    return { ok: false, error: { code: err.code, message: err.message, field: err.field || null, details: err.details || null } };
  }
  return fail('SERVER_ERROR', 'The sheet could not complete that request: ' + (err && err.message ? err.message : err));
}

/**
 * Runs one write. Must be called while holding the script lock.
 * A requestId that was already answered gets the same answer back, so a
 * save that is retried after a dropped connection never makes a second row.
 */
function runWrite(action, payload) {
  var requestId = asText(payload.requestId).slice(0, 80);
  var cache = null;
  if (requestId) {
    try { cache = CacheService.getScriptCache(); } catch (err) { cache = null; }
  }
  if (cache) {
    var seen = null;
    try { seen = cache.get('rq:' + requestId); } catch (err) { seen = null; }
    if (seen) {
      var replay = JSON.parse(seen);
      if (replay && replay.data) replay.data.replayed = true;
      return replay;
    }
  }
  var result;
  try {
    result = ok(WRITES[action](payload));
  } catch (err) {
    return failure(err);
  }
  if (cache) {
    try { cache.put('rq:' + requestId, JSON.stringify(result), REQUEST_TTL); } catch (err) { /* too big or cache down — fine */ }
  }
  return result;
}

/** Several writes in one trip, in order. Each one succeeds or fails on its own. */
function apiBatch(requests) {
  if (!requests || !requests.length) return { results: [] };
  if (requests.length > BATCH_MAX) stop('VALIDATION', 'Send at most ' + BATCH_MAX + ' changes at a time.');
  return withLock(function () {
    var results = [];
    for (var i = 0; i < requests.length; i++) {
      var item = requests[i] || {};
      var action = item.action;
      var payload = item.payload || {};
      if (!Object.prototype.hasOwnProperty.call(WRITES, action)) {
        results.push(fail('UNKNOWN_ACTION', 'Unknown change "' + action + '".'));
        continue;
      }
      results.push(runWrite(action, payload));
    }
    return { results: results };
  });
}

function ok(data) { return { ok: true, data: data || {} }; }
function fail(code, message, field) { return { ok: false, error: { code: code, message: message, field: field || null } }; }
function stop(code, message, field, details) {
  var err = new Error(message);
  err.__api = true; err.code = code; err.field = field || null; err.details = details || null;
  throw err;
}

/* ========================================================================= *
 * Per-request memory. Apps Script starts every request with fresh globals,
 * so this never goes stale between requests; writes clear what they touch.
 * ========================================================================= */

var MEMO = {};

function memo(key, fn) {
  if (!Object.prototype.hasOwnProperty.call(MEMO, key)) MEMO[key] = fn();
  return MEMO[key];
}

/** Forget everything read from one sheet, after writing to it. */
function touch(sheetName) {
  Object.keys(MEMO).forEach(function (k) {
    if (k.indexOf(sheetName + '::') === 0) delete MEMO[k];
  });
}

function scriptCache() {
  return memo('cache', function () { try { return CacheService.getScriptCache(); } catch (err) { return null; } });
}
function cacheGet(key) {
  var c = scriptCache();
  if (!c) return null;
  try { return c.get(key); } catch (err) { return null; }
}
function cachePut(key, value, ttl) {
  var c = scriptCache();
  if (!c) return;
  try { c.put(key, value, ttl); } catch (err) { /* too big or cache down — fine */ }
}
function cacheRemove(key) {
  var c = scriptCache();
  if (!c) return;
  try { c.remove(key); } catch (err) { /* fine */ }
}

/* ========================================================================= *
 * Sheet plumbing
 * ========================================================================= */

function book() { return memo('book', function () { return SpreadsheetApp.getActiveSpreadsheet(); }); }

function sheet(name) {
  return memo('sheet:' + name, function () {
    var sh = book().getSheetByName(name);
    if (!sh) stop('NO_SHEET', 'The sheet "' + name + '" is missing. Open the script editor and run setup() once to rebuild it.');
    return sh;
  });
}

/** Header names → positions, read from the sheet itself, so moved columns still work. */
function columns(name) {
  return memo('cols:' + name, function () {
    var sh = sheet(name);
    var width = Math.max(sh.getLastColumn(), 1);
    var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
    var index = {};
    head.forEach(function (h, i) { if (h && index[h] === undefined) index[h] = i; });
    var missing = HEADERS[name] ? HEADERS[name].filter(function (h) { return index[h] === undefined; }) : [];
    return { head: head, index: index, width: head.length, missing: missing };
  });
}

function requireColumns(name) {
  var cols = columns(name);
  if (cols.missing.length) {
    stop('NO_SHEET', 'The "' + name + '" sheet is missing the column ' + cols.missing.join(', ') +
      '. Open the script editor and run setup() once — it adds missing columns without touching your rows.');
  }
  return cols;
}

function lastRow(name) { return memo(name + '::last', function () { return sheet(name).getLastRow(); }); }

function rowToObject(cols, values, rowNumber) {
  var obj = { __row: rowNumber };
  for (var c = 0; c < cols.head.length; c++) if (cols.head[c]) obj[cols.head[c]] = values[c];
  return obj;
}

function isBlankRow(values) {
  for (var i = 0; i < values.length; i++) if (values[i] !== '' && values[i] !== null) return false;
  return true;
}

/** Every row of a sheet as objects keyed by header name. */
function readAll(name) {
  return memo(name + '::all', function () {
    var last = lastRow(name);
    if (last < 2) return [];
    var cols = columns(name);
    var values = sheet(name).getRange(2, 1, last - 1, cols.width).getValues();
    var rows = [];
    for (var r = 0; r < values.length; r++) {
      if (isBlankRow(values[r])) continue;
      rows.push(rowToObject(cols, values[r], r + 2));
    }
    return rows;
  });
}

/** One column, top to bottom (row 2 first). Far cheaper than the whole sheet. */
function columnValues(name, colName) {
  return memo(name + '::col:' + colName, function () {
    var cols = columns(name);
    if (cols.index[colName] === undefined) {
      stop('NO_SHEET', 'The "' + name + '" sheet has no "' + colName + '" column. Run setup() once from the script editor — it adds missing columns without touching your rows.');
    }
    var last = lastRow(name);
    if (last < 2) return [];
    var values = sheet(name).getRange(2, cols.index[colName] + 1, last - 1, 1).getValues();
    var out = new Array(values.length);
    for (var i = 0; i < values.length; i++) out[i] = values[i][0];
    return out;
  });
}

/** Whole rows for the given row numbers, reading each run of nearby rows in one call. */
function readRows(name, rowNumbers) {
  if (!rowNumbers.length) return [];
  var cols = columns(name);
  var sh = sheet(name);
  var wanted = {};
  rowNumbers.forEach(function (n) { wanted[n] = true; });
  var sorted = rowNumbers.slice().sort(function (a, b) { return a - b; });
  var out = [];
  function flush(from, to) {
    var values = sh.getRange(from, 1, to - from + 1, cols.width).getValues();
    for (var i = 0; i < values.length; i++) {
      var n = from + i;
      if (!wanted[n] || isBlankRow(values[i])) continue;
      out.push(rowToObject(cols, values[i], n));
    }
  }
  var start = sorted[0], prev = sorted[0];
  for (var k = 1; k < sorted.length; k++) {
    if (sorted[k] - prev <= GAP_MERGE) { prev = sorted[k]; continue; }
    flush(start, prev);
    start = prev = sorted[k];
  }
  flush(start, prev);
  return out;
}

/**
 * Finds rows by date without reading the whole date column.
 *
 * Entries are added in date order, so the date column is read from the
 * bottom up, a chunk at a time, stopping at the first chunk that is entirely
 * older than `oldest` minus a week (room for late entries). After a year of
 * entries a save still reads only the last few thousand cells. If the sheet
 * does not look like it is in date order — sorted by hand, say — the whole
 * column is read instead, so nothing is ever missed.
 *
 * `test` must only accept dates on or after `oldest`. Returns [{row, date}].
 */
function dateHits(name, oldest, test) {
  var last = lastRow(name);
  if (last < 2) return [];
  var cols = columns(name);
  if (cols.index.date === undefined) {
    stop('NO_SHEET', 'The "' + name + '" sheet has no "date" column. Run setup() once from the script editor.');
  }

  function scanAll() {
    var all = columnValues(name, 'date');
    var out = [];
    for (var k = 0; k < all.length; k++) {
      var v = asText(all[k]);
      if (v && test(v)) out.push({ row: k + 2, date: v });
    }
    return out;
  }

  if (!oldest || last - 1 <= SCAN_CHUNK * 2) return scanAll();
  var sh = sheet(name);
  var col = cols.index.date + 1;
  var limit = shiftDate(oldest, -SCAN_MARGIN_DAYS);

  // In a sheet kept in date order the first rows are the oldest.
  var headMax = memo('headmax:' + name, function () {
    var head = sh.getRange(2, col, SCAN_CHUNK, 1).getValues();
    var max = '';
    for (var h = 0; h < head.length; h++) { var v = asText(head[h][0]); if (v > max) max = v; }
    return max;
  });
  if (headMax >= limit) return scanAll();

  var hits = [];
  var floor = SCAN_CHUNK + 2;
  var end = last;
  while (end >= floor) {
    var start = Math.max(floor, end - SCAN_CHUNK + 1);
    var values = sh.getRange(start, col, end - start + 1, 1).getValues();
    var allOld = true;
    for (var i = 0; i < values.length; i++) {
      var d = asText(values[i][0]);
      if (d >= limit) allOld = false;
      if (d && test(d)) hits.push({ row: start + i, date: d });
    }
    if (allOld) break;
    end = start - 1;
  }
  return hits;
}

function rowNumbers(hits) { return hits.map(function (h) { return h.row; }); }

function rowsOnDate(name, date) {
  return readRows(name, rowNumbers(dateHits(name, date, function (d) { return d === date; })));
}

/**
 * The entry already on this date for this person and round, if any —
 * reading just two columns of that day's rows, then the one matching row.
 */
function sameRoundRow(name, date, partyCol, partyId, shift, skipRow) {
  var rowsToday = rowNumbers(dateHits(name, date, function (d) { return d === date; }));
  if (!rowsToday.length) return null;
  var data = readColumns(name, rowsToday, [partyCol, 'shift']);
  var who = lower(partyId), when = lower(shift);
  for (var i = 0; i < rowsToday.length; i++) {
    var n = rowsToday[i];
    if (n === skipRow) continue;
    if (lower(data[partyCol][n]) === who && lower(data.shift[n]) === when) return readRows(name, [n])[0] || null;
  }
  return null;
}

function rowsBetween(name, from, to) {
  if (!from && !to) return readAll(name);
  return readRows(name, rowNumbers(dateHits(name, from || null, function (d) {
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  })));
}

/** Finds a row by its ID, looking from the newest rows up — recent rows are found at once. */
function findRowById(name, idColumn, id) {
  var wanted = asText(id);
  if (!wanted) return null;
  var last = lastRow(name);
  if (last < 2) return null;
  var cols = columns(name);
  if (cols.index[idColumn] === undefined) {
    stop('NO_SHEET', 'The "' + name + '" sheet has no "' + idColumn + '" column. Run setup() once from the script editor.');
  }
  var sh = sheet(name);
  var end = last;
  while (end >= 2) {
    var start = Math.max(2, end - SCAN_CHUNK + 1);
    var values = sh.getRange(start, cols.index[idColumn] + 1, end - start + 1, 1).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (asText(values[i][0]) === wanted) return readRows(name, [start + i])[0] || null;
    }
    end = start - 1;
  }
  return null;
}

/** Only some columns, for the given rows — enough to add things up without reading whole rows. */
function readColumns(name, rowList, colNames) {
  var out = {};
  colNames.forEach(function (c) { out[c] = {}; });
  if (!rowList.length) return out;
  var cols = columns(name);
  var sh = sheet(name);
  var sorted = rowList.slice().sort(function (a, b) { return a - b; });
  var runs = [];
  var start = sorted[0], prev = sorted[0];
  for (var k = 1; k < sorted.length; k++) {
    if (sorted[k] - prev <= GAP_MERGE) { prev = sorted[k]; continue; }
    runs.push([start, prev]); start = prev = sorted[k];
  }
  runs.push([start, prev]);
  colNames.forEach(function (c) {
    if (cols.index[c] === undefined) return;
    runs.forEach(function (run) {
      var values = sh.getRange(run[0], cols.index[c] + 1, run[1] - run[0] + 1, 1).getValues();
      for (var i = 0; i < values.length; i++) out[c][run[0] + i] = values[i][0];
    });
  });
  return out;
}

/** Builds a row in the sheet's own column order, keeping any extra columns as they were. */
function toRowArray(name, obj, existing) {
  var cols = requireColumns(name);
  var arr = [];
  for (var i = 0; i < cols.width; i++) arr.push(existing && existing[i] !== undefined ? existing[i] : '');
  HEADERS[name].forEach(function (key) {
    arr[cols.index[key]] = obj[key] === undefined || obj[key] === null ? '' : obj[key];
  });
  return arr;
}

function appendRecord(name, obj) {
  sheet(name).appendRow(toRowArray(name, obj));
  touch(name);
}

function updateRecord(name, rowNumber, obj) {
  var cols = columns(name);
  var range = sheet(name).getRange(rowNumber, 1, 1, cols.width);
  range.setValues([toRowArray(name, obj, range.getValues()[0])]);
  touch(name);
}

function deleteRecord(name, rowNumber) {
  sheet(name).deleteRow(rowNumber);
  touch(name);
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    stop('BUSY', 'Someone else is saving right now. Wait a moment and try again.');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId(prefix) {
  var stamp = Utilities.formatDate(new Date(), tz(), 'yyyyMMdd-HHmmssSSS');
  var tail = Math.floor(Math.random() * 1679616).toString(36);
  while (tail.length < 4) tail = '0' + tail;
  return prefix + '-' + stamp + '-' + tail;
}

function tz() { return memo('tz', function () { return book().getSpreadsheetTimeZone() || 'Asia/Kolkata'; }); }
function nowIso() { return Utilities.formatDate(new Date(), tz(), "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function today() { return Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd'); }

/* ========================================================================= *
 * Validation
 * ========================================================================= */

function asText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Utilities.formatDate(value, tz(), 'yyyy-MM-dd');
  return String(value).trim();
}

function requireText(value, label, field, maxLen) {
  var text = asText(value);
  if (!text) stop('VALIDATION', label + ' is required.', field);
  if (maxLen && text.length > maxLen) stop('VALIDATION', label + ' is too long — keep it under ' + maxLen + ' characters.', field);
  return text;
}

function requireDate(value, label, field) {
  var text = asText(value);
  if (!text) stop('VALIDATION', label + ' is required.', field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) stop('VALIDATION', label + ' must look like 2026-08-30. Received "' + text + '".', field);
  var parts = text.split('-').map(Number);
  var probe = new Date(parts[0], parts[1] - 1, parts[2]);
  if (probe.getFullYear() !== parts[0] || probe.getMonth() !== parts[1] - 1 || probe.getDate() !== parts[2]) {
    stop('VALIDATION', text + ' is not a real date.', field);
  }
  return text;
}

function requireNumber(value, label, field, opts) {
  opts = opts || {};
  var raw = asText(value).replace(/,/g, '');
  if (raw === '') {
    if (opts.optional) return null;
    stop('VALIDATION', label + ' is required.', field);
  }
  var num = Number(raw);
  if (!isFinite(num)) stop('VALIDATION', label + ' must be a number. Received "' + raw + '".', field);
  if (opts.min !== undefined && num < opts.min) stop('VALIDATION', label + ' must be at least ' + opts.min + '. Received ' + num + '.', field);
  if (opts.max !== undefined && num > opts.max) stop('VALIDATION', label + ' looks like a typing mistake — the limit is ' + opts.max + '. Received ' + num + '.', field);
  if (opts.gt !== undefined && num <= opts.gt) stop('VALIDATION', label + ' must be more than ' + opts.gt + '. Received ' + num + '.', field);
  return round(num, opts.dp === undefined ? 2 : opts.dp);
}

function requireOneOf(value, allowed, label, field) {
  var text = asText(value);
  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i].toLowerCase() === text.toLowerCase()) return allowed[i];
  }
  stop('VALIDATION', label + ' must be one of: ' + allowed.join(', ') + '. Received "' + text + '".', field);
}

function requireMobile(value, field) {
  var text = asText(value).replace(/[\s-]/g, '');
  if (!text) return '';
  if (!/^\+?\d{6,15}$/.test(text)) {
    stop('VALIDATION', 'Mobile number should be 6 to 15 digits, optionally starting with +. Received "' + asText(value) + '".', field);
  }
  return text;
}

function round(n, dp) {
  var f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function prettyDate(iso) {
  var parts = String(iso).split('-');
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (parts.length !== 3) return iso;
  return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
}

function lower(value) { return asText(value).toLowerCase(); }

/* ========================================================================= *
 * Settings & people
 * ========================================================================= */

function readSettings() {
  return memo(SHEET.settings + '::map', function () {
    var out = {};
    readAll(SHEET.settings).forEach(function (row) {
      var key = asText(row.key);
      if (key) out[key] = asText(row.value);
    });
    DEFAULT_SETTINGS.forEach(function (d) { if (out[d[0]] === undefined) out[d[0]] = d[1]; });
    return out;
  });
}

function apiSaveSettings(incoming) {
  var sh = sheet(SHEET.settings);
  var index = {};
  readAll(SHEET.settings).forEach(function (r) { index[asText(r.key)] = r.__row; });
  var cols = columns(SHEET.settings);
  var valueCol = (cols.index.value === undefined ? 1 : cols.index.value) + 1;
  Object.keys(incoming).forEach(function (key) {
    if (!/^[a-z0-9_]{1,40}$/.test(key)) return;
    var value = asText(incoming[key]).slice(0, 200);
    if (index[key]) sh.getRange(index[key], valueCol).setValue(value);
    else appendRecord(SHEET.settings, { key: key, value: value, note: '' });
  });
  touch(SHEET.settings);
  return { settings: readSettings() };
}

function mapSupplier(row) {
  return {
    supplierId: asText(row.supplier_id),
    name: asText(row.name),
    mobile: asText(row.mobile),
    village: asText(row.village),
    ratePerLitre: row.rate_per_litre === '' || row.rate_per_litre === null || row.rate_per_litre === undefined ? null : Number(row.rate_per_litre),
    status: asText(row.status) || 'Active',
    createdAt: asText(row.created_at)
  };
}

function readSuppliers() {
  return memo(SHEET.suppliers + '::list', function () {
    return readAll(SHEET.suppliers).map(mapSupplier).filter(function (s) { return s.supplierId; });
  });
}

function supplierIndex() {
  return memo(SHEET.suppliers + '::index', function () {
    var idx = {};
    readSuppliers().forEach(function (s) { idx[s.supplierId.toLowerCase()] = s; });
    return idx;
  });
}

/** One supplier by ID. Reads only the ID column and that row, unless the full list is already loaded. */
function findSupplier(supplierId) {
  return lookupPerson(SHEET.suppliers, 'supplier_id', mapSupplier, supplierId);
}

function lookupPerson(sheetName, idCol, mapper, id) {
  var wanted = lower(id);
  if (!wanted) return null;
  var indexKey = sheetName + '::index';
  if (Object.prototype.hasOwnProperty.call(MEMO, indexKey)) return MEMO[indexKey][wanted] || null;
  var ids = columnValues(sheetName, idCol);
  for (var i = 0; i < ids.length; i++) {
    if (lower(ids[i]) === wanted) {
      var row = readRows(sheetName, [i + 2])[0];
      var person = row ? mapper(row) : null;
      return person && person[idCol === 'supplier_id' ? 'supplierId' : 'customerId'] ? person : null;
    }
  }
  return null;
}

/** The ID as written on the Suppliers sheet, so balances never split on letter case. */
function supplierKey(id) {
  var found = supplierIndex()[lower(id)];
  return found ? found.supplierId : asText(id);
}

function apiSaveSupplier(input) {
  var supplierId = requireText(input.supplierId, 'Supplier ID', 'supplierId', 20);
  if (!/^[A-Za-z0-9_-]+$/.test(supplierId)) {
    stop('VALIDATION', 'Supplier ID can use letters, numbers, hyphen and underscore only — no spaces. Received "' + supplierId + '".', 'supplierId');
  }
  var record = {
    supplier_id: supplierId,
    name: requireText(input.name, 'Supplier name', 'name', 80),
    mobile: requireMobile(input.mobile, 'mobile'),
    village: asText(input.village).slice(0, 80),
    rate_per_litre: requireNumber(input.ratePerLitre, 'Rate per litre', 'ratePerLitre', { optional: true, min: 0, max: 5000 }),
    status: requireOneOf(input.status || 'Active', ['Active', 'Inactive'], 'Status', 'status'),
    created_at: nowIso()
  };

  var rows = readAll(SHEET.suppliers);
  var existingRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (lower(rows[i].supplier_id) === supplierId.toLowerCase()) { existingRow = rows[i]; break; }
  }

  if (input.mode === 'create' && existingRow) {
    stop('DUPLICATE', 'Supplier ID "' + supplierId + '" already belongs to ' + asText(existingRow.name) + '. Pick a different ID, or open that supplier to edit them.', 'supplierId');
  }

  if (existingRow) {
    record.supplier_id = asText(existingRow.supplier_id);
    record.created_at = asText(existingRow.created_at) || record.created_at;
    updateRecord(SHEET.suppliers, existingRow.__row, record);
  } else {
    appendRecord(SHEET.suppliers, record);
  }
  return { supplier: findSupplier(record.supplier_id), created: !existingRow };
}

function apiSetSupplierStatus(supplierId, status) {
  var wanted = requireText(supplierId, 'Supplier ID', 'supplierId');
  var nextStatus = requireOneOf(status, ['Active', 'Inactive'], 'Status', 'status');
  var rows = readAll(SHEET.suppliers);
  for (var i = 0; i < rows.length; i++) {
    if (lower(rows[i].supplier_id) === wanted.toLowerCase()) {
      var cols = requireColumns(SHEET.suppliers);
      sheet(SHEET.suppliers).getRange(rows[i].__row, cols.index.status + 1).setValue(nextStatus);
      touch(SHEET.suppliers);
      return { supplierId: asText(rows[i].supplier_id), status: nextStatus, supplier: findSupplier(wanted) };
    }
  }
  stop('NOT_FOUND', 'No supplier with ID "' + wanted + '" was found.', 'supplierId');
}

function mapCustomer(row) {
  return {
    customerId: asText(row.customer_id),
    name: asText(row.name),
    mobile: asText(row.mobile),
    address: asText(row.address),
    ratePerLitre: row.rate_per_litre === '' || row.rate_per_litre === null || row.rate_per_litre === undefined ? null : Number(row.rate_per_litre),
    status: asText(row.status) || 'Active',
    createdAt: asText(row.created_at)
  };
}

function readCustomers() {
  return memo(SHEET.customers + '::list', function () {
    return readAll(SHEET.customers).map(mapCustomer).filter(function (c) { return c.customerId; });
  });
}

function customerIndex() {
  return memo(SHEET.customers + '::index', function () {
    var idx = {};
    readCustomers().forEach(function (c) { idx[c.customerId.toLowerCase()] = c; });
    return idx;
  });
}

function findCustomer(customerId) {
  return lookupPerson(SHEET.customers, 'customer_id', mapCustomer, customerId);
}

function customerKey(id) {
  var found = customerIndex()[lower(id)];
  return found ? found.customerId : asText(id);
}

function apiSaveCustomer(input) {
  var customerId = requireText(input.customerId, 'Customer ID', 'customerId', 20);
  if (!/^[A-Za-z0-9_-]+$/.test(customerId)) {
    stop('VALIDATION', 'Customer ID can use letters, numbers, hyphen and underscore only — no spaces. Received "' + customerId + '".', 'customerId');
  }
  var record = {
    customer_id: customerId,
    name: requireText(input.name, 'Customer name', 'name', 80),
    mobile: requireMobile(input.mobile, 'mobile'),
    address: asText(input.address).slice(0, 80),
    rate_per_litre: requireNumber(input.ratePerLitre, 'Rate per litre', 'ratePerLitre', { optional: true, min: 0, max: 5000 }),
    status: requireOneOf(input.status || 'Active', ['Active', 'Inactive'], 'Status', 'status'),
    created_at: nowIso()
  };

  var rows = readAll(SHEET.customers);
  var existingRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (lower(rows[i].customer_id) === customerId.toLowerCase()) { existingRow = rows[i]; break; }
  }

  if (input.mode === 'create' && existingRow) {
    stop('DUPLICATE', 'Customer ID "' + customerId + '" already belongs to ' + asText(existingRow.name) + '. Pick a different ID, or open that customer to edit them.', 'customerId');
  }

  if (existingRow) {
    record.customer_id = asText(existingRow.customer_id);
    record.created_at = asText(existingRow.created_at) || record.created_at;
    updateRecord(SHEET.customers, existingRow.__row, record);
  } else {
    appendRecord(SHEET.customers, record);
  }
  return { customer: findCustomer(record.customer_id), created: !existingRow };
}

function apiSetCustomerStatus(customerId, status) {
  var wanted = requireText(customerId, 'Customer ID', 'customerId');
  var nextStatus = requireOneOf(status, ['Active', 'Inactive'], 'Status', 'status');
  var rows = readAll(SHEET.customers);
  for (var i = 0; i < rows.length; i++) {
    if (lower(rows[i].customer_id) === wanted.toLowerCase()) {
      var cols = requireColumns(SHEET.customers);
      sheet(SHEET.customers).getRange(rows[i].__row, cols.index.status + 1).setValue(nextStatus);
      touch(SHEET.customers);
      return { customerId: asText(rows[i].customer_id), status: nextStatus, customer: findCustomer(wanted) };
    }
  }
  stop('NOT_FOUND', 'No customer with ID "' + wanted + '" was found.', 'customerId');
}

/* ========================================================================= *
 * Collections — milk in
 * ========================================================================= */

function mapCollection(row) {
  return {
    entryId: asText(row.entry_id),
    date: asText(row.date),
    supplierId: asText(row.supplier_id),
    supplierName: asText(row.supplier_name),
    shift: asText(row.shift),
    litres: Number(row.litres) || 0,
    fat: row.fat === '' || row.fat === null || row.fat === undefined ? null : Number(row.fat),
    snf: row.snf === '' || row.snf === null || row.snf === undefined ? null : Number(row.snf),
    ratePerLitre: Number(row.rate_per_litre) || 0,
    amount: Number(row.amount) || 0,
    note: asText(row.note),
    recordedAt: asText(row.recorded_at)
  };
}

function readCollections(from, to) {
  return rowsBetween(SHEET.collections, from, to).map(mapCollection).filter(function (c) { return c.entryId; });
}

function applyFilter(rows, filter) {
  var from = filter.from ? asText(filter.from) : null;
  var to = filter.to ? asText(filter.to) : null;
  var supplierId = filter.supplierId ? lower(filter.supplierId) : null;
  var shift = filter.shift ? lower(filter.shift) : null;
  return rows.filter(function (r) {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (supplierId && String(r.supplierId).toLowerCase() !== supplierId) return false;
    if (shift && r.shift && String(r.shift).toLowerCase() !== shift) return false;
    return true;
  });
}

function byDateDesc(a, b) {
  if (a.date === b.date) return String(b.recordedAt).localeCompare(String(a.recordedAt));
  return b.date < a.date ? -1 : 1;
}

function apiListCollections(filter) {
  var rows = applyFilter(readCollections(filter.from ? asText(filter.from) : null, filter.to ? asText(filter.to) : null), filter).sort(byDateDesc);
  var limit = Number(filter.limit) || 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function apiSaveCollection(input) {
  var settings = readSettings();
  var entryDate = requireDate(input.date, 'Collection date', 'date');
  if (settings.allow_future_dates !== 'yes' && entryDate > today()) {
    stop('VALIDATION', 'That date is in the future. Today is ' + prettyDate(today()) + '.', 'date');
  }

  var supplierId = requireText(input.supplierId, 'Supplier', 'supplierId');
  var supplier = findSupplier(supplierId);
  if (!supplier) stop('NOT_FOUND', 'No supplier with ID "' + supplierId + '" is on the Suppliers sheet. Add them first.', 'supplierId');
  if (supplier.status === 'Inactive' && !input.entryId) {
    stop('VALIDATION', supplier.name + ' is marked Inactive. Set them back to Active on the People page before recording milk.', 'supplierId');
  }

  var shift = requireOneOf(input.shift, SHIFTS, 'Shift', 'shift');
  var maxLitres = Number(settings.max_litres_per_entry) || 200;
  var litres = requireNumber(input.litres, 'Litres', 'litres', { gt: 0, max: maxLitres, dp: 2 });
  var rate = requireNumber(
    input.ratePerLitre === '' || input.ratePerLitre === undefined || input.ratePerLitre === null
      ? (supplier.ratePerLitre || settings.default_rate)
      : input.ratePerLitre,
    'Rate per litre', 'ratePerLitre', { gt: 0, max: 5000, dp: 2 });
  var fat = requireNumber(input.fat, 'Fat %', 'fat', { optional: true, min: 0, max: 15, dp: 2 });
  var snf = requireNumber(input.snf, 'SNF %', 'snf', { optional: true, min: 0, max: 15, dp: 2 });

  var editingRow = null;
  if (input.entryId) {
    editingRow = findRowById(SHEET.collections, 'entry_id', input.entryId);
    if (!editingRow) stop('NOT_FOUND', 'That entry was deleted by someone else. Refresh and enter it again.', 'entryId');
  }

  // Duplicate guard: one entry per date + supplier + shift. Only that day's
  // rows are looked at — the whole sheet never is.
  var r = sameRoundRow(SHEET.collections, entryDate, 'supplier_id', supplier.supplierId, shift, editingRow ? editingRow.__row : null);
  if (r) {
    stop('DUPLICATE',
      supplier.name + ' already has a ' + shift + ' entry for ' + prettyDate(entryDate) +
      ' (' + Number(r.litres) + ' L). Open that entry to change it, or switch the shift.',
      'shift', { existing: mapCollection(r) });
  }

  var record = {
    entry_id: editingRow ? asText(editingRow.entry_id) : newId('COL'),
    date: entryDate,
    supplier_id: supplier.supplierId,
    supplier_name: supplier.name,
    shift: shift,
    litres: litres,
    fat: fat === null ? '' : fat,
    snf: snf === null ? '' : snf,
    rate_per_litre: rate,
    amount: round(litres * rate, 2),
    note: asText(input.note).slice(0, 200),
    recorded_at: nowIso()
  };

  if (editingRow) updateRecord(SHEET.collections, editingRow.__row, record);
  else appendRecord(SHEET.collections, record);
  forgetDay(SHEET.collections, entryDate);
  if (editingRow && asText(editingRow.date) !== entryDate) forgetDay(SHEET.collections, asText(editingRow.date));
  return { entry: mapCollection(record), created: !editingRow };
}

/** Deletes one row by its ID and reports the balance it affected, if any. */
function apiDeleteRow(sheetName, idColumn, idValue, label) {
  var wanted = requireText(idValue, 'Record ID', 'id');
  var row = findRowById(sheetName, idColumn, wanted);
  if (!row) stop('NOT_FOUND', 'That ' + label + ' is no longer on the sheet — someone may have removed it already.', 'id');
  if (sheetName === SHEET.sales || sheetName === SHEET.receipts) holdCustomerBalances();
  deleteRecord(sheetName, row.__row);
  if (sheetName === SHEET.sales) moveCustomerBalance(row.customer_id, -(Number(row.amount) || 0));
  if (sheetName === SHEET.receipts) moveCustomerBalance(row.customer_id, Number(row.amount) || 0);
  if (sheetName === SHEET.collections || sheetName === SHEET.sales) forgetDay(sheetName, asText(row.date));

  var out = { deleted: wanted };
  if (sheetName === SHEET.advances || sheetName === SHEET.payments) {
    out.supplierId = supplierKey(row.supplier_id);
    out.balance = advanceBalance(out.supplierId);
  } else if (sheetName === SHEET.sales || sheetName === SHEET.receipts) {
    out.customerId = customerKey(row.customer_id);
    out.balance = customerBalance(out.customerId);
  } else if (sheetName === SHEET.collections) {
    out.supplierId = supplierKey(row.supplier_id);
  }
  return out;
}

/* ========================================================================= *
 * Advances
 * ========================================================================= */

function mapAdvance(row) {
  return {
    advanceId: asText(row.advance_id),
    date: asText(row.date),
    supplierId: asText(row.supplier_id),
    supplierName: asText(row.supplier_name),
    type: asText(row.type),
    amount: Number(row.amount) || 0,
    note: asText(row.note),
    recordedAt: asText(row.recorded_at)
  };
}

function readAdvances() {
  return memo(SHEET.advances + '::list', function () {
    return readAll(SHEET.advances).map(mapAdvance).filter(function (a) { return a.advanceId; });
  });
}

function apiListAdvances(filter) {
  return applyFilter(readAdvances(), filter).sort(byDateDesc);
}

/** Outstanding advance for every supplier: given minus recovered. */
function advanceBalances(upToDate) {
  return memo(SHEET.advances + '::balances:' + (upToDate || ''), function () {
    var out = {};
    readAdvances().forEach(function (a) {
      if (upToDate && a.date > upToDate) return;
      var key = supplierKey(a.supplierId);
      out[key] = (out[key] || 0) + (a.type === 'Given' ? a.amount : -a.amount);
    });
    Object.keys(out).forEach(function (k) { out[k] = round(out[k], 2); });
    return out;
  });
}

function advanceBalance(supplierId, upToDate) {
  return Number(advanceBalances(upToDate)[supplierKey(supplierId)] || 0);
}

function apiSaveAdvance(input) {
  var date = requireDate(input.date, 'Advance date', 'date');
  var supplier = findSupplier(requireText(input.supplierId, 'Supplier', 'supplierId'));
  if (!supplier) stop('NOT_FOUND', 'No supplier with that ID is on the Suppliers sheet.', 'supplierId');
  var type = requireOneOf(input.type, ADVANCE_TYPES, 'Advance type', 'type');
  var amount = requireNumber(input.amount, 'Amount', 'amount', { gt: 0, max: 1000000, dp: 2 });

  var editingRow = null;
  if (input.advanceId) {
    editingRow = findRowById(SHEET.advances, 'advance_id', input.advanceId);
    if (!editingRow) stop('NOT_FOUND', 'That advance was deleted by someone else. Refresh and enter it again.', 'advanceId');
  }

  if (type === 'Recovered') {
    var balance = advanceBalance(supplier.supplierId);
    if (editingRow && lower(editingRow.supplier_id) === supplier.supplierId.toLowerCase()) {
      // The row being edited no longer counts once it is replaced.
      balance -= asText(editingRow.type) === 'Given' ? Number(editingRow.amount) || 0 : -(Number(editingRow.amount) || 0);
    }
    if (amount > balance + 0.001) {
      stop('VALIDATION',
        supplier.name + ' has an outstanding advance of ' + Math.max(balance, 0).toFixed(2) +
        '. You cannot recover more than that.', 'amount', { balance: round(balance, 2) });
    }
  }

  var record = {
    advance_id: editingRow ? asText(editingRow.advance_id) : newId('ADV'),
    date: date,
    supplier_id: supplier.supplierId,
    supplier_name: supplier.name,
    type: type,
    amount: amount,
    note: asText(input.note).slice(0, 200),
    recorded_at: nowIso()
  };

  if (editingRow) updateRecord(SHEET.advances, editingRow.__row, record);
  else appendRecord(SHEET.advances, record);
  return { advance: mapAdvance(record), created: !editingRow, supplierId: supplier.supplierId, balance: advanceBalance(supplier.supplierId) };
}

/* ========================================================================= *
 * Payments
 * ========================================================================= */

function mapPayment(row) {
  return {
    paymentId: asText(row.payment_id),
    date: asText(row.date),
    supplierId: asText(row.supplier_id),
    supplierName: asText(row.supplier_name),
    periodFrom: asText(row.period_from),
    periodTo: asText(row.period_to),
    milkAmount: Number(row.milk_amount) || 0,
    advanceRecovered: Number(row.advance_recovered) || 0,
    netAmount: Number(row.net_amount) || 0,
    mode: asText(row.mode),
    reference: asText(row.reference),
    note: asText(row.note),
    recordedAt: asText(row.recorded_at)
  };
}

function readPayments() {
  return memo(SHEET.payments + '::list', function () {
    return readAll(SHEET.payments).map(mapPayment).filter(function (p) { return p.paymentId; });
  });
}

function apiListPayments(filter) {
  return applyFilter(readPayments(), filter).sort(byDateDesc);
}

/** Milk earned in a period, minus what has already been paid out for it. */
function apiPaymentDue(supplierId, from, to) {
  var supplier = findSupplier(requireText(supplierId, 'Supplier', 'supplierId'));
  if (!supplier) stop('NOT_FOUND', 'No supplier with that ID is on the Suppliers sheet.', 'supplierId');
  var periodFrom = requireDate(from, 'Period start', 'from');
  var periodTo = requireDate(to, 'Period end', 'to');
  if (periodFrom > periodTo) stop('VALIDATION', 'The period start is after the period end.', 'from');

  var litres = 0, milkAmount = 0, entries = 0, morning = 0, evening = 0;
  applyFilter(readCollections(periodFrom, periodTo), { supplierId: supplier.supplierId }).forEach(function (c) {
    litres += c.litres; milkAmount += c.amount; entries++;
    if (c.shift === 'Morning') morning += c.litres; else evening += c.litres;
  });

  var alreadyPaid = 0, paidCount = 0;
  readPayments().forEach(function (p) {
    if (String(p.supplierId).toLowerCase() !== supplier.supplierId.toLowerCase()) return;
    if (p.periodFrom === periodFrom && p.periodTo === periodTo) { alreadyPaid += p.netAmount + p.advanceRecovered; paidCount++; }
  });

  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.name,
    periodFrom: periodFrom,
    periodTo: periodTo,
    entries: entries,
    litres: round(litres, 2),
    morningLitres: round(morning, 2),
    eveningLitres: round(evening, 2),
    milkAmount: round(milkAmount, 2),
    advanceOutstanding: advanceBalance(supplier.supplierId, periodTo),
    alreadyPaid: round(alreadyPaid, 2),
    paidCount: paidCount,
    suggestedNet: round(Math.max(milkAmount - alreadyPaid, 0), 2)
  };
}

function apiSavePayment(input) {
  var date = requireDate(input.date, 'Payment date', 'date');
  var supplier = findSupplier(requireText(input.supplierId, 'Supplier', 'supplierId'));
  if (!supplier) stop('NOT_FOUND', 'No supplier with that ID is on the Suppliers sheet.', 'supplierId');
  var periodFrom = requireDate(input.periodFrom, 'Period start', 'periodFrom');
  var periodTo = requireDate(input.periodTo, 'Period end', 'periodTo');
  if (periodFrom > periodTo) stop('VALIDATION', 'The period start is after the period end.', 'periodFrom');

  var milkAmount = requireNumber(input.milkAmount, 'Milk amount', 'milkAmount', { min: 0, max: 10000000, dp: 2 });
  var advanceRecovered = requireNumber(input.advanceRecovered, 'Advance recovered', 'advanceRecovered', { optional: true, min: 0, max: 10000000, dp: 2 }) || 0;
  var mode = requireOneOf(input.mode || 'Cash', PAYMENT_MODES, 'Payment mode', 'mode');

  var rows = readAll(SHEET.payments);
  var editingRow = null;
  if (input.paymentId) {
    for (var i = 0; i < rows.length; i++) {
      if (asText(rows[i].payment_id) === asText(input.paymentId)) { editingRow = rows[i]; break; }
    }
    if (!editingRow) stop('NOT_FOUND', 'That payment was deleted by someone else. Refresh and enter it again.', 'paymentId');
  }

  if (advanceRecovered > 0) {
    var outstanding = advanceBalance(supplier.supplierId, periodTo);
    if (editingRow) outstanding += Number(editingRow.advance_recovered) || 0;
    if (advanceRecovered > outstanding + 0.001) {
      stop('VALIDATION',
        supplier.name + ' owes ' + Math.max(outstanding, 0).toFixed(2) + ' in advances as at ' + prettyDate(periodTo) +
        '. You cannot recover ' + advanceRecovered.toFixed(2) + '.', 'advanceRecovered');
    }
  }

  if (advanceRecovered > milkAmount) {
    stop('VALIDATION', 'Advance recovered cannot be more than the milk amount for the period.', 'advanceRecovered');
  }

  // A payment against the same supplier and the same period is almost always a double entry.
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    if (editingRow && r.__row === editingRow.__row) continue;
    if (lower(r.supplier_id) === supplier.supplierId.toLowerCase() &&
        asText(r.period_from) === periodFrom && asText(r.period_to) === periodTo) {
      stop('DUPLICATE',
        supplier.name + ' was already paid for ' + prettyDate(periodFrom) + ' to ' + prettyDate(periodTo) +
        ' (' + Number(r.net_amount).toFixed(2) + ' on ' + prettyDate(asText(r.date)) + '). Open that payment to change it.',
        'periodFrom', { existing: mapPayment(r) });
    }
  }

  var record = {
    payment_id: editingRow ? asText(editingRow.payment_id) : newId('PAY'),
    date: date,
    supplier_id: supplier.supplierId,
    supplier_name: supplier.name,
    period_from: periodFrom,
    period_to: periodTo,
    milk_amount: milkAmount,
    advance_recovered: advanceRecovered,
    net_amount: round(milkAmount - advanceRecovered, 2),
    mode: mode,
    reference: asText(input.reference).slice(0, 60),
    note: asText(input.note).slice(0, 200),
    recorded_at: nowIso()
  };

  if (editingRow) updateRecord(SHEET.payments, editingRow.__row, record);
  else appendRecord(SHEET.payments, record);

  // Recovering an advance through a payment is also an Advances-sheet event,
  // so the outstanding balance stays right no matter which page you look at.
  var advance = null;
  if (!editingRow && advanceRecovered > 0) {
    advance = {
      advance_id: newId('ADV'),
      date: date,
      supplier_id: supplier.supplierId,
      supplier_name: supplier.name,
      type: 'Recovered',
      amount: advanceRecovered,
      note: 'Deducted in payment ' + record.payment_id,
      recorded_at: nowIso()
    };
    appendRecord(SHEET.advances, advance);
  }

  return {
    payment: mapPayment(record),
    created: !editingRow,
    advance: advance ? mapAdvance(advance) : null,
    supplierId: supplier.supplierId,
    balance: advanceBalance(supplier.supplierId)
  };
}

/* ========================================================================= *
 * Sales — milk out — and receipts
 * ========================================================================= */

function mapSale(row) {
  return {
    saleId: asText(row.sale_id),
    date: asText(row.date),
    customerId: asText(row.customer_id),
    customerName: asText(row.customer_name),
    shift: asText(row.shift),
    litres: Number(row.litres) || 0,
    ratePerLitre: Number(row.rate_per_litre) || 0,
    amount: Number(row.amount) || 0,
    note: asText(row.note),
    recordedAt: asText(row.recorded_at)
  };
}

function readSales(from, to) {
  return rowsBetween(SHEET.sales, from, to).map(mapSale).filter(function (s) { return s.saleId; });
}

/** Sales and receipts key on customerId, so applyFilter needs the other name. */
function applyCustomerFilter(rows, filter) {
  var from = filter.from ? asText(filter.from) : null;
  var to = filter.to ? asText(filter.to) : null;
  var customerId = filter.customerId ? lower(filter.customerId) : null;
  var shift = filter.shift ? lower(filter.shift) : null;
  return rows.filter(function (r) {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (customerId && String(r.customerId).toLowerCase() !== customerId) return false;
    if (shift && r.shift && String(r.shift).toLowerCase() !== shift) return false;
    return true;
  });
}

function apiListSales(filter) {
  var rows = applyCustomerFilter(readSales(filter.from ? asText(filter.from) : null, filter.to ? asText(filter.to) : null), filter).sort(byDateDesc);
  var limit = Number(filter.limit) || 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function apiSaveSale(input) {
  var settings = readSettings();
  var saleDate = requireDate(input.date, 'Delivery date', 'date');
  if (settings.allow_future_dates !== 'yes' && saleDate > today()) {
    stop('VALIDATION', 'That date is in the future. Today is ' + prettyDate(today()) + '.', 'date');
  }

  var customerId = requireText(input.customerId, 'Customer', 'customerId');
  var customer = findCustomer(customerId);
  if (!customer) stop('NOT_FOUND', 'No customer with ID "' + customerId + '" is on the Customers sheet. Add them first.', 'customerId');
  if (customer.status === 'Inactive' && !input.saleId) {
    stop('VALIDATION', customer.name + ' is marked Inactive. Set them back to Active on the People page before recording a delivery.', 'customerId');
  }

  var shift = requireOneOf(input.shift, SHIFTS, 'Shift', 'shift');
  var maxLitres = Number(settings.max_litres_per_entry) || 200;
  var litres = requireNumber(input.litres, 'Litres', 'litres', { gt: 0, max: maxLitres, dp: 2 });
  var rate = requireNumber(
    input.ratePerLitre === '' || input.ratePerLitre === undefined || input.ratePerLitre === null
      ? (customer.ratePerLitre || settings.default_sale_rate)
      : input.ratePerLitre,
    'Rate per litre', 'ratePerLitre', { gt: 0, max: 5000, dp: 2 });

  var editingRow = null;
  if (input.saleId) {
    editingRow = findRowById(SHEET.sales, 'sale_id', input.saleId);
    if (!editingRow) stop('NOT_FOUND', 'That delivery was deleted by someone else. Refresh and enter it again.', 'saleId');
  }

  // Same guard as the buy side: one delivery per customer, per date, per shift.
  var r = sameRoundRow(SHEET.sales, saleDate, 'customer_id', customer.customerId, shift, editingRow ? editingRow.__row : null);
  if (r) {
    stop('DUPLICATE',
      customer.name + ' already has a ' + shift + ' delivery for ' + prettyDate(saleDate) +
      ' (' + Number(r.litres) + ' L). Open that delivery to change it, or switch the shift.',
      'shift', { existing: mapSale(r) });
  }

  var previousCustomer = editingRow ? customerKey(editingRow.customer_id) : null;
  var previousAmount = editingRow ? (Number(editingRow.amount) || 0) : 0;
  holdCustomerBalances();
  var record = {
    sale_id: editingRow ? asText(editingRow.sale_id) : newId('SAL'),
    date: saleDate,
    customer_id: customer.customerId,
    customer_name: customer.name,
    shift: shift,
    litres: litres,
    rate_per_litre: rate,
    amount: round(litres * rate, 2),
    note: asText(input.note).slice(0, 200),
    recorded_at: nowIso()
  };

  if (editingRow) updateRecord(SHEET.sales, editingRow.__row, record);
  else appendRecord(SHEET.sales, record);
  if (previousCustomer) moveCustomerBalance(previousCustomer, -previousAmount);
  moveCustomerBalance(customer.customerId, record.amount);
  forgetDay(SHEET.sales, saleDate);
  if (editingRow && asText(editingRow.date) !== saleDate) forgetDay(SHEET.sales, asText(editingRow.date));

  var balances = {};
  balances[customer.customerId] = customerBalance(customer.customerId);
  if (previousCustomer && previousCustomer !== customer.customerId) balances[previousCustomer] = customerBalance(previousCustomer);
  return { sale: mapSale(record), created: !editingRow, customerId: customer.customerId, balance: balances[customer.customerId], balances: balances };
}

function mapReceipt(row) {
  return {
    receiptId: asText(row.receipt_id),
    date: asText(row.date),
    customerId: asText(row.customer_id),
    customerName: asText(row.customer_name),
    amount: Number(row.amount) || 0,
    mode: asText(row.mode),
    reference: asText(row.reference),
    note: asText(row.note),
    recordedAt: asText(row.recorded_at)
  };
}

function readReceipts() {
  return memo(SHEET.receipts + '::list', function () {
    return readAll(SHEET.receipts).map(mapReceipt).filter(function (r) { return r.receiptId; });
  });
}

function apiListReceipts(filter) {
  return applyCustomerFilter(readReceipts(), filter).sort(byDateDesc);
}

/** Adds up one money column per party, reading only the columns it needs. */
function sumByParty(name, idCol, amountCol, upToDate, keyOf) {
  return memo(name + '::sum:' + idCol + ':' + amountCol + ':' + (upToDate || ''), function () {
    var ids = columnValues(name, idCol);
    var amounts = columnValues(name, amountCol);
    var dates = upToDate ? columnValues(name, 'date') : null;
    var out = {};
    for (var i = 0; i < ids.length; i++) {
      var id = asText(ids[i]);
      if (!id) continue;
      if (dates && asText(dates[i]) > upToDate) continue;
      var key = keyOf(id);
      out[key] = (out[key] || 0) + (Number(amounts[i]) || 0);
    }
    return out;
  });
}

/**
 * What every customer owes: everything delivered to them, less everything they
 * have paid. A negative number means they are in credit — they paid ahead.
 *
 * With hundreds of customers and years of deliveries, adding it all up on
 * every save would be slow, so the all-time list is kept in the script cache
 * and moved by each save. It is counted afresh from the sheet every half hour,
 * which also picks up any hand edits made in the sheet.
 */
function customerBalances(upToDate) {
  if (upToDate) return countCustomerBalances(upToDate);
  return memo('balances:customers', function () {
    var hit = cacheGet('bal:customers');
    if (hit) {
      try { return JSON.parse(hit); } catch (err) { /* count again */ }
    }
    var map = countCustomerBalances(null);
    cachePut('bal:customers', JSON.stringify(map), BALANCE_TTL);
    return map;
  });
}

function countCustomerBalances(upToDate) {
  var delivered = sumByParty(SHEET.sales, 'customer_id', 'amount', upToDate, customerKey);
  var paid = sumByParty(SHEET.receipts, 'customer_id', 'amount', upToDate, customerKey);
  var out = {};
  Object.keys(delivered).forEach(function (k) { out[k] = (out[k] || 0) + delivered[k]; });
  Object.keys(paid).forEach(function (k) { out[k] = (out[k] || 0) - paid[k]; });
  Object.keys(out).forEach(function (k) { out[k] = round(out[k], 2); });
  return out;
}

/** Call before writing a sale or receipt, so the balance list reflects the sheet before the write. */
function holdCustomerBalances() { customerBalances(null); }

/** After the write: move one customer's balance and keep the cached list in step. */
function moveCustomerBalance(customerId, delta) {
  if (!delta) return;
  if (!Object.prototype.hasOwnProperty.call(MEMO, 'balances:customers')) {
    // Not loaded before the write — safest is to count afresh next time.
    cacheRemove('bal:customers');
    return;
  }
  var map = MEMO['balances:customers'];
  var key = customerKey(customerId);
  map[key] = round((Number(map[key]) || 0) + delta, 2);
  cachePut('bal:customers', JSON.stringify(map), BALANCE_TTL);
}

function customerBalance(customerId, upToDate) {
  return Number(customerBalances(upToDate)[customerKey(customerId)] || 0);
}

function apiSaveReceipt(input) {
  var date = requireDate(input.date, 'Receipt date', 'date');
  var customer = findCustomer(requireText(input.customerId, 'Customer', 'customerId'));
  if (!customer) stop('NOT_FOUND', 'No customer with that ID is on the Customers sheet.', 'customerId');
  var amount = requireNumber(input.amount, 'Amount', 'amount', { gt: 0, max: 10000000, dp: 2 });
  var mode = requireOneOf(input.mode || 'Cash', PAYMENT_MODES, 'Received by', 'mode');

  var rows = readAll(SHEET.receipts);
  var editingRow = null;
  if (input.receiptId) {
    for (var i = 0; i < rows.length; i++) {
      if (asText(rows[i].receipt_id) === asText(input.receiptId)) { editingRow = rows[i]; break; }
    }
    if (!editingRow) stop('NOT_FOUND', 'That receipt was deleted by someone else. Refresh and enter it again.', 'receiptId');
  }

  // A customer can genuinely pay twice in a day, so an identical amount on the
  // same day is a warning rather than a refusal.
  var warning = null;
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    if (editingRow && r.__row === editingRow.__row) continue;
    if (asText(r.date) === date &&
        lower(r.customer_id) === customer.customerId.toLowerCase() &&
        Math.abs((Number(r.amount) || 0) - amount) < 0.001) {
      warning = customer.name + ' already has a receipt for the same amount on ' + prettyDate(date) +
        '. Saved anyway — delete one if it was entered twice.';
      break;
    }
  }

  holdCustomerBalances();
  var record = {
    receipt_id: editingRow ? asText(editingRow.receipt_id) : newId('RCP'),
    date: date,
    customer_id: customer.customerId,
    customer_name: customer.name,
    amount: amount,
    mode: mode,
    reference: asText(input.reference).slice(0, 60),
    note: asText(input.note).slice(0, 200),
    recorded_at: nowIso()
  };

  if (editingRow) updateRecord(SHEET.receipts, editingRow.__row, record);
  else appendRecord(SHEET.receipts, record);
  if (editingRow) moveCustomerBalance(editingRow.customer_id, Number(editingRow.amount) || 0);
  moveCustomerBalance(customer.customerId, -amount);

  return {
    receipt: mapReceipt(record),
    created: !editingRow,
    warning: warning,
    customerId: customer.customerId,
    balance: customerBalance(customer.customerId)
  };
}

/* ========================================================================= *
 * Reporting
 * ========================================================================= */

function apiReportSummary(filter) {
  var from = filter.from ? asText(filter.from) : null;
  var to = filter.to ? asText(filter.to) : null;
  var collections = applyFilter(readCollections(from, to), filter);
  var sales = applyCustomerFilter(readSales(from, to), filter);
  var perSupplier = {};
  var perDay = {};
  var totals = { litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0 };

  function day(date) {
    return perDay[date] || (perDay[date] = {
      date: date, litres: 0, amount: 0, morningLitres: 0, eveningLitres: 0,
      soldLitres: 0, soldAmount: 0, soldMorningLitres: 0, soldEveningLitres: 0
    });
  }

  collections.forEach(function (c) {
    totals.litres += c.litres;
    totals.amount += c.amount;
    totals.entries++;
    if (c.shift === 'Morning') totals.morningLitres += c.litres; else totals.eveningLitres += c.litres;

    var key = supplierKey(c.supplierId);
    var s = perSupplier[key] || (perSupplier[key] = {
      supplierId: key, supplierName: (findSupplier(key) || {}).name || c.supplierName,
      litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0
    });
    s.litres += c.litres; s.amount += c.amount; s.entries++;
    if (c.shift === 'Morning') s.morningLitres += c.litres; else s.eveningLitres += c.litres;

    var d = day(c.date);
    d.litres += c.litres; d.amount += c.amount;
    if (c.shift === 'Morning') d.morningLitres += c.litres; else d.eveningLitres += c.litres;
  });

  var advancesAt = advanceBalances(to);
  var suppliers = Object.keys(perSupplier).map(function (k) {
    var s = perSupplier[k];
    s.litres = round(s.litres, 2); s.amount = round(s.amount, 2);
    s.morningLitres = round(s.morningLitres, 2); s.eveningLitres = round(s.eveningLitres, 2);
    s.advanceOutstanding = Number(advancesAt[k] || 0);
    s.netPayable = round(s.amount - Math.min(s.amount, Math.max(s.advanceOutstanding, 0)), 2);
    return s;
  }).sort(function (a, b) { return b.litres - a.litres; });

  /* ---- the sell side, same shape ---- */
  var perCustomer = {};
  var saleTotals = { litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0 };

  sales.forEach(function (s) {
    saleTotals.litres += s.litres;
    saleTotals.amount += s.amount;
    saleTotals.entries++;
    if (s.shift === 'Morning') saleTotals.morningLitres += s.litres; else saleTotals.eveningLitres += s.litres;

    var key = customerKey(s.customerId);
    var c = perCustomer[key] || (perCustomer[key] = {
      customerId: key, customerName: (findCustomer(key) || {}).name || s.customerName,
      litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0
    });
    c.litres += s.litres; c.amount += s.amount; c.entries++;
    if (s.shift === 'Morning') c.morningLitres += s.litres; else c.eveningLitres += s.litres;

    var d = day(s.date);
    d.soldLitres += s.litres; d.soldAmount += s.amount;
    if (s.shift === 'Morning') d.soldMorningLitres += s.litres; else d.soldEveningLitres += s.litres;
  });

  var owedAt = customerBalances(to);
  var customers = Object.keys(perCustomer).map(function (k) {
    var c = perCustomer[k];
    c.litres = round(c.litres, 2); c.amount = round(c.amount, 2);
    c.morningLitres = round(c.morningLitres, 2); c.eveningLitres = round(c.eveningLitres, 2);
    c.outstanding = Number(owedAt[k] || 0);
    return c;
  }).sort(function (a, b) { return b.litres - a.litres; });

  var days = Object.keys(perDay).sort().map(function (k) {
    var d = perDay[k];
    ['litres', 'amount', 'morningLitres', 'eveningLitres', 'soldLitres', 'soldAmount', 'soldMorningLitres', 'soldEveningLitres']
      .forEach(function (f) { d[f] = round(d[f], 2); });
    return d;
  });

  return {
    filter: filter,
    totals: {
      litres: round(totals.litres, 2),
      amount: round(totals.amount, 2),
      entries: totals.entries,
      morningLitres: round(totals.morningLitres, 2),
      eveningLitres: round(totals.eveningLitres, 2),
      suppliers: suppliers.length,
      averageRate: totals.litres ? round(totals.amount / totals.litres, 2) : 0
    },
    saleTotals: {
      litres: round(saleTotals.litres, 2),
      amount: round(saleTotals.amount, 2),
      entries: saleTotals.entries,
      morningLitres: round(saleTotals.morningLitres, 2),
      eveningLitres: round(saleTotals.eveningLitres, 2),
      customers: customers.length,
      averageRate: saleTotals.litres ? round(saleTotals.amount / saleTotals.litres, 2) : 0
    },
    margin: {
      litres: round(saleTotals.litres - totals.litres, 2),
      amount: round(saleTotals.amount - totals.amount, 2)
    },
    suppliers: suppliers,
    customers: customers,
    days: days
  };
}

/* ========================================================================= *
 * Start-up data
 * ========================================================================= */

/**
 * The recent part of one entries sheet, for start-up.
 *  rows    — whole rows for the newest days that fit in WINDOW_MAX_ROWS (today always does)
 *  from    — the first date whose rows are all included
 *  days    — totals for each older day of the window that was left out
 *  parties — this month's totals per person for those left-out days
 * A small centre gets every row of the month; a big one gets today's rows and
 * totals for the rest, so the phone never has to download thousands of rows.
 */
function recentData(name, partyCol, mapper, idField, from, todayIso) {
  var hits = dateHits(name, from, function (d) { return d >= from; });
  var byDate = {};
  hits.forEach(function (h) { (byDate[h.date] || (byDate[h.date] = [])).push(h.row); });
  var dates = Object.keys(byDate).sort().reverse();
  var keep = [];
  var budget = WINDOW_MAX_ROWS;
  var complete = from;
  for (var i = 0; i < dates.length; i++) {
    var n = byDate[dates[i]].length;
    if (dates[i] < todayIso && n > budget) { complete = shiftDate(dates[i], 1); break; }
    keep = keep.concat(byDate[dates[i]]);
    budget -= n;
  }
  var rows = readRows(name, keep).map(mapper).filter(function (r) { return r[idField] && r.date; }).sort(byDateDesc);

  var monthStart = todayIso.slice(0, 8) + '01';
  var keyOf = partyCol === 'supplier_id' ? supplierKey : customerKey;
  var days = {};
  var parties = {};
  var missing = [];
  Object.keys(byDate).forEach(function (date) {
    if (date >= complete) return;
    var hit = cacheGet('agg2:' + name + ':' + date);
    var agg = null;
    if (hit) { try { agg = JSON.parse(hit); } catch (err) { agg = null; } }
    if (agg) addDay(date, agg); else missing.push(date);
  });
  if (missing.length) {
    var wanted = [];
    missing.forEach(function (date) { wanted = wanted.concat(byDate[date]); });
    var data = readColumns(name, wanted, [partyCol, 'shift', 'litres', 'amount']);
    missing.forEach(function (date) {
      var t = [0, 0, 0, 0, 0];
      var p = {};
      byDate[date].forEach(function (row) {
        var litres = Number(data.litres[row]) || 0;
        var amount = Number(data.amount[row]) || 0;
        var who = asText(data[partyCol][row]);
        if (!who) return;
        t[0] += litres; t[1] += amount; t[2]++;
        if (asText(data.shift[row]) === 'Morning') t[3] += litres; else t[4] += litres;
        var key = keyOf(who);
        var e = p[key] || (p[key] = [0, 0, 0]);
        e[0] += litres; e[1] += amount; e[2]++;
      });
      var agg = { t: t.map(function (v) { return round(v, 2); }), p: p };
      Object.keys(p).forEach(function (k) { p[k] = [round(p[k][0], 2), round(p[k][1], 2), p[k][2]]; });
      cachePut('agg2:' + name + ':' + date, JSON.stringify(agg), AGG_TTL);
      addDay(date, agg);
    });
  }
  return { rows: rows, from: complete, days: days, parties: parties };

  function addDay(date, agg) {
    days[date] = agg.t;
    if (date < monthStart) return;
    Object.keys(agg.p || {}).forEach(function (k) {
      var e = parties[k] || (parties[k] = [0, 0, 0]);
      e[0] = round(e[0] + agg.p[k][0], 2); e[1] = round(e[1] + agg.p[k][1], 2); e[2] += agg.p[k][2];
    });
  }
}

/** A save or delete on an older day makes that day's remembered totals stale. */
function forgetDay(name, date) {
  if (date) cacheRemove('agg2:' + name + ':' + date);
}

var COLLECTION_FIELDS = ['entryId', 'date', 'supplierId', 'supplierName', 'shift', 'litres', 'fat', 'snf', 'ratePerLitre', 'amount', 'note', 'recordedAt'];
var SALE_FIELDS = ['saleId', 'date', 'customerId', 'customerName', 'shift', 'litres', 'ratePerLitre', 'amount', 'note', 'recordedAt'];
var SUPPLIER_FIELDS = ['supplierId', 'name', 'mobile', 'village', 'ratePerLitre', 'status', 'createdAt'];
var CUSTOMER_FIELDS = ['customerId', 'name', 'mobile', 'address', 'ratePerLitre', 'status', 'createdAt'];

/** Rows as arrays under one list of field names — less than half the size of objects. */
function pack(rows, fields) {
  return {
    fields: fields,
    rows: rows.map(function (r) { return fields.map(function (f) { return r[f] === undefined ? null : r[f]; }); })
  };
}

function windowStart(todayIso) {
  var monthStart = todayIso.slice(0, 8) + '01';
  var back = shiftDate(todayIso, -(WINDOW_MIN_DAYS - 1));
  return monthStart < back ? monthStart : back;
}

function apiBootstrap(options) {
  options = options || {};
  var compact = Number(options.client) >= 2;
  var settings = readSettings();
  var suppliers = readSuppliers();
  var customers = readCustomers();

  var todayIso = today();
  var from = windowStart(todayIso);
  var col = recentData(SHEET.collections, 'supplier_id', mapCollection, 'entryId', from, todayIso);
  var sal = recentData(SHEET.sales, 'customer_id', mapSale, 'saleId', from, todayIso);
  var collections = col.rows;
  var sales = sal.rows;

  var advances = readAdvances().slice().sort(byDateDesc);
  var payments = readPayments().slice().sort(byDateDesc);
  var receipts = readReceipts().slice().sort(byDateDesc);

  // Kept for phones still running the previous version of the app.
  var since = shiftDate(todayIso, -13);
  var recentDays = {};
  function dayBucket(date) {
    return recentDays[date] || (recentDays[date] = {
      date: date, litres: 0, amount: 0, morningLitres: 0, eveningLitres: 0,
      soldLitres: 0, soldAmount: 0, soldMorningLitres: 0, soldEveningLitres: 0
    });
  }
  collections.forEach(function (c) {
    if (c.date < since || c.date > todayIso) return;
    var d = dayBucket(c.date);
    d.litres += c.litres; d.amount += c.amount;
    if (c.shift === 'Morning') d.morningLitres += c.litres; else d.eveningLitres += c.litres;
  });
  sales.forEach(function (s) {
    if (s.date < since || s.date > todayIso) return;
    var d = dayBucket(s.date);
    d.soldLitres += s.litres; d.soldAmount += s.amount;
    if (s.shift === 'Morning') d.soldMorningLitres += s.litres; else d.soldEveningLitres += s.litres;
  });
  Object.keys(col.days).forEach(function (date) {
    if (date < since) return;
    var t = col.days[date], d = dayBucket(date);
    d.litres += t[0]; d.amount += t[1]; d.morningLitres += t[3]; d.eveningLitres += t[4];
  });
  Object.keys(sal.days).forEach(function (date) {
    if (date < since) return;
    var t = sal.days[date], d = dayBucket(date);
    d.soldLitres += t[0]; d.soldAmount += t[1]; d.soldMorningLitres += t[3]; d.soldEveningLitres += t[4];
  });

  var out = {
    version: VERSION,
    settings: settings,
    serverDate: todayIso,
    serverTime: nowIso(),
    timezone: tz(),
    windowFrom: col.from > sal.from ? col.from : sal.from,
    suppliers: suppliers,
    customers: customers,
    advances: advances.slice(0, RECENT_ADVANCES),
    payments: payments.slice(0, RECENT_PAYMENTS),
    receipts: receipts.slice(0, RECENT_RECEIPTS),
    advanceBalances: advanceBalances(null),
    customerBalances: customerBalances(null)
  };
  if (compact) {
    delete out.suppliers;
    delete out.customers;
    out.packed = {
      suppliers: pack(suppliers, SUPPLIER_FIELDS), customers: pack(customers, CUSTOMER_FIELDS),
      collections: pack(collections, COLLECTION_FIELDS), sales: pack(sales, SALE_FIELDS)
    };
    // Per kind: rows are complete from this date; older days come as totals.
    out.windows = { collection: col.from, sale: sal.from };
    out.daily = { collection: col.days, sale: sal.days, fields: ['litres', 'amount', 'entries', 'morningLitres', 'eveningLitres'] };
    out.monthParties = { collection: col.parties, sale: sal.parties, fields: ['litres', 'amount', 'entries'] };
    out.space = sheetSpace();
    return out;
  }
  out.collections = collections;
  out.sales = sales;
  out.recentDays = recentDayList();
  return out;

  function recentDayList() {
    return Object.keys(recentDays).sort().map(function (k) {
      var d = recentDays[k];
      ['litres', 'amount', 'morningLitres', 'eveningLitres', 'soldLitres', 'soldAmount', 'soldMorningLitres', 'soldEveningLitres']
        .forEach(function (f) { d[f] = round(d[f], 2); });
      return d;
    });
  }
}

function shiftDate(iso, days) {
  var p = String(iso).split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() + days);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  var dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + mm + '-' + dd;
}

/* ========================================================================= *
 * Space. Google allows 10 million cells in one spreadsheet, counting empty
 * cells too, and saving stops when the file is full. A busy centre should
 * watch this number.
 * ========================================================================= */

function sheetSpace() {
  var hit = cacheGet('space');
  if (hit) { try { return JSON.parse(hit); } catch (err) { /* count again */ } }
  var cells = 0;
  book().getSheets().forEach(function (sh) { cells += sh.getMaxRows() * sh.getMaxColumns(); });
  var out = { cells: cells, limit: CELL_LIMIT, countedAt: nowIso() };
  cachePut('space', JSON.stringify(out), SPACE_TTL);
  return out;
}

/** Removes completely empty columns to the right of the Dakotax columns. A new tab has 26. */
function trimEmptyColumns(sh, keep) {
  var used = Math.max(sh.getLastColumn(), keep || 1);
  var max = sh.getMaxColumns();
  if (max > used) sh.deleteColumns(used + 1, max - used);
  return max - used;
}

/**
 * Run from the script editor (choose checkSpace, then Run) to see how full the
 * file is. The app shows the same number under Settings.
 */
function checkSpace() {
  cacheRemove('space');
  var s = sheetSpace();
  var pct = Math.round(s.cells / s.limit * 1000) / 10;
  var msg = 'This file uses ' + s.cells.toLocaleString('en-IN') + ' of the ' + s.limit.toLocaleString('en-IN') +
    ' cells Google allows (' + pct + '%).' + (pct >= 80 ? ' It is getting full: move old months to a separate file soon.' : '');
  SpreadsheetApp.getActive().toast(msg, 'Dakotax — space used', 15);
  return msg;
}

/* ========================================================================= *
 * One-time setup — safe to run again
 * ========================================================================= */

function setup() {
  var ss = book();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = HEADERS[name];
    var width = Math.max(sh.getLastColumn(), 1);
    var current = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
    var hasHeader = current.some(function (h) { return h; });
    if (!hasHeader) {
      sh.getRange(1, 1, 1, head.length).setValues([head]);
    } else {
      // Add only the columns that are missing, at the end — never move or delete yours.
      var missing = head.filter(function (h) { return current.indexOf(h) < 0; });
      var lastCol = current.length;
      while (lastCol > 0 && !current[lastCol - 1]) lastCol--;
      missing.forEach(function (h, i) { sh.getRange(1, lastCol + 1 + i).setValue(h); });
    }
    var finalWidth = Math.max(sh.getLastColumn(), head.length);
    sh.getRange(1, 1, 1, finalWidth).setFontWeight('bold').setBackground('#0B5F55').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    // Empty columns still count towards Google's 10-million-cell limit.
    trimEmptyColumns(sh, finalWidth);
  });
  MEMO = {};
  cacheRemove('space');

  // Dates and IDs are stored as plain text so they never shift with a timezone.
  textColumn(SHEET.collections, 'date');
  textColumn(SHEET.advances, 'date');
  textColumn(SHEET.payments, 'date');
  textColumn(SHEET.payments, 'period_from');
  textColumn(SHEET.payments, 'period_to');
  textColumn(SHEET.suppliers, 'supplier_id');
  textColumn(SHEET.collections, 'supplier_id');
  textColumn(SHEET.advances, 'supplier_id');
  textColumn(SHEET.payments, 'supplier_id');

  textColumn(SHEET.sales, 'date');
  textColumn(SHEET.receipts, 'date');
  textColumn(SHEET.customers, 'customer_id');
  textColumn(SHEET.sales, 'customer_id');
  textColumn(SHEET.receipts, 'customer_id');

  dropdown(SHEET.collections, 'shift', SHIFTS);
  dropdown(SHEET.sales, 'shift', SHIFTS);
  dropdown(SHEET.advances, 'type', ADVANCE_TYPES);
  dropdown(SHEET.payments, 'mode', PAYMENT_MODES);
  dropdown(SHEET.receipts, 'mode', PAYMENT_MODES);
  dropdown(SHEET.suppliers, 'status', ['Active', 'Inactive']);
  dropdown(SHEET.customers, 'status', ['Active', 'Inactive']);

  var settingsSheet = ss.getSheetByName(SHEET.settings);
  if (settingsSheet.getLastRow() < 2) {
    settingsSheet.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  }

  var first = ss.getSheets()[0];
  if (first.getName() !== SHEET.suppliers) {
    ss.setActiveSheet(ss.getSheetByName(SHEET.suppliers));
    ss.moveActiveSheet(1);
  }

  SpreadsheetApp.getActive().toast('Dakotax sheets are ready. Deploy the script as a web app next.', 'Setup complete', 8);
  return 'Setup complete: ' + Object.keys(HEADERS).join(', ');
}

function textColumn(sheetName, columnName) {
  var sh = sheet(sheetName);
  var cols = columns(sheetName);
  if (cols.index[columnName] === undefined) return;
  sh.getRange(2, cols.index[columnName] + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
}

function dropdown(sheetName, columnName, values) {
  var sh = sheet(sheetName);
  var cols = columns(sheetName);
  if (cols.index[columnName] === undefined) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true)
    .setAllowInvalid(false)
    .setHelpText('Choose one of: ' + values.join(', '))
    .build();
  sh.getRange(2, cols.index[columnName] + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

/** Adds a few suppliers and customers plus a week of entries on both sides. */
function loadSampleData() {
  var suppliers = [
    ['S001', 'Ravi Kumar', '9876543210', 'Perambakkam', 34],
    ['S002', 'Lakshmi Devi', '9876500011', 'Perambakkam', 34],
    ['S003', 'Murugan S', '9800011122', 'Thiruvallur', 32],
    ['S004', 'Anitha R', '9790011223', 'Thiruvallur', 33]
  ];
  suppliers.forEach(function (s) {
    try { apiSaveSupplier({ supplierId: s[0], name: s[1], mobile: s[2], village: s[3], ratePerLitre: s[4], status: 'Active' }); } catch (err) {}
  });

  var customers = [
    ['C001', 'Sri Balaji Tea Stall', '9840011223', 'Bus stand road', 42],
    ['C002', 'Amman Sweets', '9840033445', 'Market street', 44],
    ['C003', 'Kavitha (household)', '9840055667', 'Gandhi nagar', 46]
  ];
  customers.forEach(function (c) {
    try { apiSaveCustomer({ customerId: c[0], name: c[1], mobile: c[2], address: c[3], ratePerLitre: c[4], status: 'Active' }); } catch (err) {}
  });

  var base = today();
  for (var d = 6; d >= 0; d--) {
    var date = shiftDate(base, -d);
    suppliers.forEach(function (s, i) {
      SHIFTS.forEach(function (shift, k) {
        var litres = round(4 + ((i + k + d) % 5) + Math.random() * 2, 1);
        try {
          apiSaveCollection({ date: date, supplierId: s[0], shift: shift, litres: litres, ratePerLitre: s[4] });
        } catch (err) { /* duplicate on re-run — fine */ }
      });
    });
    customers.forEach(function (c, i) {
      SHIFTS.forEach(function (shift, k) {
        var litres = round(5 + ((i + k + d) % 4) + Math.random() * 2, 1);
        try {
          apiSaveSale({ date: date, customerId: c[0], shift: shift, litres: litres, ratePerLitre: c[4] });
        } catch (err) { /* duplicate on re-run — fine */ }
      });
    });
  }

  try { apiSaveAdvance({ date: shiftDate(base, -5), supplierId: 'S001', type: 'Given', amount: 2000, note: 'Festival advance' }); } catch (err) {}
  try { apiSaveReceipt({ date: shiftDate(base, -3), customerId: 'C001', amount: 1500, mode: 'Cash', note: 'Part payment' }); } catch (err) {}
  return 'Sample data loaded on both sides.';
}

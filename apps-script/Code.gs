/**
 * Dakotax Milk Collection — Google Apps Script API
 * ---------------------------------------------------------------------------
 * Backing store: the Google Sheet this script is bound to.
 * Transport:     doPost (text/plain JSON body) with a doGet/JSONP fallback,
 *                so a static site on GitHub Pages can talk to it without CORS
 *                preflight trouble.
 *
 * Run setup() once from the editor to build the sheets.
 * ---------------------------------------------------------------------------
 */

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

/* ========================================================================= *
 * Entry points
 * ========================================================================= */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var payload = params.payload ? safeParse(params.payload, 'payload') : params;
  var result = route(params.action || payload.action, payload);
  if (params.callback) {
    return ContentService
      .createTextOutput(params.callback + '(' + JSON.stringify(result) + ');')
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

function route(action, payload) {
  payload = payload || {};
  try {
    switch (action) {
      case 'ping':                return ok({ service: 'dakotax-milk', version: '1.0.0', time: nowIso() });
      case 'bootstrap':           return ok(apiBootstrap());

      case 'suppliers.list':      return ok({ suppliers: readSuppliers() });
      case 'suppliers.save':      return ok(apiSaveSupplier(payload.supplier || {}));
      case 'suppliers.setStatus': return ok(apiSetSupplierStatus(payload.supplierId, payload.status));

      case 'collections.list':    return ok({ collections: apiListCollections(payload.filter || {}) });
      case 'collections.save':    return ok(apiSaveCollection(payload.entry || {}));
      case 'collections.delete':  return ok(apiDeleteRow(SHEET.collections, 'entry_id', payload.entryId, 'collection entry'));

      case 'advances.list':       return ok({ advances: apiListAdvances(payload.filter || {}) });
      case 'advances.save':       return ok(apiSaveAdvance(payload.advance || {}));
      case 'advances.delete':     return ok(apiDeleteRow(SHEET.advances, 'advance_id', payload.advanceId, 'advance'));

      case 'payments.list':       return ok({ payments: apiListPayments(payload.filter || {}) });
      case 'payments.save':       return ok(apiSavePayment(payload.payment || {}));
      case 'payments.delete':     return ok(apiDeleteRow(SHEET.payments, 'payment_id', payload.paymentId, 'payment'));
      case 'payments.due':        return ok(apiPaymentDue(payload.supplierId, payload.from, payload.to));

      case 'customers.list':      return ok({ customers: readCustomers() });
      case 'customers.save':      return ok(apiSaveCustomer(payload.customer || {}));
      case 'customers.setStatus': return ok(apiSetCustomerStatus(payload.customerId, payload.status));

      case 'sales.list':          return ok({ sales: apiListSales(payload.filter || {}) });
      case 'sales.save':          return ok(apiSaveSale(payload.sale || {}));
      case 'sales.delete':        return ok(apiDeleteRow(SHEET.sales, 'sale_id', payload.saleId, 'delivery'));

      case 'receipts.list':       return ok({ receipts: apiListReceipts(payload.filter || {}) });
      case 'receipts.save':       return ok(apiSaveReceipt(payload.receipt || {}));
      case 'receipts.delete':     return ok(apiDeleteRow(SHEET.receipts, 'receipt_id', payload.receiptId, 'receipt'));

      case 'reports.summary':     return ok(apiReportSummary(payload.filter || {}));

      case 'settings.save':       return ok(apiSaveSettings(payload.settings || {}));

      default:
        return fail('UNKNOWN_ACTION', action
          ? 'This app asked for "' + action + '", which this script version does not handle. Re-deploy the script from the latest Code.gs.'
          : 'No action was sent. The app and the script may be out of step — re-deploy the script.');
    }
  } catch (err) {
    if (err && err.__api) return { ok: false, error: { code: err.code, message: err.message, field: err.field || null } };
    return fail('SERVER_ERROR', 'The sheet could not complete that request: ' + (err && err.message ? err.message : err));
  }
}

function ok(data) { return { ok: true, data: data || {} }; }
function fail(code, message, field) { return { ok: false, error: { code: code, message: message, field: field || null } }; }
function stop(code, message, field) {
  var err = new Error(message);
  err.__api = true; err.code = code; err.field = field || null;
  throw err;
}

/* ========================================================================= *
 * Sheet plumbing
 * ========================================================================= */

function book() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet(name) {
  var sh = book().getSheetByName(name);
  if (!sh) stop('NO_SHEET', 'The sheet "' + name + '" is missing. Open the script editor and run setup() once to rebuild it.');
  return sh;
}

/** Reads a whole sheet into objects keyed by its header row. */
function readAll(name) {
  var sh = sheet(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue;
    var obj = { __row: r + 1 };
    for (var c = 0; c < head.length; c++) obj[head[c]] = row[c];
    rows.push(obj);
  }
  return rows;
}

function appendRow(name, obj) {
  var sh = sheet(name);
  var head = HEADERS[name];
  sh.appendRow(head.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : obj[k]; }));
}

function updateRow(name, rowNumber, obj) {
  var sh = sheet(name);
  var head = HEADERS[name];
  sh.getRange(rowNumber, 1, 1, head.length)
    .setValues([head.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : obj[k]; })]);
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    stop('BUSY', 'Someone else is saving right now. Wait a moment and try again.');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), tz(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
}

function tz() { return book().getSpreadsheetTimeZone() || 'Asia/Kolkata'; }
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
  var raw = asText(value);
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

/* ========================================================================= *
 * Settings & suppliers
 * ========================================================================= */

function readSettings() {
  var out = {};
  readAll(SHEET.settings).forEach(function (row) {
    var key = asText(row.key);
    if (key) out[key] = asText(row.value);
  });
  DEFAULT_SETTINGS.forEach(function (d) { if (out[d[0]] === undefined) out[d[0]] = d[1]; });
  return out;
}

function apiSaveSettings(incoming) {
  return withLock(function () {
    var sh = sheet(SHEET.settings);
    var rows = readAll(SHEET.settings);
    var index = {};
    rows.forEach(function (r) { index[asText(r.key)] = r.__row; });
    Object.keys(incoming).forEach(function (key) {
      var value = asText(incoming[key]);
      if (index[key]) sh.getRange(index[key], 2).setValue(value);
      else sh.appendRow([key, value, '']);
    });
    return { settings: readSettings() };
  });
}

function readSuppliers() {
  return readAll(SHEET.suppliers).map(function (row) {
    return {
      supplierId: asText(row.supplier_id),
      name: asText(row.name),
      mobile: asText(row.mobile),
      village: asText(row.village),
      ratePerLitre: row.rate_per_litre === '' ? null : Number(row.rate_per_litre),
      status: asText(row.status) || 'Active',
      createdAt: asText(row.created_at)
    };
  }).filter(function (s) { return s.supplierId; });
}

function findSupplier(supplierId) {
  var wanted = asText(supplierId).toLowerCase();
  var all = readSuppliers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].supplierId.toLowerCase() === wanted) return all[i];
  }
  return null;
}

function apiSaveSupplier(input) {
  return withLock(function () {
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
      if (asText(rows[i].supplier_id).toLowerCase() === supplierId.toLowerCase()) { existingRow = rows[i]; break; }
    }

    if (input.mode === 'create' && existingRow) {
      stop('DUPLICATE', 'Supplier ID "' + supplierId + '" already belongs to ' + asText(existingRow.name) + '. Pick a different ID, or open that supplier to edit them.', 'supplierId');
    }

    if (existingRow) {
      record.created_at = asText(existingRow.created_at) || record.created_at;
      updateRow(SHEET.suppliers, existingRow.__row, record);
      return { supplier: findSupplier(supplierId), created: false };
    }
    appendRow(SHEET.suppliers, record);
    return { supplier: findSupplier(supplierId), created: true };
  });
}

function apiSetSupplierStatus(supplierId, status) {
  return withLock(function () {
    var wanted = requireText(supplierId, 'Supplier ID', 'supplierId');
    var nextStatus = requireOneOf(status, ['Active', 'Inactive'], 'Status', 'status');
    var rows = readAll(SHEET.suppliers);
    for (var i = 0; i < rows.length; i++) {
      if (asText(rows[i].supplier_id).toLowerCase() === wanted.toLowerCase()) {
        sheet(SHEET.suppliers).getRange(rows[i].__row, HEADERS.Suppliers.indexOf('status') + 1).setValue(nextStatus);
        return { supplierId: wanted, status: nextStatus };
      }
    }
    stop('NOT_FOUND', 'No supplier with ID "' + wanted + '" was found.', 'supplierId');
  });
}

/* ========================================================================= *
 * Collections
 * ========================================================================= */

function mapCollection(row) {
  return {
    entryId: asText(row.entry_id),
    date: asText(row.date),
    supplierId: asText(row.supplier_id),
    supplierName: asText(row.supplier_name),
    shift: asText(row.shift),
    litres: Number(row.litres) || 0,
    fat: row.fat === '' ? null : Number(row.fat),
    snf: row.snf === '' ? null : Number(row.snf),
    ratePerLitre: Number(row.rate_per_litre) || 0,
    amount: Number(row.amount) || 0,
    note: asText(row.note),
    recordedAt: asText(row.recorded_at)
  };
}

function readCollections() {
  return readAll(SHEET.collections).map(mapCollection).filter(function (c) { return c.entryId; });
}

function applyFilter(rows, filter) {
  var from = filter.from ? asText(filter.from) : null;
  var to = filter.to ? asText(filter.to) : null;
  var supplierId = filter.supplierId ? asText(filter.supplierId).toLowerCase() : null;
  var shift = filter.shift ? asText(filter.shift).toLowerCase() : null;
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
  var rows = applyFilter(readCollections(), filter).sort(byDateDesc);
  var limit = Number(filter.limit) || 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function apiSaveCollection(input) {
  return withLock(function () {
    var settings = readSettings();
    var entryDate = requireDate(input.date, 'Collection date', 'date');
    if (settings.allow_future_dates !== 'yes' && entryDate > today()) {
      stop('VALIDATION', 'That date is in the future. Today is ' + prettyDate(today()) + '.', 'date');
    }

    var supplierId = requireText(input.supplierId, 'Supplier', 'supplierId');
    var supplier = findSupplier(supplierId);
    if (!supplier) stop('NOT_FOUND', 'No supplier with ID "' + supplierId + '" is on the Suppliers sheet. Add them first.', 'supplierId');
    if (supplier.status === 'Inactive' && !input.entryId) {
      stop('VALIDATION', supplier.name + ' is marked Inactive. Set them back to Active on the Suppliers page before recording milk.', 'supplierId');
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

    var rows = readAll(SHEET.collections);
    var editingRow = null;
    if (input.entryId) {
      for (var i = 0; i < rows.length; i++) {
        if (asText(rows[i].entry_id) === asText(input.entryId)) { editingRow = rows[i]; break; }
      }
      if (!editingRow) stop('NOT_FOUND', 'That entry was deleted by someone else. Refresh and enter it again.', 'entryId');
    }

    // Duplicate guard: one entry per date + supplier + shift.
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (editingRow && r.__row === editingRow.__row) continue;
      if (asText(r.date) === entryDate &&
          asText(r.supplier_id).toLowerCase() === supplier.supplierId.toLowerCase() &&
          asText(r.shift).toLowerCase() === shift.toLowerCase()) {
        stop('DUPLICATE',
          supplier.name + ' already has a ' + shift + ' entry for ' + prettyDate(entryDate) +
          ' (' + Number(r.litres) + ' L). Open that entry to change it, or switch the shift.',
          'shift');
      }
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

    if (editingRow) {
      updateRow(SHEET.collections, editingRow.__row, record);
      return { entry: mapCollection(record), created: false };
    }
    appendRow(SHEET.collections, record);
    return { entry: mapCollection(record), created: true };
  });
}

function apiDeleteRow(sheetName, idColumn, idValue, label) {
  return withLock(function () {
    var wanted = requireText(idValue, 'Record ID', 'id');
    var rows = readAll(sheetName);
    for (var i = 0; i < rows.length; i++) {
      if (asText(rows[i][idColumn]) === wanted) {
        sheet(sheetName).deleteRow(rows[i].__row);
        return { deleted: wanted };
      }
    }
    stop('NOT_FOUND', 'That ' + label + ' is no longer on the sheet — someone may have removed it already.', 'id');
  });
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
  return readAll(SHEET.advances).map(mapAdvance).filter(function (a) { return a.advanceId; });
}

function apiListAdvances(filter) {
  return applyFilter(readAdvances(), filter).sort(byDateDesc);
}

function apiSaveAdvance(input) {
  return withLock(function () {
    var date = requireDate(input.date, 'Advance date', 'date');
    var supplier = findSupplier(requireText(input.supplierId, 'Supplier', 'supplierId'));
    if (!supplier) stop('NOT_FOUND', 'No supplier with that ID is on the Suppliers sheet.', 'supplierId');
    var type = requireOneOf(input.type, ADVANCE_TYPES, 'Advance type', 'type');
    var amount = requireNumber(input.amount, 'Amount', 'amount', { gt: 0, max: 1000000, dp: 2 });

    if (type === 'Recovered') {
      var balance = advanceBalance(supplier.supplierId);
      if (amount > balance + 0.001) {
        stop('VALIDATION',
          supplier.name + ' has an outstanding advance of ' + balance.toFixed(2) +
          '. You cannot recover more than that.', 'amount');
      }
    }

    var rows = readAll(SHEET.advances);
    var editingRow = null;
    if (input.advanceId) {
      for (var i = 0; i < rows.length; i++) {
        if (asText(rows[i].advance_id) === asText(input.advanceId)) { editingRow = rows[i]; break; }
      }
      if (!editingRow) stop('NOT_FOUND', 'That advance was deleted by someone else. Refresh and enter it again.', 'advanceId');
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

    if (editingRow) { updateRow(SHEET.advances, editingRow.__row, record); return { advance: mapAdvance(record), created: false }; }
    appendRow(SHEET.advances, record);
    return { advance: mapAdvance(record), created: true };
  });
}

function advanceBalance(supplierId, upToDate) {
  var wanted = String(supplierId).toLowerCase();
  var total = 0;
  readAdvances().forEach(function (a) {
    if (String(a.supplierId).toLowerCase() !== wanted) return;
    if (upToDate && a.date > upToDate) return;
    total += a.type === 'Given' ? a.amount : -a.amount;
  });
  return round(total, 2);
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
  return readAll(SHEET.payments).map(mapPayment).filter(function (p) { return p.paymentId; });
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

  var litres = 0, milkAmount = 0, entries = 0;
  applyFilter(readCollections(), { from: periodFrom, to: periodTo, supplierId: supplier.supplierId }).forEach(function (c) {
    litres += c.litres; milkAmount += c.amount; entries++;
  });

  var alreadyPaid = 0;
  readPayments().forEach(function (p) {
    if (String(p.supplierId).toLowerCase() !== supplier.supplierId.toLowerCase()) return;
    if (p.periodFrom === periodFrom && p.periodTo === periodTo) alreadyPaid += p.netAmount + p.advanceRecovered;
  });

  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.name,
    periodFrom: periodFrom,
    periodTo: periodTo,
    entries: entries,
    litres: round(litres, 2),
    milkAmount: round(milkAmount, 2),
    advanceOutstanding: advanceBalance(supplier.supplierId, periodTo),
    alreadyPaid: round(alreadyPaid, 2),
    suggestedNet: round(milkAmount - alreadyPaid, 2)
  };
}

function apiSavePayment(input) {
  return withLock(function () {
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
          supplier.name + ' owes ' + outstanding.toFixed(2) + ' in advances as at ' + prettyDate(periodTo) +
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
      if (asText(r.supplier_id).toLowerCase() === supplier.supplierId.toLowerCase() &&
          asText(r.period_from) === periodFrom && asText(r.period_to) === periodTo) {
        stop('DUPLICATE',
          supplier.name + ' was already paid for ' + prettyDate(periodFrom) + ' to ' + prettyDate(periodTo) +
          ' (' + Number(r.net_amount).toFixed(2) + ' on ' + prettyDate(asText(r.date)) + '). Open that payment to change it.',
          'periodFrom');
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

    if (editingRow) { updateRow(SHEET.payments, editingRow.__row, record); }
    else { appendRow(SHEET.payments, record); }

    // Recovering an advance through a payment is also an Advances-sheet event,
    // so the outstanding balance stays right no matter which page you look at.
    if (!editingRow && advanceRecovered > 0) {
      appendRow(SHEET.advances, {
        advance_id: newId('ADV'),
        date: date,
        supplier_id: supplier.supplierId,
        supplier_name: supplier.name,
        type: 'Recovered',
        amount: advanceRecovered,
        note: 'Deducted in payment ' + record.payment_id,
        recorded_at: nowIso()
      });
    }

    return { payment: mapPayment(record), created: !editingRow };
  });
}

/* ========================================================================= *
 * Customers — the sell side. Money flows towards us.
 * ========================================================================= */

function readCustomers() {
  return readAll(SHEET.customers).map(function (row) {
    return {
      customerId: asText(row.customer_id),
      name: asText(row.name),
      mobile: asText(row.mobile),
      address: asText(row.address),
      ratePerLitre: row.rate_per_litre === '' ? null : Number(row.rate_per_litre),
      status: asText(row.status) || 'Active',
      createdAt: asText(row.created_at)
    };
  }).filter(function (c) { return c.customerId; });
}

function findCustomer(customerId) {
  var wanted = asText(customerId).toLowerCase();
  var all = readCustomers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].customerId.toLowerCase() === wanted) return all[i];
  }
  return null;
}

function apiSaveCustomer(input) {
  return withLock(function () {
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
      if (asText(rows[i].customer_id).toLowerCase() === customerId.toLowerCase()) { existingRow = rows[i]; break; }
    }

    if (input.mode === 'create' && existingRow) {
      stop('DUPLICATE', 'Customer ID "' + customerId + '" already belongs to ' + asText(existingRow.name) + '. Pick a different ID, or open that customer to edit them.', 'customerId');
    }

    if (existingRow) {
      record.created_at = asText(existingRow.created_at) || record.created_at;
      updateRow(SHEET.customers, existingRow.__row, record);
      return { customer: findCustomer(customerId), created: false };
    }
    appendRow(SHEET.customers, record);
    return { customer: findCustomer(customerId), created: true };
  });
}

function apiSetCustomerStatus(customerId, status) {
  return withLock(function () {
    var wanted = requireText(customerId, 'Customer ID', 'customerId');
    var nextStatus = requireOneOf(status, ['Active', 'Inactive'], 'Status', 'status');
    var rows = readAll(SHEET.customers);
    for (var i = 0; i < rows.length; i++) {
      if (asText(rows[i].customer_id).toLowerCase() === wanted.toLowerCase()) {
        sheet(SHEET.customers).getRange(rows[i].__row, HEADERS.Customers.indexOf('status') + 1).setValue(nextStatus);
        return { customerId: wanted, status: nextStatus };
      }
    }
    stop('NOT_FOUND', 'No customer with ID "' + wanted + '" was found.', 'customerId');
  });
}

/* ---- deliveries ---------------------------------------------------------- */

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

function readSales() {
  return readAll(SHEET.sales).map(mapSale).filter(function (s) { return s.saleId; });
}

/** Sales and receipts key on customerId, so applyFilter needs the other name. */
function applyCustomerFilter(rows, filter) {
  var from = filter.from ? asText(filter.from) : null;
  var to = filter.to ? asText(filter.to) : null;
  var customerId = filter.customerId ? asText(filter.customerId).toLowerCase() : null;
  var shift = filter.shift ? asText(filter.shift).toLowerCase() : null;
  return rows.filter(function (r) {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (customerId && String(r.customerId).toLowerCase() !== customerId) return false;
    if (shift && r.shift && String(r.shift).toLowerCase() !== shift) return false;
    return true;
  });
}

function apiListSales(filter) {
  var rows = applyCustomerFilter(readSales(), filter).sort(byDateDesc);
  var limit = Number(filter.limit) || 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function apiSaveSale(input) {
  return withLock(function () {
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

    var rows = readAll(SHEET.sales);
    var editingRow = null;
    if (input.saleId) {
      for (var i = 0; i < rows.length; i++) {
        if (asText(rows[i].sale_id) === asText(input.saleId)) { editingRow = rows[i]; break; }
      }
      if (!editingRow) stop('NOT_FOUND', 'That delivery was deleted by someone else. Refresh and enter it again.', 'saleId');
    }

    // Same guard as the buy side: one delivery per customer, per date, per shift.
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (editingRow && r.__row === editingRow.__row) continue;
      if (asText(r.date) === saleDate &&
          asText(r.customer_id).toLowerCase() === customer.customerId.toLowerCase() &&
          asText(r.shift).toLowerCase() === shift.toLowerCase()) {
        stop('DUPLICATE',
          customer.name + ' already has a ' + shift + ' delivery for ' + prettyDate(saleDate) +
          ' (' + Number(r.litres) + ' L). Open that delivery to change it, or switch the shift.',
          'shift');
      }
    }

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

    if (editingRow) {
      updateRow(SHEET.sales, editingRow.__row, record);
      return { sale: mapSale(record), created: false };
    }
    appendRow(SHEET.sales, record);
    return { sale: mapSale(record), created: true };
  });
}

/* ---- receipts ------------------------------------------------------------ */

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
  return readAll(SHEET.receipts).map(mapReceipt).filter(function (r) { return r.receiptId; });
}

function apiListReceipts(filter) {
  return applyCustomerFilter(readReceipts(), filter).sort(byDateDesc);
}

/**
 * What a customer owes: everything delivered to them, less everything they have
 * paid. A negative number means they are in credit — they paid ahead.
 */
function customerBalance(customerId, upToDate) {
  var wanted = String(customerId).toLowerCase();
  var owed = 0;
  readSales().forEach(function (s) {
    if (String(s.customerId).toLowerCase() !== wanted) return;
    if (upToDate && s.date > upToDate) return;
    owed += s.amount;
  });
  readReceipts().forEach(function (r) {
    if (String(r.customerId).toLowerCase() !== wanted) return;
    if (upToDate && r.date > upToDate) return;
    owed -= r.amount;
  });
  return round(owed, 2);
}

function apiSaveReceipt(input) {
  return withLock(function () {
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
          asText(r.customer_id).toLowerCase() === customer.customerId.toLowerCase() &&
          Math.abs((Number(r.amount) || 0) - amount) < 0.001) {
        warning = customer.name + ' already has a receipt for the same amount on ' + prettyDate(date) +
          '. Saved anyway — delete one if it was entered twice.';
        break;
      }
    }

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

    if (editingRow) updateRow(SHEET.receipts, editingRow.__row, record);
    else appendRow(SHEET.receipts, record);

    return {
      receipt: mapReceipt(record),
      created: !editingRow,
      warning: warning,
      balance: customerBalance(customer.customerId)
    };
  });
}

/* ========================================================================= *
 * Reporting
 * ========================================================================= */

function apiReportSummary(filter) {
  var collections = applyFilter(readCollections(), filter);
  var sales = applyCustomerFilter(readSales(), filter);
  var perSupplier = {};
  var perDay = {};
  var totals = { litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0 };

  collections.forEach(function (c) {
    totals.litres += c.litres;
    totals.amount += c.amount;
    totals.entries++;
    if (c.shift === 'Morning') totals.morningLitres += c.litres; else totals.eveningLitres += c.litres;

    var s = perSupplier[c.supplierId] || (perSupplier[c.supplierId] = {
      supplierId: c.supplierId, supplierName: c.supplierName,
      litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0
    });
    s.litres += c.litres; s.amount += c.amount; s.entries++;
    if (c.shift === 'Morning') s.morningLitres += c.litres; else s.eveningLitres += c.litres;

    var d = perDay[c.date] || (perDay[c.date] = { date: c.date, litres: 0, amount: 0, morningLitres: 0, eveningLitres: 0 });
    d.litres += c.litres; d.amount += c.amount;
    if (c.shift === 'Morning') d.morningLitres += c.litres; else d.eveningLitres += c.litres;
  });

  var suppliers = Object.keys(perSupplier).map(function (k) {
    var s = perSupplier[k];
    s.litres = round(s.litres, 2); s.amount = round(s.amount, 2);
    s.morningLitres = round(s.morningLitres, 2); s.eveningLitres = round(s.eveningLitres, 2);
    s.advanceOutstanding = advanceBalance(s.supplierId, filter.to || null);
    s.netPayable = round(s.amount - Math.min(s.amount, s.advanceOutstanding), 2);
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

    var c = perCustomer[s.customerId] || (perCustomer[s.customerId] = {
      customerId: s.customerId, customerName: s.customerName,
      litres: 0, amount: 0, entries: 0, morningLitres: 0, eveningLitres: 0
    });
    c.litres += s.litres; c.amount += s.amount; c.entries++;
    if (s.shift === 'Morning') c.morningLitres += s.litres; else c.eveningLitres += s.litres;

    var d = perDay[s.date] || (perDay[s.date] = { date: s.date, litres: 0, amount: 0, morningLitres: 0, eveningLitres: 0 });
    d.soldLitres = (d.soldLitres || 0) + s.litres;
    d.soldAmount = (d.soldAmount || 0) + s.amount;
  });

  var customers = Object.keys(perCustomer).map(function (k) {
    var c = perCustomer[k];
    c.litres = round(c.litres, 2); c.amount = round(c.amount, 2);
    c.morningLitres = round(c.morningLitres, 2); c.eveningLitres = round(c.eveningLitres, 2);
    c.outstanding = customerBalance(c.customerId, filter.to || null);
    return c;
  }).sort(function (a, b) { return b.litres - a.litres; });

  var days = Object.keys(perDay).sort().map(function (k) {
    var d = perDay[k];
    d.litres = round(d.litres, 2); d.amount = round(d.amount, 2);
    d.morningLitres = round(d.morningLitres, 2); d.eveningLitres = round(d.eveningLitres, 2);
    d.soldLitres = round(d.soldLitres || 0, 2); d.soldAmount = round(d.soldAmount || 0, 2);
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

function apiBootstrap() {
  var settings = readSettings();
  var suppliers = readSuppliers();
  var collections = readCollections();
  var advances = readAdvances();
  var payments = readPayments();
  var customers = readCustomers();
  var sales = readSales();
  var receipts = readReceipts();

  var todayIso = today();
  var since = shiftDate(todayIso, -29);

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

  var balances = {};
  advances.forEach(function (a) {
    balances[a.supplierId] = (balances[a.supplierId] || 0) + (a.type === 'Given' ? a.amount : -a.amount);
  });
  Object.keys(balances).forEach(function (k) { balances[k] = round(balances[k], 2); });

  var owed = {};
  sales.forEach(function (s) { owed[s.customerId] = (owed[s.customerId] || 0) + s.amount; });
  receipts.forEach(function (r) { owed[r.customerId] = (owed[r.customerId] || 0) - r.amount; });
  Object.keys(owed).forEach(function (k) { owed[k] = round(owed[k], 2); });

  return {
    settings: settings,
    serverDate: todayIso,
    serverTime: nowIso(),
    timezone: tz(),
    suppliers: suppliers,
    customers: customers,
    collections: collections.sort(byDateDesc).slice(0, 400),
    sales: sales.sort(byDateDesc).slice(0, 400),
    advances: advances.sort(byDateDesc).slice(0, 200),
    payments: payments.sort(byDateDesc).slice(0, 200),
    receipts: receipts.sort(byDateDesc).slice(0, 200),
    advanceBalances: balances,
    customerBalances: owed,
    recentDays: Object.keys(recentDays).sort().map(function (k) {
      var d = recentDays[k];
      d.litres = round(d.litres, 2); d.amount = round(d.amount, 2);
      d.morningLitres = round(d.morningLitres, 2); d.eveningLitres = round(d.eveningLitres, 2);
      d.soldLitres = round(d.soldLitres, 2); d.soldAmount = round(d.soldAmount, 2);
      d.soldMorningLitres = round(d.soldMorningLitres, 2); d.soldEveningLitres = round(d.soldEveningLitres, 2);
      return d;
    })
  };
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
 * One-time setup
 * ========================================================================= */

function setup() {
  var ss = book();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = HEADERS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#0B5F55').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() > head.length) sh.deleteColumns(head.length + 1, sh.getMaxColumns() - head.length);
    sh.autoResizeColumns(1, head.length);
  });

  // Dates and IDs are stored as plain text so they never shift with a timezone.
  textColumn(SHEET.collections, 'date');
  textColumn(SHEET.advances, 'date');
  textColumn(SHEET.payments, 'date');
  textColumn(SHEET.payments, 'period_from');
  textColumn(SHEET.payments, 'period_to');
  textColumn(SHEET.suppliers, 'supplier_id');
  textColumn(SHEET.collections, 'supplier_id');

  textColumn(SHEET.sales, 'date');
  textColumn(SHEET.receipts, 'date');
  textColumn(SHEET.customers, 'customer_id');
  textColumn(SHEET.sales, 'customer_id');

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
  var col = HEADERS[sheetName].indexOf(columnName) + 1;
  if (col < 1) return;
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
}

function dropdown(sheetName, columnName, values) {
  var sh = sheet(sheetName);
  var col = HEADERS[sheetName].indexOf(columnName) + 1;
  if (col < 1) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true)
    .setAllowInvalid(false)
    .setHelpText('Choose one of: ' + values.join(', '))
    .build();
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
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
    apiSaveSupplier({ supplierId: s[0], name: s[1], mobile: s[2], village: s[3], ratePerLitre: s[4], status: 'Active' });
  });

  var customers = [
    ['C001', 'Sri Balaji Tea Stall', '9840011223', 'Bus stand road', 42],
    ['C002', 'Amman Sweets', '9840033445', 'Market street', 44],
    ['C003', 'Kavitha (household)', '9840055667', 'Gandhi nagar', 46]
  ];
  customers.forEach(function (c) {
    apiSaveCustomer({ customerId: c[0], name: c[1], mobile: c[2], address: c[3], ratePerLitre: c[4], status: 'Active' });
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

/* Talking to the Apps Script web app.
 *
 * Apps Script does not answer CORS preflights, so every call goes out as a
 * "simple" POST with a text/plain body. If that is blocked anyway (some
 * networks, some in-app browsers), the same call is retried as JSONP, which no
 * browser treats as cross-origin. Both land on the same router in Code.gs.
 *
 * Every call has a time limit, so a phone on a weak signal is told something
 * went wrong instead of waiting for ever. Writes carry a requestId, so trying
 * again can never make a second row.
 */
window.DX = window.DX || {};

DX.config = (function () {
  var KEY = 'dakotax.apiUrl';

  function stored() { return DX.util.storageGet(KEY) || ''; }

  function read() {
    var fromQuery = '';
    try { fromQuery = new URLSearchParams(location.search).get('api') || ''; } catch (err) { fromQuery = ''; }
    if (fromQuery) { write(fromQuery); stripQuery(); return fromQuery; }
    // A link set on this device wins, so one phone can be pointed at a test
    // sheet; otherwise the link built into the site is used.
    return stored() || window.DAKOTAX_API_URL || '';
  }

  /** True when the link came from the site rather than from this device. */
  function isBuiltIn() { return !stored() && !!window.DAKOTAX_API_URL; }

  function write(url) { DX.util.storageSet(KEY, String(url || '').trim()); }

  function clearStored() { DX.util.storageRemove(KEY); }

  function stripQuery() {
    if (!history.replaceState) return;
    try {
      var url = new URL(location.href);
      url.searchParams.delete('api');
      history.replaceState(history.state, '', url.toString());
    } catch (err) { /* old browser — the link still works */ }
  }

  function looksValid(url) {
    return /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec/.test(String(url || '').trim());
  }

  return { get: read, set: write, clear: clearStored, looksValid: looksValid, isBuiltIn: isBuiltIn };
})();

DX.api = (function () {
  var jsonpSeq = 0;
  var preferJsonp = false;

  function error(message, code, extra) {
    var err = new Error(message);
    err.code = code || 'SERVER_ERROR';
    if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
    return err;
  }

  /** Network trouble rather than the sheet saying no: worth trying again later. */
  function transport(message, code) {
    return error(message, code || 'NETWORK', { transport: true });
  }

  function endpoint() {
    var url = DX.config.get();
    if (!url) throw error('This app is not connected to a Google Sheet yet. Open Settings and paste the web-app link.', 'NO_ENDPOINT');
    return url;
  }

  function apiError(result) {
    var info = (result && result.error) || {};
    return error(info.message || 'The sheet refused that request.', info.code || 'SERVER_ERROR', {
      field: info.field || null,
      details: info.details || null
    });
  }

  function viaPost(url, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctrl) ctrl.abort();
        reject(transport('The sheet did not answer in ' + Math.round(timeoutMs / 1000) + ' seconds.', 'TIMEOUT'));
      }, timeoutMs);

      fetch(url, {
        method: 'POST',
        redirect: 'follow',
        cache: 'no-store',
        // text/plain keeps this a "simple request" — no CORS preflight.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw transport('The script replied with HTTP ' + res.status + '.', 'HTTP_' + res.status);
        return res.text();
      }).then(function (text) {
        var parsed;
        try { parsed = JSON.parse(text); }
        catch (err) {
          throw transport('The link did not return app data. Check that it ends in /exec and that access is set to "Anyone".', 'BAD_RESPONSE');
        }
        if (done) return;
        done = true; clearTimeout(timer); resolve(parsed);
      }).catch(function (err) {
        if (done) return;
        done = true; clearTimeout(timer);
        reject(err && err.transport ? err : transport('Could not reach the sheet. Check the internet connection.', 'NETWORK'));
      });
    });
  }

  function viaJsonp(url, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var name = '__dxcb' + (++jsonpSeq) + '_' + Date.now();
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        reject(transport('The sheet did not answer in ' + Math.round(timeoutMs / 1000) + ' seconds.', 'TIMEOUT'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        // Leave a harmless stub behind in case the answer arrives after we gave up.
        window[name] = function () { delete window[name]; };
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[name] = function (result) { cleanup(); resolve(result); };

      var query = new URLSearchParams({ callback: name, payload: JSON.stringify(payload) });
      script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + query.toString();
      script.onerror = function () {
        cleanup();
        reject(transport('The web-app link could not be reached. Check the connection and that access is "Anyone".', 'NETWORK'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * call('collections.save', { entry: {...}, requestId: '...' }, { timeout: 45000 })
   * Resolves with the data the sheet sent back; rejects with an Error carrying
   * .code (VALIDATION, DUPLICATE, …), .field, .details, and .transport when it
   * was the connection rather than the sheet.
   */
  function call(action, payload, options) {
    options = options || {};
    var url;
    try { url = endpoint(); } catch (err) { return Promise.reject(err); }

    var timeoutMs = options.timeout || 30000;
    var body = Object.assign({ action: action }, payload || {});
    var first = preferJsonp ? viaJsonp : viaPost;
    var second = preferJsonp ? viaPost : viaJsonp;

    return first(url, body, timeoutMs)
      .catch(function (err) {
        if (!err || !err.transport) throw err;
        // A connection problem, not an app problem — try the other road once.
        return second(url, body, timeoutMs).then(function (result) {
          preferJsonp = !preferJsonp;
          return result;
        }, function () { throw err; });
      })
      .then(function (result) {
        if (!result || typeof result !== 'object') {
          throw transport('The sheet sent back something this app could not read.', 'BAD_RESPONSE');
        }
        if (result.ok === false) throw apiError(result);
        return result.data || {};
      });
  }

  return {
    call: call,
    apiError: apiError,
    ping: function () { return call('ping', {}, { timeout: 20000 }); }
  };
})();

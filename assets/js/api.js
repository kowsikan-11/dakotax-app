/* Talking to the Apps Script web app.
 *
 * Apps Script does not answer CORS preflights, so every write goes out as a
 * "simple" POST with a text/plain body. If that is blocked anyway (some
 * corporate networks, some in-app browsers), the same call is retried as
 * JSONP, which no browser treats as cross-origin. Both land on the same
 * router in Code.gs.
 */
window.DX = window.DX || {};

DX.config = (function () {
  var KEY = 'dakotax.apiUrl';

  function read() {
    var fromQuery = new URLSearchParams(location.search).get('api');
    if (fromQuery) { write(fromQuery); stripQuery(); return fromQuery; }
    if (window.DAKOTAX_API_URL) return window.DAKOTAX_API_URL;
    try { return localStorage.getItem(KEY) || ''; } catch (err) { return ''; }
  }

  function write(url) {
    try { localStorage.setItem(KEY, String(url || '').trim()); } catch (err) { /* private mode */ }
  }

  function clearStored() {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  }

  function stripQuery() {
    if (!history.replaceState) return;
    var url = new URL(location.href);
    url.searchParams.delete('api');
    history.replaceState({}, '', url.toString());
  }

  function looksValid(url) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(String(url || '').trim());
  }

  return { get: read, set: write, clear: clearStored, looksValid: looksValid };
})();

DX.api = (function () {
  var jsonpSeq = 0;
  var preferJsonp = false;

  function endpoint() {
    var url = DX.config.get();
    if (!url) {
      var err = new Error('This app is not connected to a Google Sheet yet. Open Settings and paste the web-app link.');
      err.code = 'NO_ENDPOINT';
      throw err;
    }
    return url;
  }

  function apiError(result) {
    var info = (result && result.error) || {};
    var err = new Error(info.message || 'The sheet refused that request.');
    err.code = info.code || 'SERVER_ERROR';
    err.field = info.field || null;
    return err;
  }

  function viaPost(url, payload) {
    return fetch(url, {
      method: 'POST',
      redirect: 'follow',
      // text/plain keeps this a "simple request" — no CORS preflight.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('The script replied with HTTP ' + res.status + '.');
      return res.text();
    }).then(function (text) {
      try { return JSON.parse(text); }
      catch (err) {
        throw new Error('The link did not return app data. Check that it ends in /exec and that access is set to "Anyone".');
      }
    });
  }

  function viaJsonp(url, payload) {
    return new Promise(function (resolve, reject) {
      var name = '__dxcb' + (++jsonpSeq) + '_' + Date.now();
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('The sheet did not answer in 25 seconds. Check the connection and the web-app link.'));
      }, 25000);

      function cleanup() {
        clearTimeout(timer);
        delete window[name];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[name] = function (result) { cleanup(); resolve(result); };

      var query = new URLSearchParams({ callback: name, payload: JSON.stringify(payload) });
      script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + query.toString();
      script.onerror = function () {
        cleanup();
        reject(new Error('The web-app link could not be reached. Check that the deployment access is "Anyone".'));
      };
      document.head.appendChild(script);
    });
  }

  function call(action, payload) {
    var url;
    try { url = endpoint(); } catch (err) { return Promise.reject(err); }

    var body = Object.assign({ action: action }, payload || {});
    var first = preferJsonp ? viaJsonp : viaPost;
    var second = preferJsonp ? viaPost : viaJsonp;

    return first(url, body)
      .catch(function (err) {
        // A transport problem, not an app problem — try the other road once.
        return second(url, body).then(function (result) {
          preferJsonp = !preferJsonp;
          return result;
        }, function () { throw err; });
      })
      .then(function (result) {
        if (!result || typeof result !== 'object') {
          throw new Error('The sheet sent back something this app could not read.');
        }
        if (result.ok === false) throw apiError(result);
        return result.data || {};
      });
  }

  return {
    call: call,
    ping: function () { return call('ping'); },
    bootstrap: function () { return call('bootstrap'); }
  };
})();

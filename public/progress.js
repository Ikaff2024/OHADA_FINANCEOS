// Lightweight global loading indicator: shows a thin top progress bar while any
// network request is in flight. Loaded as a classic script before app.js so it
// patches window.fetch before the app makes any request. No dependencies.
(function () {
  if (window.__ohadaProgressInstalled) return;
  window.__ohadaProgressInstalled = true;

  var bar = document.createElement("div");
  bar.id = "global-progress";
  bar.setAttribute("aria-hidden", "true");

  function mount() {
    if (!bar.isConnected && document.body) document.body.appendChild(bar);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  var active = 0;
  function start() {
    active += 1;
    mount();
    bar.classList.add("is-active");
  }
  function done() {
    active = Math.max(0, active - 1);
    if (active === 0) bar.classList.remove("is-active");
  }

  var nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  if (!nativeFetch) return;

  window.fetch = function () {
    start();
    var promise;
    try {
      promise = nativeFetch.apply(null, arguments);
    } catch (error) {
      done();
      throw error;
    }
    return promise.then(
      function (response) {
        done();
        return response;
      },
      function (error) {
        done();
        throw error;
      }
    );
  };
})();

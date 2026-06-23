// Client feedback layer (no dependencies, CSP-friendly, loaded before app.js):
//  - a thin top progress bar while any network request is in flight
//  - window.toast(message, type) animated notifications
//  - a toast on network failure (no response from server)
//  - reports uncaught JS errors to the server (/api/client-errors)
(function () {
  if (window.__ohadaFeedbackInstalled) return;
  window.__ohadaFeedbackInstalled = true;

  // ---- Progress bar -------------------------------------------------------
  var bar = document.createElement("div");
  bar.id = "global-progress";
  bar.setAttribute("aria-hidden", "true");

  var toastWrap = document.createElement("div");
  toastWrap.id = "toast-container";
  toastWrap.setAttribute("aria-live", "polite");

  function mount() {
    if (!document.body) return;
    if (!bar.isConnected) document.body.appendChild(bar);
    if (!toastWrap.isConnected) document.body.appendChild(toastWrap);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  // When a form submit triggers a network request, disable its submit button
  // until the network is idle again — prevents duplicate submissions (e.g. a
  // double-click creating a journal entry twice).
  var pendingSubmitBtn = null;
  document.addEventListener(
    "submit",
    function (event) {
      var form = event.target;
      if (!form || form.tagName !== "FORM") return;
      pendingSubmitBtn =
        event.submitter || form.querySelector('button[type="submit"], button:not([type])');
      // If no request starts in this tick (e.g. client-side validation failed),
      // drop the reference so the button is never left disabled.
      setTimeout(function () {
        pendingSubmitBtn = null;
      }, 0);
    },
    true
  );

  var active = 0;
  function start() {
    active += 1;
    mount();
    bar.classList.add("is-active");
    if (pendingSubmitBtn) {
      var btn = pendingSubmitBtn;
      pendingSubmitBtn = null;
      if (!btn.disabled) {
        btn.disabled = true;
        btn.setAttribute("data-submit-busy", "1");
      }
    }
  }
  function done() {
    active = Math.max(0, active - 1);
    if (active === 0) {
      bar.classList.remove("is-active");
      var busy = document.querySelectorAll('[data-submit-busy="1"]');
      for (var i = 0; i < busy.length; i += 1) {
        busy[i].disabled = false;
        busy[i].removeAttribute("data-submit-busy");
      }
    }
  }

  // ---- Toasts -------------------------------------------------------------
  window.toast = function (message, type) {
    if (!message) return;
    mount();
    if (!toastWrap.isConnected) return;
    var toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "info");
    toast.setAttribute("role", "status");
    toast.textContent = String(message);
    toastWrap.appendChild(toast);
    // Trigger enter transition on next frame.
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    var ttl = type === "error" ? 6000 : 3500;
    var timer = setTimeout(dismiss, ttl);
    function dismiss() {
      clearTimeout(timer);
      toast.classList.remove("is-visible");
      setTimeout(function () {
        if (toast.isConnected) toast.remove();
      }, 250);
    }
    toast.addEventListener("click", dismiss);
    // Cap the number of visible toasts.
    while (toastWrap.children.length > 4) toastWrap.removeChild(toastWrap.firstChild);
  };

  // ---- fetch wrapper ------------------------------------------------------
  var nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  if (nativeFetch) {
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
          // Network-level failure (no response). App handlers can't show this.
          window.toast("Connexion au serveur impossible. Verifiez votre reseau.", "error");
          throw error;
        }
      );
    };
  }

  // ---- Client error reporting --------------------------------------------
  var reported = 0;
  function report(payload) {
    if (reported >= 20 || !nativeFetch) return; // avoid floods
    reported += 1;
    try {
      nativeFetch("/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  window.addEventListener("error", function (event) {
    report({
      kind: "error",
      message: String(event.message || "").slice(0, 500),
      source: String(event.filename || "").slice(0, 300),
      line: event.lineno || 0,
      column: event.colno || 0,
      stack: event.error && event.error.stack ? String(event.error.stack).slice(0, 2000) : "",
      url: location.href,
      userAgent: navigator.userAgent
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason || {};
    report({
      kind: "unhandledrejection",
      message: String(reason.message || reason || "").slice(0, 500),
      stack: reason.stack ? String(reason.stack).slice(0, 2000) : "",
      url: location.href,
      userAgent: navigator.userAgent
    });
  });
})();

const ANALYTICS_PAGEVIEW_ENDPOINT = 'https://analytics.hikaru.org/pageview';
const ANALYTICS_HEARTBEAT_ENDPOINT = 'https://analytics.hikaru.org/heartbeat';
const ANALYTICS_DELETE_PAGEVIEW_ENDPOINT = 'https://analytics.hikaru.org/pageview/delete';
const ANALYTICS_IDLE_THRESHOLD_MS     = 30000;   // after 30s without input, pause
const ANALYTICS_HEARTBEAT_INTERVAL_MS = 4000;

// --- State ---
let analyticsEngaged = false;
let analyticsLastTick = performance.now();
let analyticsAccumulatedMs = 0;
let analyticsIdleTimer = null;
let analyticsTimeSpentOnPage = 0;

function analyticsIsOptOut() {
  return localStorage.getItem('analyticsOptOut') === "true";
}

function analyticsPathWithQuery(loc) {
  try {
    return (loc.pathname || '/') + (loc.search || '');
  } catch (_) {
    return '/';
  }
}

function analyticsInstallAnalyticsSquare() {
  if (!document.getElementById('analyticsSquare')) {
    const square = document.createElement('div');
    square.id = 'analyticsSquare';
    square.style = 'position: fixed; top: 0; left: 0; width: 1em; height: 1em; background-color: rgba(0, 0, 0, 0.5); z-index: 1000000;';
    document.body.appendChild(square);
  }
}

async function analyticsDeletePageview() {
  const sessionId = localStorage.getItem('analyticsSessionId');
  if (!sessionId) return;
  try {
    await fetch(ANALYTICS_DELETE_PAGEVIEW_ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({ session_id: sessionId }),
      keepalive: true,
    });
  } catch (_) {}
}

function analyticsOptOut() {
  localStorage.setItem('analyticsOptOut', 'true');
  analyticsInstallAnalyticsSquare();
  analyticsDeletePageview();
  alert('Analytics opt-out set for this site.');
}

function analyticsIsBot() {
  var nav = window.navigator || {};
  var ua = (nav.userAgent || "").toLowerCase();
  return !!(
    ua.includes("bot") ||
    ua.includes("crawl") ||
    ua.includes("crawler") ||
    ua.includes("spider") ||
    ua.includes("headless") ||
    ua.includes("uptime") ||
    ua.includes("monitor") ||
    nav.webdriver
  );
}

function analyticsGetScriptEl() {
  let scriptEl = document.currentScript;
  if (!scriptEl) {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && /^https:\/\/analytics\.hikaru\.org\/embed\.js(\?.*)?$/.test(scripts[i].src)) {
        scriptEl = scripts[i];
        break;
      }
    }
  }
  return scriptEl;
}

async function analyticsInitializePageview(userToken, domain, path) {
  let pageviewToken = null;
  let sessionId = localStorage.getItem('analyticsSessionId');

  const params = new URLSearchParams();
  params.append('token', userToken);
  params.append('domain', domain);
  params.append('path', path);
  if (sessionId) {
    params.append("session_id", sessionId);
  }

  try {
    const response = await fetch(ANALYTICS_PAGEVIEW_ENDPOINT, {
      method: 'POST',
      body: params,
      keepalive: true,
    });
    const data = await response.json();
    pageviewToken = data.token;
    sessionId = data.session_id;
  } catch (_) {}
  return [pageviewToken, sessionId];
}


function analyticsStartClock() {
  if (analyticsEngaged) return;
  analyticsEngaged = true;
  analyticsLastTick = performance.now();
  analyticsScheduleIdleCheck();
}

function analyticsStopClock() {
  if (!analyticsEngaged) return;
  analyticsAccumulatedMs += performance.now() - analyticsLastTick;
  analyticsEngaged = false;
  analyticsClearIdleCheck();
}

function analyticsScheduleIdleCheck() {
  analyticsClearIdleCheck();
  analyticsIdleTimer = setTimeout(() => {
    // user idle -> pause
    analyticsStopClock();
  }, ANALYTICS_IDLE_THRESHOLD_MS);
}

function analyticsClearIdleCheck() {
  if (analyticsIdleTimer) { clearTimeout(analyticsIdleTimer); analyticsIdleTimer = null; }
}

function analyticsUserActivity() {
  // any input resets idle timer and ensures running if visible
  if (!document.hidden) {
    if (!analyticsEngaged) analyticsStartClock();
    else analyticsScheduleIdleCheck();
  }
}

function analyticsTickVisibility(pageviewToken) {
  if (document.hidden) {
    analyticsStopClock();
    analyticsFlush(pageviewToken);
  } else {
    analyticsStartClock();
  }
}

function analyticsFlush(pageviewToken) {
  if (!pageviewToken) return;
  if (analyticsIsOptOut()) {
    analyticsInstallAnalyticsSquare();
    return;
  }
  if (analyticsIsBot()) return;
  const ms = Math.round(analyticsAccumulatedMs);
  if (ms <= 0) return;
  analyticsAccumulatedMs = 0;

  analyticsTimeSpentOnPage += Math.round(ms/1000);

  const params = new URLSearchParams();
  params.append('token', pageviewToken);
  params.append('time_spent_on_page', analyticsTimeSpentOnPage);

  // Try to use sendBeacon first
  if (!(navigator.sendBeacon && navigator.sendBeacon(ANALYTICS_HEARTBEAT_ENDPOINT, params))) {
    // sendBeacon not available or failed, use fetch as fallback
    try {
      fetch(ANALYTICS_HEARTBEAT_ENDPOINT, {
        method: 'POST',
        body: params,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Fallback for older browsers that might not support fetch or sendBeacon
    }
  }
}

function analyticsHeartbeat(pageviewToken) {
  if (analyticsEngaged) {
    // capture up-to-this-moment time without stopping the clock
    const t = performance.now();
    const delta = t - analyticsLastTick;
    analyticsAccumulatedMs += delta;
    analyticsLastTick = t;
  }
  if (analyticsAccumulatedMs > 0) {
    analyticsFlush(pageviewToken);
  }
}

function analyticsOnPagehide(pageviewToken) {
  analyticsStopClock();
  analyticsFlush(pageviewToken);
}

(async function () {
  try {
    if (analyticsIsOptOut()) {
      document.addEventListener('DOMContentLoaded', function () {
        analyticsInstallAnalyticsSquare();
      });
      return;
    }
    if (analyticsIsBot()) return;

    const scriptEl = analyticsGetScriptEl();
    if (!scriptEl) return;

    const userToken = scriptEl.dataset.token || '';
    if (!userToken) return;

    const loc = window.location || {};
    const domain = loc.hostname;
    const path = analyticsPathWithQuery(loc);

    if (!domain) return;

    let [pageviewToken, sessionId] = await analyticsInitializePageview(userToken, domain, path);

    localStorage.setItem('analyticsSessionId', sessionId);

    // --- Wire up events ---
    // Start if visible on load
    if (!document.hidden) analyticsStartClock();

    // User activity signals (reset idle + start if needed)
    ["pointerdown","mousemove","pointermove","keydown","wheel","touchstart","scroll"].forEach(evt =>
      window.addEventListener(evt, analyticsUserActivity, { passive: true })
    );

    // Visibility / lifecycle
    document.addEventListener("visibilitychange", () => analyticsTickVisibility(pageviewToken));
    window.addEventListener("focus", () => { if (!document.hidden) analyticsStartClock(); });

    // Page being put into bfcache or closed
    window.addEventListener("pagehide", () => analyticsOnPagehide(pageviewToken));
    // Safari sometimes only fires beforeunload reliably
    window.addEventListener("beforeunload", () => { analyticsStopClock(); analyticsFlush(pageviewToken); });

    // calculate and send heartbeat data every 4 seconds
    setInterval(analyticsHeartbeat, ANALYTICS_HEARTBEAT_INTERVAL_MS, pageviewToken);

    // --- SPA support (optional but recommended) ---
    // If you use a router, call window.__trackRouteChange() manually on each route change.
    // The code below auto-instruments pushState/replaceState/popstate for vanilla SPAs.
    (function instrumentHistory() {
      function routeChanged() {
        analyticsStopClock();
        analyticsFlush(pageviewToken);
        analyticsTickVisibility(pageviewToken);
      }
      const wrap = (fnName) => {
        const orig = history[fnName];
        history[fnName] = function () {
          const rv = orig.apply(this, arguments);
          routeChanged();
          return rv;
        };
      };
      wrap("pushState");
      wrap("replaceState");
      window.addEventListener("popstate", () => routeChanged());
      window.__trackRouteChange = () => routeChanged();
    })();
  } catch (_) {}
})();

const ANALYTICS_PAGEVIEW_ENDPOINT = 'https://modestanalytics.com/pageview';
const ANALYTICS_HEARTBEAT_ENDPOINT = 'https://modestanalytics.com/heartbeat';
const ANALYTICS_DELETE_PAGEVIEW_ENDPOINT = 'https://modestanalytics.com/pageview/delete';

let analyticsSessionId = null;
let analyticsTimeSpentOnPage = 0;
let analyticsLastActivityTime = Date.now();
const analyticsInitialReferrer = document.referrer || ''; // Record initial referrer, default to empty string

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

function analyticsUpdateActivityTime() {
  analyticsLastActivityTime = Date.now();
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
  if (!analyticsSessionId) return;
  try {
    await fetch(ANALYTICS_DELETE_PAGEVIEW_ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({ session_id: analyticsSessionId }),
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

function analyticsGetScriptEl() {
  let scriptEl = document.currentScript;
  if (!scriptEl) {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && /^https:\/\/modestanalytics.com\/embed\.js(\?.*)?$/.test(scripts[i].src)) {
        scriptEl = scripts[i];
        break;
      }
    }
  }
  return scriptEl;
}

async function analyticsInitializePageview(userToken, domain, path, initialReferrer) {
  let pageviewToken = null;
  let sessionId = null;
  const params = new URLSearchParams();
  params.append('token', userToken);
  params.append('domain', domain);
  params.append('path', path);
  params.append('referrer', initialReferrer);
  if (analyticsSessionId) {
    params.append("session_id", analyticsSessionId);
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

function analyticsHeartbeat(pageviewToken) {
  if (!pageviewToken) return;
  if (analyticsIsOptOut()) {
    analyticsInstallAnalyticsSquare();
    return;
  }

  if (analyticsLastActivityTime > Date.now() - 30000) {
    analyticsTimeSpentOnPage += 4;
  }

  const params = new URLSearchParams();
  params.append('token', pageviewToken);
  params.append('time_spent_on_page', analyticsTimeSpentOnPage);

  // Try to use sendBeacon first
  if (navigator.sendBeacon && navigator.sendBeacon(ANALYTICS_HEARTBEAT_ENDPOINT, params)) {
    // Data successfully queued by sendBeacon
  } else {
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

(async function () {
  try {
    if (analyticsIsOptOut()) {
      document.addEventListener('DOMContentLoaded', function () {
        analyticsInstallAnalyticsSquare();
      });
      return;
    }

    const scriptEl = analyticsGetScriptEl();
    if (!scriptEl) return;

    const userToken = scriptEl.dataset.token || '';
    if (!userToken) return;

    document.addEventListener('mousemove', analyticsUpdateActivityTime);
    document.addEventListener('keydown', analyticsUpdateActivityTime);
    document.addEventListener('scroll', analyticsUpdateActivityTime);

    const loc = window.location || {};
    const domain = loc.hostname;
    const path = analyticsPathWithQuery(loc);

    if (!domain) return;

    analyticsSessionId = localStorage.getItem('analyticsSessionId');

    let [pageviewToken, sessionId] = await analyticsInitializePageview(userToken, domain, path, analyticsInitialReferrer);

    localStorage.setItem('analyticsSessionId', sessionId);
    analyticsSessionId = sessionId;

    // calculate and send heartbeat data every 4 seconds
    setInterval(() => analyticsHeartbeat(pageviewToken), 4000);

  } catch (_) {}
})();

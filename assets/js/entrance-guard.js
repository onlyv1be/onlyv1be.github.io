(() => {
  'use strict';

  const apiDebug = new URLSearchParams(window.location.search).get('debug') === 'api';
  window.__onlyv1beApiDebug = apiDebug;
  const debugApi = (event, details) => {
    if (apiDebug) console.info(`[API debug] ${event}`, JSON.stringify(details));
  };

  // Admin access lasts only until the page is reloaded.
  sessionStorage.removeItem('onlyv1be-admin-token');

  // Retry read-only API requests because some networks reset the first TLS
  // connections. Mutating requests are never retried to avoid duplicate writes.
  if (!window.__onlyv1beFetchGuard) {
    window.__onlyv1beFetchGuard = true;
    const nativeFetch = window.fetch.bind(window);
    const API_PREFIX = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
      ? `${location.origin}/api/`
      : 'https://oxae.run.place/';
    // The local proxy can retry upstream TLS failures before replying.
    const REQUEST_TIMEOUT_MS = API_PREFIX.startsWith(location.origin + '/') ? 16000 : 7000;
    const GET_ATTEMPTS = 3;

    window.fetch = async (resource, options = {}) => {
      const url = typeof resource === 'string' ? resource : resource?.url || '';
      if (!url.startsWith(API_PREFIX)) return nativeFetch(resource, options);

      const method = String(options.method || resource?.method || 'GET').toUpperCase();
      const attempts = method === 'GET' ? GET_ATTEMPTS : 1;
      let lastError;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const startedAt = performance.now();
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const abortFromCaller = () => controller.abort();

        if (options.signal) {
          if (options.signal.aborted) controller.abort();
          else options.signal.addEventListener('abort', abortFromCaller, { once: true });
        }

        try {
          debugApi('request', { method, url, attempt, attempts });
          const response = await nativeFetch(resource, { ...options, signal: controller.signal });
          debugApi('response', {
            method,
            url,
            attempt,
            status: response.status,
            elapsedMs: Math.round(performance.now() - startedAt)
          });
          return response;
        } catch (error) {
          lastError = error;
          debugApi('failure', {
            method,
            url,
            attempt,
            name: error?.name || 'Error',
            message: error?.message || String(error),
            elapsedMs: Math.round(performance.now() - startedAt)
          });
          if (options.signal?.aborted || attempt === attempts) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, attempt * 300));
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', abortFromCaller);
        }
      }

      throw lastError;
    };
  }

  const ROOT_CLASS = 'entrance-pending';
  const ACTIVE_CLASS = 'entrance-complete';
  const guardedIds = new Set([
    'edgeSwipeZone',
    'edgeSwipeZoneLeft',
    'slideBtn',
    'cabinetBackBtn'
  ]);

  document.documentElement.classList.add(ROOT_CLASS);

  const isGuardedTarget = (target) => {
    if (!(target instanceof Element)) return false;
    const control = target.closest('#edgeSwipeZone, #edgeSwipeZoneLeft, #slideBtn, #cabinetBackBtn');
    return Boolean(control && guardedIds.has(control.id));
  };

  const blockBeforeEntrance = (event) => {
    if (!document.documentElement.classList.contains(ROOT_CLASS) || !isGuardedTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  [
    'pointerover', 'pointerenter', 'pointermove', 'pointerdown', 'pointerup',
    'mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup',
    'touchstart', 'touchmove', 'touchend', 'click', 'keydown'
  ].forEach((type) => document.addEventListener(type, blockBeforeEntrance, true));

  const activateNavigation = () => {
    const root = document.documentElement;
    if (!root.classList.contains(ROOT_CLASS)) return;
    root.classList.remove(ROOT_CLASS);
    root.classList.add(ACTIVE_CLASS);

    const rightZone = document.getElementById('edgeSwipeZone');
    if (rightZone) rightZone.setAttribute('aria-hidden', 'false');
  };

  const observeEntrance = () => {
    const welcome = document.getElementById('welcomeScreen');
    const mainContent = document.getElementById('mainContent');
    const slideButton = document.getElementById('slideBtn');
    if (!welcome || !mainContent || !slideButton) return;

    const entranceFinished = () =>
      getComputedStyle(welcome).display === 'none' &&
      mainContent.classList.contains('active') &&
      slideButton.classList.contains('visible');

    const observer = new MutationObserver(() => {
      if (!entranceFinished()) return;
      observer.disconnect();
      activateNavigation();
    });

    observer.observe(welcome, { attributes: true, attributeFilter: ['class', 'style'] });
    observer.observe(mainContent, { attributes: true, attributeFilter: ['class'] });
    observer.observe(slideButton, { attributes: true, attributeFilter: ['class', 'style'] });

    if (entranceFinished()) {
      observer.disconnect();
      activateNavigation();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeEntrance, { once: true });
  } else {
    observeEntrance();
  }
})();

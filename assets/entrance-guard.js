(() => {
  'use strict';

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

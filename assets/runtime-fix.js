(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const cabinetPage = byId('cabinetPage');
  const mainPage = byId('mainPage');
  const slideBtn = byId('slideBtn');
  const cabinetBackBtn = byId('cabinetBackBtn');
  const edgeSwipeZone = byId('edgeSwipeZone');
  const edgeSwipeZoneLeft = byId('edgeSwipeZoneLeft');
  const volumeControl = byId('volumeControl');
  const infoButton = byId('infoButton');
  const infoPanel = byId('infoPanel');
  const viewersCounter = byId('viewersCounter');
  const viewsValue = byId('viewsValue');
  const music = byId('backgroundMusic');
  const volumeIcon = byId('volumeIcon');
  const volumeSlider = byId('volumeSlider');
  const highVolumeIcon = byId('highVolumeIcon');
  const lowVolumeIcon = byId('lowVolumeIcon');
  const muteIcon = byId('muteIcon');
  const zeroVolumeIcon = byId('zeroVolumeIcon');

  if (!cabinetPage || !mainPage || !slideBtn || !cabinetBackBtn || !music || !volumeIcon || !volumeSlider) {
    console.error('Runtime fix: required page elements are missing');
    return;
  }

  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in privacy modes; controls should still work.
    }
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let cabinetHideTimer = 0;

  const setMainControlsVisible = (visible) => {
    volumeControl?.classList.toggle('visible', visible);
    infoButton?.classList.toggle('visible', visible);
    for (const control of [volumeControl, infoButton]) {
      if (!control) continue;
      control.style.pointerEvents = visible ? '' : 'none';
      control.setAttribute('aria-hidden', String(!visible));
    }
    if (!visible) infoPanel?.classList.remove('visible');
  };

  const applyCabinetState = () => {
    const open = cabinetPage.classList.contains('slide-in');
    clearTimeout(cabinetHideTimer);

    if (open) {
      cabinetPage.style.display = 'flex';
      cabinetPage.setAttribute('aria-hidden', 'false');
      edgeSwipeZone?.classList.add('cabinet-open');
      edgeSwipeZone?.setAttribute('aria-hidden', 'true');
      edgeSwipeZoneLeft?.setAttribute('aria-hidden', 'false');
      setMainControlsVisible(false);
      return;
    }

    cabinetPage.setAttribute('aria-hidden', 'true');
    edgeSwipeZone?.classList.remove('cabinet-open');
    edgeSwipeZone?.setAttribute('aria-hidden', 'false');
    edgeSwipeZoneLeft?.setAttribute('aria-hidden', 'true');
    setMainControlsVisible(true);
    cabinetHideTimer = window.setTimeout(() => {
      if (!cabinetPage.classList.contains('slide-in')) cabinetPage.style.display = 'none';
    }, 720);
  };

  new MutationObserver(applyCabinetState).observe(cabinetPage, {
    attributes: true,
    attributeFilter: ['class'],
  });
  applyCabinetState();

  let touchStartX = null;
  document.addEventListener('pointerdown', (event) => {
    touchStartX = event.pointerType === 'touch' ? event.clientX : null;
  }, { passive: true });
  document.addEventListener('pointerup', (event) => {
    if (touchStartX === null || document.documentElement.classList.contains('entrance-pending')) return;
    const delta = event.clientX - touchStartX;
    const isOpen = cabinetPage.classList.contains('slide-in');
    if (!isOpen && touchStartX >= innerWidth - 60 && delta < -50) slideBtn.click();
    if (isOpen && touchStartX <= 60 && delta > 50) cabinetBackBtn.click();
    touchStartX = null;
  }, { passive: true });

  const VOLUME_KEY = 'onlyv1be-volume';
  const LAST_VOLUME_KEY = 'onlyv1be-last-volume';
  const MUTED_KEY = 'onlyv1be-muted';
  const icons = [highVolumeIcon, lowVolumeIcon, muteIcon, zeroVolumeIcon].filter(Boolean);
  let lastAudibleVolume = clamp(Number(read(LAST_VOLUME_KEY, read(VOLUME_KEY, 0.5))), 0.01, 1);
  let volumeAnimation = 0;

  const renderVolume = (value) => {
    const shownValue = clamp(Number(value) || 0, 0, 1);
    icons.forEach((icon) => { icon.style.display = 'none'; });
    const activeIcon = music.muted || shownValue <= 0.001
      ? muteIcon
      : shownValue > 0.5
        ? highVolumeIcon
        : lowVolumeIcon;
    if (activeIcon) activeIcon.style.display = 'block';
    volumeSlider.style.background = `linear-gradient(to right,#ffffffe6 ${shownValue * 100}%,#ffffff26 ${shownValue * 100}%)`;
    volumeIcon.setAttribute('aria-label', music.muted || shownValue <= 0.001 ? 'Включить звук' : 'Выключить звук');
  };

  const animateSlider = (target) => {
    cancelAnimationFrame(volumeAnimation);
    const start = Number(volumeSlider.value);
    const startedAt = performance.now();
    const step = (now) => {
      const progress = clamp((now - startedAt) / 180, 0, 1);
      const value = start + ((target - start) * (1 - ((1 - progress) ** 3)));
      volumeSlider.value = String(value);
      renderVolume(value);
      if (progress < 1) volumeAnimation = requestAnimationFrame(step);
      else {
        volumeSlider.value = String(target);
        renderVolume(target);
      }
    };
    volumeAnimation = requestAnimationFrame(step);
  };

  const savedVolume = clamp(Number(read(VOLUME_KEY, 0.5)), 0, 1);
  const savedMuted = Boolean(read(MUTED_KEY, false));
  if (savedVolume > 0.001) lastAudibleVolume = savedVolume;
  music.volume = savedMuted ? lastAudibleVolume : savedVolume;
  music.muted = savedMuted || savedVolume <= 0.001;
  volumeSlider.value = String(music.muted ? 0 : music.volume);
  renderVolume(Number(volumeSlider.value));

  volumeIcon.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    const sliderValue = Number(volumeSlider.value);

    if (!music.muted && sliderValue > 0.001) {
      lastAudibleVolume = clamp(music.volume || sliderValue, 0.01, 1);
      write(LAST_VOLUME_KEY, lastAudibleVolume);
      write(VOLUME_KEY, 0);
      write(MUTED_KEY, true);
      music.muted = true;
      animateSlider(0);
      return;
    }

    const restored = clamp(lastAudibleVolume || 0.5, 0.01, 1);
    music.volume = restored;
    music.muted = false;
    write(VOLUME_KEY, restored);
    write(LAST_VOLUME_KEY, restored);
    write(MUTED_KEY, false);
    animateSlider(restored);
    music.play().catch(() => {});
  }, true);

  volumeSlider.addEventListener('input', (event) => {
    event.stopImmediatePropagation();
    cancelAnimationFrame(volumeAnimation);
    const value = clamp(Number(volumeSlider.value), 0, 1);

    if (value <= 0.001) {
      music.muted = true;
      write(VOLUME_KEY, 0);
      write(MUTED_KEY, true);
    } else {
      music.volume = value;
      music.muted = false;
      lastAudibleVolume = value;
      write(VOLUME_KEY, value);
      write(LAST_VOLUME_KEY, value);
      write(MUTED_KEY, false);
    }
    renderVolume(value);
  }, true);

  const LAST_VIEWS_KEY = 'onlyv1be-last-views';
  const cachedViews = Number(read(LAST_VIEWS_KEY, Number(viewsValue?.textContent) || 0));
  if (viewsValue) viewsValue.textContent = String(Number.isFinite(cachedViews) ? cachedViews : 0);
  viewersCounter?.classList.toggle('active', byId('welcomeScreen')?.style.display === 'none');

  let lastRenderedViews = viewsValue?.textContent || '0';
  if (viewsValue) {
    new MutationObserver(() => {
      const value = Number(viewsValue.textContent);
      if (!Number.isFinite(value) || value < 0) return;
      lastRenderedViews = viewsValue.textContent;
      write(LAST_VIEWS_KEY, value);
      viewersCounter?.removeAttribute('title');
    }).observe(viewsValue, { childList: true, characterData: true, subtree: true });
  }
  setTimeout(() => {
    if (viewsValue?.textContent === lastRenderedViews) {
      viewersCounter?.setAttribute('title', 'Счётчик временно недоступен');
    }
  }, 8000);})();

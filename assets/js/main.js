// Основная логика: API, кабинет, вход и эффекты.
const byId = id => document.getElementById(id);
const waitForAnimation = duration => new Promise(resolve => setTimeout(resolve, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration));
const API_URL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  ? location.origin
  : "https://story.politcore.ru/oxae-api";
const TITLE_FRAMES = ["@onlyv1be", "@onlyv1b", "@onlyv1", "@onlyv", "@only", "@onl", "@on", "@o", "@", "@o", "@on", "@onl", "@only", "@onlyv", "@onlyv1", "@onlyv1b", "@onlyv1be"];
const STORAGE_KEYS = {
  activeTab: "onlyv1be-active-tab"
};
let adminToken = sessionStorage.getItem("onlyv1be-admin-token") || "";
const setAdminToken = token => {
  adminToken = token;
  if (token) {
    sessionStorage.setItem("onlyv1be-admin-token", token);
  } else {
    sessionStorage.removeItem("onlyv1be-admin-token");
  }
};
const isAdmin = () => !!adminToken;
async function requestJson(path, options = {}) {
  const hasJsonBody = options.body !== undefined;
  const response = await fetch(API_URL + path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(hasJsonBody ? {
        "Content-Type": "application/json"
      } : {}),
      ...(adminToken ? {
        Authorization: "Bearer " + adminToken
      } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "HTTP " + response.status);
  return data;
}
const postJson = (path, body) => requestJson(path, {
  method: "POST",
  body: JSON.stringify({
    ...body,
    admin: adminToken
  })
});
const api = {
  views: async () => {
    const data = await requestJson("/api/views");
    if (window.__onlyv1beApiDebug) console.info("[API debug] views payload", JSON.stringify(data));
    const views = typeof data === "number" ? data : data?.views ?? data?.count;
    const numericViews = Number(views);
    if (!Number.isFinite(numericViews) || numericViews < 0) {
      throw new Error("Некорректный ответ счётчика просмотров");
    }
    return Math.trunc(numericViews);
  },
  tabs: async () => {
    const data = await requestJson("/api/tabs");
    return data?.tabs || [];
  },
  cards: async tabId => {
    const data = await requestJson("/api/cards?tab_id=" + encodeURIComponent(tabId));
    return data?.cards || [];
  },
  addTab: title => postJson("/api/add-tab", {
    title
  }),
  removeTab: id => postJson("/api/remove-tab", {
    id
  }),
  addCard: card => postJson("/api/add-card", card),
  updateCard: card => postJson("/api/update-card", card),
  removeCard: id => postJson("/api/remove-card", {
    id
  })
};
async function loginAdmin(password) {
  const encodedPassword = new TextEncoder().encode(password);
  const passwordHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", encodedPassword))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  setAdminToken(passwordHash);
  const response = await fetch(API_URL + "/api/tabs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      admin: passwordHash
    })
  });
  if (response.status === 403) {
    setAdminToken("");
    return false;
  }
  return true;
}
function readStorage(key, fallback) {
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue === null ? fallback : JSON.parse(storedValue);
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function initEntrance(elements, onComplete) {
  const INTRO_DURATION_MS = 12200;
  let started = false;
  const enter = async () => {
    if (!started) {
      started = true;
      document.documentElement.requestFullscreen?.().catch(() => {});
      elements.welcomeScreen.classList.add("fade-out");
      elements.loadingText.classList.add("visible");
      elements.audio.muted = false;
      if (elements.audio.volume <= 0) elements.audio.volume = .5;
      const slider = byId("volumeSlider");
      slider.value = String(elements.audio.volume);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      elements.audio.play().catch(() => {});
      elements.welcomeScreen.style.display = "none";
      // A wall-clock deadline keeps the intro at 12.2 seconds, independently of
      // animation preferences, frame rate, and network requests.
      await new Promise(resolve => {
        const deadline = performance.now() + INTRO_DURATION_MS;
        const progress = byId("loadingProgress");
        const skipButton = byId("loadingSkip");
        let frame;
        const updateProgress = () => {
          progress.style.transform = `scaleX(${Math.max(0, (deadline - performance.now()) / INTRO_DURATION_MS)})`;
          frame = requestAnimationFrame(updateProgress);
        };
        const finish = () => {
          clearTimeout(timeout);
          cancelAnimationFrame(frame);
          document.removeEventListener("keydown", skip);
          skipButton.removeEventListener("click", skipAudio);
          resolve();
        };
        const skipAudio = () => {
          // Seeking can happen before metadata arrives on a slow connection.
          const seek = () => { elements.audio.currentTime = INTRO_DURATION_MS / 1000; };
          if (elements.audio.readyState >= 1) seek();
          else elements.audio.addEventListener("loadedmetadata", seek, { once: true });
          finish();
        };
        const skip = event => {
          if (event.code !== "Space") return;
          event.preventDefault();
          skipAudio();
        };
        const timeout = setTimeout(finish, INTRO_DURATION_MS);
        document.addEventListener("keydown", skip);
        skipButton.addEventListener("click", skipAudio);
        updateProgress();
      });
      elements.loadingText.classList.add("fade-out");
      elements.video.style.visibility = "visible";
      elements.video.muted = true;
      elements.video.play().catch(() => {});
      elements.video.classList.add("visible");
      elements.mainContent.classList.add("active");
      elements.viewersCounter.classList.add("active");
      setTimeout(() => { elements.loadingText.style.display = "none"; }, 320);
      await waitForAnimation(420);
      elements.volumeControl.classList.add("visible");
      await waitForAnimation(150);
      elements.infoButton.classList.add("visible");
      await waitForAnimation(150);
      elements.slideBtn.classList.add("visible");
      onComplete();
    }
  };
  document.addEventListener("click", enter, {
    once: true
  });
  document.addEventListener("keydown", event => event.key === "Enter" && enter(), {
    once: true
  });
}
function initTilt(elements) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const mainContent = elements.mainContent;
  let rect;
  let frame = 0;
  let relativeX = 0;
  let relativeY = 0;
  mainContent.addEventListener("pointerenter", () => {
    // Keep a stable reference while tilting instead of measuring the moving card.
    rect = mainContent.getBoundingClientRect();
  });
  mainContent.addEventListener("pointermove", event => {
    if (event.buttons) return;
    if (!rect || !rect.width || !rect.height) return;
    relativeX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    relativeY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    if (frame) return;
    frame = requestAnimationFrame(() => {
      mainContent.style.setProperty("--tilt-rotate-x", relativeY * 7 + "deg");
      mainContent.style.setProperty("--tilt-rotate-y", -relativeX * 7 + "deg");
      frame = 0;
    });
  });
  mainContent.addEventListener("pointerleave", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    rect = null;
    mainContent.style.setProperty("--tilt-rotate-x", "0deg");
    mainContent.style.setProperty("--tilt-rotate-y", "0deg");
  });
}
function startTypewriter(element) {
  const text = "helloWorld(\"print\")";
  let characterIndex = 0;
  const typeNextCharacter = () => {
    element.closest(".main-desc")?.classList.remove("error");
    element.textContent = text.slice(0, characterIndex) + "_";
    if (characterIndex++ <= text.length) return setTimeout(typeNextCharacter, 120);
    setTimeout(() => {
      element.closest(".main-desc")?.classList.add("error");
      element.textContent = "Error 404";
      setTimeout(() => {
        characterIndex = 0;
        typeNextCharacter();
      }, 4000);
    }, 1600);
  };
  typeNextCharacter();
}
function showToast(message, type = "info") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.append(container);
  }
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  container.append(toast);
  setTimeout(() => toast.remove(), 3200);
}
function confirmAction(message) {
  return Promise.resolve(window.confirm(message));
}
const readImageBase64 = file => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.readAsDataURL(file);
});
function initCabinet(elements) {
  let activeTab = readStorage(STORAGE_KEYS.activeTab, "anime");
  let editingCard = null;
  let sortDirection = "desc";
  let tabsRequest;
  const cardsRequests = new Map();
  let cardsRenderVersion = 0;
  const loadTabs = (refresh = false) => {
    if (refresh || !tabsRequest) {
      const request = api.tabs();
      tabsRequest = request;
      request.catch(() => {
        if (tabsRequest === request) tabsRequest = null;
      });
    }
    return tabsRequest;
  };
  const loadCards = (tabId, refresh = false) => {
    const key = String(tabId);
    if (refresh || !cardsRequests.has(key)) {
      const request = api.cards(tabId);
      cardsRequests.set(key, request);
      request.catch(() => {
        if (cardsRequests.get(key) === request) cardsRequests.delete(key);
      });
    }
    return cardsRequests.get(key);
  };
  const syncAdminControls = () => {
    elements.addTabBtn.style.display = isAdmin() ? "inline-flex" : "none";
    document.querySelector(".cabinet-shell")?.classList.toggle("editing-mode", isAdmin());
  };
  const renderCards = async ({ refresh = false } = {}) => {
    const tabId = activeTab;
    const version = ++cardsRenderVersion;
    let cards = tabId ? await loadCards(tabId, refresh) : [];
    cards = [...cards].sort((first, second) => sortDirection === "asc" ? Number(first.rating) - Number(second.rating) : sortDirection === "desc" ? Number(second.rating) - Number(first.rating) : 0);
    const panel = document.createElement("div");
    panel.className = "tab-panel active";
    const grid = document.createElement("div");
    grid.className = "tab-grid";
    panel.append(grid);
    cards.forEach(card => {
      const article = document.createElement("article");
      article.className = "tab-card";
      const imageUrl = card.image ? String(card.image).startsWith("data:") ? card.image : "data:image/jpeg;base64," + card.image : "";
      article.innerHTML = (imageUrl ? "<img src=\"" + imageUrl + "\" alt=\"\">" : "") + "<div class=\"tab-card-title\"></div><div class=\"tab-card-rating\">" + Number(card.rating || 0).toFixed(1) + "</div>" + (isAdmin() ? "<div class=\"card-actions\"><button class=\"edit-card-btn\">✎</button><button class=\"remove-card-btn\">×</button></div>" : "");
      article.querySelector(".tab-card-title").textContent = card.title;
      article.querySelector(".edit-card-btn")?.addEventListener("click", () => openCardEditor(card));
      article.querySelector(".remove-card-btn")?.addEventListener("click", async () => {
        if (await confirmAction("Удалить карточку?")) {
          await api.removeCard(card.id);
          await renderCards({ refresh: true });
        }
      });
      grid.append(article);
    });
    if (isAdmin()) {
      const addButton = document.createElement("button");
      addButton.className = "tab-card add-card";
      addButton.textContent = "+";
      addButton.addEventListener("click", () => openCardEditor());
      grid.append(addButton);
    }
    // Decode images before swapping content so the panel appears fully sized.
    await Promise.all([...grid.querySelectorAll("img")].map(image => image.decode().catch(() => {})));
    if (version !== cardsRenderVersion || String(tabId) !== String(activeTab)) return;
    elements.cardsCount.textContent = cards.length;
    elements.cabinetContent.replaceChildren(panel);
  };
  const renderTabs = async ({ refresh = false } = {}) => {
    const tabs = await loadTabs(refresh);
    if (!tabs.some(tab => String(tab.id) === String(activeTab))) {
      activeTab = tabs[0]?.id ?? null;
    }
    // Start all tab requests once, while the welcome screen is still visible.
    tabs.forEach(tab => loadCards(tab.id).catch(error => console.error("Не удалось загрузить карточки:", error)));
    elements.cabinetTabs.querySelectorAll(".cabinet-tab:not(.add-tab)").forEach(button => button.remove());
    tabs.forEach(tab => {
      const button = document.createElement("button");
      button.className = "cabinet-tab" + (String(tab.id) === String(activeTab) ? " active" : "");
      button.textContent = tab.title;
      button.addEventListener("click", () => {
        if (String(activeTab) === String(tab.id)) return;
        activeTab = tab.id;
        writeStorage(STORAGE_KEYS.activeTab, activeTab);
        renderTabs();
      });
      if (isAdmin()) {
        button.addEventListener("contextmenu", async event => {
          event.preventDefault();
          if (await confirmAction("Удалить вкладку?")) {
            await api.removeTab(tab.id);
            cardsRequests.delete(String(tab.id));
            await renderTabs({ refresh: true });
          }
        });
      }
      elements.cabinetTabs.insertBefore(button, elements.addTabBtn);
    });
    await renderCards();
  };
  const openCardEditor = (card = null) => {
    editingCard = card;
    elements.cardEditPanel.style.display = "block";
    elements.cardTitleEdit.value = card?.title || "";
    elements.cardRatingEdit.value = card?.rating || "";
    elements.saveCardBtnText.textContent = card ? "Сохранить" : "Добавить карточку";
  };
  elements.addTabBtn.addEventListener("click", () => {
    if (!isAdmin()) return showToast("Нужен доступ (E+Z)", "error");
    elements.tabEditPanel.style.display = "block";
  });
  elements.saveTabEditBtn.addEventListener("click", async () => {
    const title = elements.tabTitleEdit.value.trim();
    if (title) {
      await api.addTab(title);
      elements.tabEditPanel.style.display = "none";
      await renderTabs({ refresh: true });
    }
  });
  elements.closeTabEditBtn.addEventListener("click", () => elements.tabEditPanel.style.display = "none");
  elements.saveCardEditBtn.addEventListener("click", async () => {
    const title = elements.cardTitleEdit.value.trim();
    if (!title) return;
    const file = elements.cardImgEdit.files[0];
    const payload = {
      tab_id: activeTab,
      tabId: activeTab,
      title,
      rating: String(Math.max(0, Math.min(10, Number(elements.cardRatingEdit.value) || 0))),
      image: file ? await readImageBase64(file) : ""
    };
    if (editingCard) {
      await api.updateCard({
        ...payload,
        id: editingCard.id
      });
    } else {
      await api.addCard(payload);
    }
    elements.cardEditPanel.style.display = "none";
    await renderCards({ refresh: true });
  });
  elements.closeCardEditBtn.addEventListener("click", () => elements.cardEditPanel.style.display = "none");
  elements.sortDesc.addEventListener("click", () => {
    sortDirection = sortDirection === "desc" ? "default" : "desc";
    renderCards();
  });
  elements.sortAsc.addEventListener("click", () => {
    sortDirection = sortDirection === "asc" ? "default" : "asc";
    renderCards();
  });
  const pressedKeys = new Set();
  document.addEventListener("keydown", async event => {
    pressedKeys.add(event.key.toLowerCase());
    if (!isAdmin() && pressedKeys.has("e") && pressedKeys.has("z")) {
      elements.adminLoginBlock.style.display = "flex";
      elements.adminPasswordInput.focus();
    }
  });
  document.addEventListener("keyup", event => pressedKeys.delete(event.key.toLowerCase()));
  elements.adminGoBtn.addEventListener("click", async () => {
    if (await loginAdmin(elements.adminPasswordInput.value)) {
      syncAdminControls();
      cardsRequests.clear();
      await renderTabs({ refresh: true });
      elements.adminLoginBlock.style.display = "none";
      showToast("Режим бога включен", "success");
    } else {
      showToast("Неверный пароль", "error");
    }
  });
  let openingCabinet = false;
  const prepareCabinet = () => renderTabs().then(() => true).catch(error => {
    console.error("Не удалось загрузить кабинет:", error);
    return false;
  });
  const preloadImages = async tabId => {
    const cards = await loadCards(tabId);
    await Promise.all(cards.filter(card => card.image).map(card => {
      const image = new Image();
      image.src = String(card.image).startsWith("data:") ? card.image : "data:image/jpeg;base64," + card.image;
      return image.decode().catch(() => {});
    }));
  };
  const openCabinet = async () => {
    if (openingCabinet || elements.cabinetPage.classList.contains("slide-in")) return;
    openingCabinet = true;
    elements.slideBtn.setAttribute("aria-busy", "true");
    try {
      if (!await cabinetReady) {
        cabinetReady = prepareCabinet();
        if (!await cabinetReady) {
          showToast("Не удалось загрузить карточки. Попробуй ещё раз.", "error");
          return;
        }
      }
      elements.mainPage.classList.add("slide-out");
      elements.cabinetPage.classList.add("slide-in");
      elements.cabinetPage.setAttribute("aria-hidden", "false");
      elements.slideBtn.style.display = "none";
      elements.cabinetBackBtn.style.display = "flex";
      elements.edgeSwipeZoneLeft.style.display = "block";
      elements.video.pause();
      elements.audio.pause();
    } finally {
      openingCabinet = false;
      elements.slideBtn.removeAttribute("aria-busy");
    }
  };
  const closeCabinet = () => {
    elements.mainPage.classList.remove("slide-out");
    elements.cabinetPage.classList.remove("slide-in");
    elements.cabinetPage.setAttribute("aria-hidden", "true");
    elements.slideBtn.style.display = "flex";
    elements.cabinetBackBtn.style.display = "none";
    elements.edgeSwipeZoneLeft.style.display = "none";
    elements.video.play().catch(() => {});
    elements.audio.play().catch(() => {});
  };
  elements.slideBtn.addEventListener("click", event => {
    event.stopPropagation();
    openCabinet();
  });
  elements.cabinetBackBtn.addEventListener("click", closeCabinet);
  let hoverTimer;
  elements.edgeSwipeZone.addEventListener("mouseenter", () => hoverTimer = setTimeout(openCabinet, 200));
  elements.edgeSwipeZone.addEventListener("mouseleave", () => clearTimeout(hoverTimer));
  elements.edgeSwipeZoneLeft.addEventListener("mouseenter", () => hoverTimer = setTimeout(closeCabinet, 200));
  elements.edgeSwipeZoneLeft.addEventListener("mouseleave", () => clearTimeout(hoverTimer));
  syncAdminControls();
  let cabinetReady = prepareCabinet();
  loadTabs().then(tabs => Promise.all(tabs.map(tab => preloadImages(tab.id))))
    .catch(error => console.error("Не удалось подготовить изображения карточек:", error));
}
const ELEMENT_IDS = ["welcomeScreen", "loadingText", "mainContent", "mainPage", "cabinetPage", "volumeControl", "infoButton", "infoPanel", "pageTitle", "slideBtn", "cabinetTabs", "addTabBtn", "cabinetContent", "cabinetBackBtn", "tabEditPanel", "tabTitleEdit", "saveTabEditBtn", "closeTabEditBtn", "cardEditPanel", "cardTitleEdit", "cardImgEdit", "cardRatingEdit", "saveCardBtnText", "saveCardEditBtn", "closeCardEditBtn", "edgeSwipeZone", "edgeSwipeZoneLeft", "viewersCounter", "viewsValue", "neonTypeEffect", "adminLoginBlock", "adminPasswordInput", "adminGoBtn", "cardsCount", "sortDesc", "sortAsc"];
const elements = Object.fromEntries(ELEMENT_IDS.map(id => [id, byId(id)]));
elements.video = byId("background-video");
elements.audio = byId("backgroundMusic");

document.oncontextmenu = () => false;
document.addEventListener("click", event => {
  const effect = document.createElement("div");
  effect.className = "click-effect";
  effect.style.left = event.clientX + "px";
  effect.style.top = event.clientY + "px";
  document.body.append(effect);
  setTimeout(() => effect.remove(), 600);
});
initCabinet(elements);
initEntrance(elements, () => {
  initTilt(elements);
  startTypewriter(elements.neonTypeEffect);
});
elements.infoButton.addEventListener("click", event => {
  event.stopPropagation();
  elements.infoPanel.classList.toggle("visible");
});
document.addEventListener("click", event => {
  if (!elements.infoPanel.contains(event.target) && !elements.infoButton.contains(event.target)) {
    elements.infoPanel.classList.remove("visible");
  }
});
api.views()
  .then(views => {
    elements.viewsValue.textContent = views;
    elements.viewersCounter.classList.remove("unavailable");
    elements.viewersCounter.removeAttribute("title");
  })
  .catch(error => {
    elements.viewsValue.textContent = "—";
    elements.viewersCounter.classList.add("unavailable");
    elements.viewersCounter.title = "Счётчик временно недоступен";
    console.error("Не удалось загрузить счётчик:", error);
    if (window.__onlyv1beApiDebug) {
      console.info("[API debug] Проверь Network → /api/views: если HTTP-статуса нет, запрос не дошёл до ответа Nginx.");
    }
  });
let titleFrame = 0;
setInterval(() => {
  elements.pageTitle.textContent = TITLE_FRAMES[titleFrame++ % TITLE_FRAMES.length];
}, 300);

// Элементы интерфейса: громкость, свайпы, карточки и форма входа.
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
  const media = byId('backgroundMusic');
  const volumeIcon = byId('volumeIcon');
  const volumeSlider = byId('volumeSlider');
  const highVolumeIcon = byId('highVolumeIcon');
  const lowVolumeIcon = byId('lowVolumeIcon');
  const muteIcon = byId('muteIcon');
  const zeroVolumeIcon = byId('zeroVolumeIcon');
  const welcomeScreen = byId('welcomeScreen');
  const adminLoginBlock = byId('adminLoginBlock');
  const adminPasswordInput = byId('adminPasswordInput');
  const adminGoBtn = byId('adminGoBtn');
  const cabinetContent = byId('cabinetContent');
  const cabinetTabs = byId('cabinetTabs');
  const addTabButton = byId('addTabBtn');

  if (!cabinetPage || !mainPage || !slideBtn || !cabinetBackBtn || !media || !volumeIcon || !volumeSlider) {
    console.error('Runtime fix: required page elements are missing');
    return;
  }

  document.querySelectorAll('.round-button').forEach((link) => {
    link.addEventListener('pointerdown', () => link.classList.add('is-pressed'));
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
      link.addEventListener(eventName, () => link.classList.remove('is-pressed'));
    }
    link.addEventListener('click', (event) => event.stopPropagation());
  });
  if (addTabButton) {
    addTabButton.textContent = 'Новая вкладка';
    addTabButton.setAttribute('aria-label', 'Добавить новую вкладку');
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
  let apiStateTimer = 0;

  const entranceIsComplete = () => (
    document.documentElement.classList.contains('entrance-complete')
    || welcomeScreen?.style.display === 'none'
  );

  const setMainControlsVisible = (visible) => {
    const shouldShow = visible && entranceIsComplete();
    volumeControl?.classList.toggle('visible', shouldShow);
    infoButton?.classList.toggle('visible', shouldShow);
    for (const control of [volumeControl, infoButton]) {
      if (!control) continue;
      control.style.pointerEvents = shouldShow ? '' : 'none';
      control.setAttribute('aria-hidden', String(!shouldShow));
    }
    if (!shouldShow) infoPanel?.classList.remove('visible');
  };

  const showApiState = () => {
    if (!isAdmin() || !cabinetContent || cabinetContent.children.length > 0 || !cabinetPage.classList.contains('slide-in')) return;
    const state = document.createElement('div');
    state.className = 'cabinet-api-state';
    state.innerHTML = '<strong>Карточки временно недоступны</strong><span>Сервер не ответил. Попробуй ещё раз.</span><button type="button">Повторить</button>';
    state.querySelector('button').addEventListener('click', () => {
      state.remove();
      cabinetBackBtn.click();
      window.setTimeout(() => slideBtn.click(), 760);
    });
    cabinetContent.append(state);
  };

  const scheduleApiState = () => {
    clearTimeout(apiStateTimer);
    apiStateTimer = window.setTimeout(showApiState, 23000);
  };

  const applyCabinetState = () => {
    const open = cabinetPage.classList.contains('slide-in');
    // Keep the prepared panel mounted offscreen; display:none would restart
    // card animations and force layout when entering the cabinet again.
    cabinetPage.style.display = 'flex';

    if (open) {
      cabinetPage.setAttribute('aria-hidden', 'false');
      edgeSwipeZone?.classList.add('cabinet-open');
      edgeSwipeZone?.setAttribute('aria-hidden', 'true');
      edgeSwipeZoneLeft?.setAttribute('aria-hidden', 'false');
      setMainControlsVisible(false);
      scheduleApiState();
      return;
    }

    cabinetPage.setAttribute('aria-hidden', 'true');
    edgeSwipeZone?.classList.remove('cabinet-open');
    edgeSwipeZone?.setAttribute('aria-hidden', 'false');
    edgeSwipeZoneLeft?.setAttribute('aria-hidden', 'true');
    setMainControlsVisible(true);
    clearTimeout(apiStateTimer);
  };

  new MutationObserver(applyCabinetState).observe(cabinetPage, {
    attributes: true,
    attributeFilter: ['class'],
  });
  new MutationObserver(() => {
    if (entranceIsComplete() && !cabinetPage.classList.contains('slide-in')) {
      setMainControlsVisible(true);
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  applyCabinetState();

  const enhanceCard = (card) => {
    if (card.dataset.enhanced === 'true') return;
    card.dataset.enhanced = 'true';

    if (card.classList.contains('add-card')) {
      card.innerHTML = '<span class="add-card-icon" aria-hidden="true">+</span><span class="add-card-label">Добавить карточку</span>';
      card.setAttribute('aria-label', 'Добавить карточку');
      return;
    }

    const image = card.querySelector('img');
    const rating = card.querySelector('.tab-card-rating, .card-rating');
    const title = card.querySelector('.tab-card-title');
    if (image && image.parentElement === card) {
      const wrapper = document.createElement('div');
      wrapper.className = 'tab-card-img-wrapper';
      card.insertBefore(wrapper, image);
      wrapper.append(image);
      if (rating) {
        rating.className = 'card-rating';
        wrapper.append(rating);
      }
    }
    if (title) title.classList.add('card-title');
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${title?.textContent || 'Карточка'}, оценка ${rating?.textContent || '0'}`);
  };

  if (cabinetContent) {
    const enhanceCards = () => {
      const cards = cabinetContent.querySelectorAll('.tab-card');
      if (cards.length) clearTimeout(apiStateTimer);
      cards.forEach(enhanceCard);
    };
    new MutationObserver(enhanceCards).observe(cabinetContent, { childList: true, subtree: true });
    enhanceCards();
  }

  window.addEventListener('unhandledrejection', (event) => {
    const message = String(event.reason?.message || event.reason || '');
    if (!/fetch|abort|network|timeout/i.test(message)) return;
    event.preventDefault();
    showApiState();
  });

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

  if (adminLoginBlock && adminPasswordInput && adminGoBtn) {
    adminLoginBlock.setAttribute('role', 'dialog');
    adminLoginBlock.setAttribute('aria-label', 'Вход администратора');
    adminLoginBlock.setAttribute('aria-hidden', 'true');
    adminPasswordInput.placeholder = 'Пароль администратора';
    adminPasswordInput.setAttribute('aria-label', 'Пароль администратора');

    const closeLoginButton = document.createElement('button');
    closeLoginButton.type = 'button';
    closeLoginButton.className = 'admin-login-close';
    closeLoginButton.setAttribute('aria-label', 'Закрыть');
    closeLoginButton.textContent = '×';

    const loginMessage = document.createElement('span');
    loginMessage.className = 'admin-login-message';
    loginMessage.setAttribute('aria-live', 'polite');
    adminLoginBlock.append(closeLoginButton, loginMessage);

    const closeLogin = () => {
      adminLoginBlock.style.display = 'none';
      adminLoginBlock.classList.remove('login-open', 'login-shake');
      adminLoginBlock.setAttribute('aria-hidden', 'true');
      adminPasswordInput.value = '';
      adminPasswordInput.removeAttribute('aria-invalid');
      loginMessage.textContent = '';
    };

    const syncLoginVisibility = () => {
      const visible = adminLoginBlock.style.display !== 'none';
      adminLoginBlock.classList.toggle('login-open', visible);
      adminLoginBlock.setAttribute('aria-hidden', String(!visible));
      if (visible) window.setTimeout(() => adminPasswordInput.focus(), 0);
    };

    new MutationObserver(syncLoginVisibility).observe(adminLoginBlock, {
      attributes: true,
      attributeFilter: ['style'],
    });
    syncLoginVisibility();

    closeLoginButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeLogin();
    }, true);

    adminPasswordInput.addEventListener('input', () => {
      adminPasswordInput.removeAttribute('aria-invalid');
      loginMessage.textContent = '';
    });
    adminPasswordInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      adminGoBtn.click();
    });

    adminGoBtn.addEventListener('click', (event) => {
      if (adminPasswordInput.value === 'onlyv1be') {
        loginMessage.textContent = 'Проверяем…';
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      adminPasswordInput.setAttribute('aria-invalid', 'true');
      loginMessage.textContent = 'Неверный пароль';
      adminLoginBlock.classList.remove('login-shake');
      void adminLoginBlock.offsetWidth;
      adminLoginBlock.classList.add('login-shake');
      adminPasswordInput.focus();
      adminPasswordInput.select();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && adminLoginBlock.style.display !== 'none') closeLogin();
    }, true);
  }

  const VOLUME_KEY = 'onlyv1be-volume';
  // Mouse clicks retain focus, so expand for keyboard focus explicitly instead
  // of using :focus-within, which kept the slider open after pointerleave.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && volumeControl.contains(document.activeElement)) {
      volumeControl.classList.add('keyboard-focus');
    }
  });
  volumeControl.addEventListener('focusin', (event) => {
    volumeControl.classList.toggle('keyboard-focus', event.target.matches(':focus-visible'));
  });
  document.addEventListener('pointerdown', () => {
    volumeControl.classList.remove('keyboard-focus');
  }, true);
  volumeControl.addEventListener('focusout', (event) => {
    if (!volumeControl.contains(event.relatedTarget)) volumeControl.classList.remove('keyboard-focus');
  });
  const LAST_VOLUME_KEY = 'onlyv1be-last-volume';
  const MUTED_KEY = 'onlyv1be-muted';
  const icons = [highVolumeIcon, lowVolumeIcon, muteIcon, zeroVolumeIcon].filter(Boolean);
  let lastAudibleVolume = clamp(Number(read(LAST_VOLUME_KEY, read(VOLUME_KEY, 0.5))), 0.01, 1);
  let volumeAnimation = 0;
  let volumeBounce;
  const volumeGlyph = volumeIcon.querySelector('g');

  const bounceVolumeIcon = () => {
    volumeBounce?.cancel();
    if (!volumeGlyph || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    volumeBounce = volumeGlyph.animate([
      { transform: 'translateY(0) scale(1)', offset: 0 },
      { transform: 'translateY(1px) scale(.88)', offset: .16 },
      { transform: 'translateY(-4px) scale(1.12)', offset: .44 },
      { transform: 'translateY(1px) scale(.97)', offset: .74 },
      { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)' });
  };

  const renderVolume = (value) => {
    const shownValue = clamp(Number(value) || 0, 0, 1);
    icons.forEach((icon) => { icon.style.display = 'none'; });
    const activeIcon = media.muted || shownValue <= 0.001
      ? muteIcon
      : shownValue > 0.5
        ? highVolumeIcon
        : lowVolumeIcon;
    if (activeIcon) activeIcon.style.display = 'block';
    volumeSlider.style.setProperty('--volume-fill', `${shownValue * 100}%`);
    volumeIcon.setAttribute('aria-label', media.muted || shownValue <= 0.001 ? 'Включить звук' : 'Выключить звук');
    volumeIcon.setAttribute('aria-pressed', String(media.muted || shownValue <= 0.001));
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
  media.volume = savedMuted ? lastAudibleVolume : savedVolume;
  media.muted = savedMuted || savedVolume <= 0.001;
  volumeSlider.value = String(media.muted ? 0 : media.volume);
  renderVolume(Number(volumeSlider.value));

  volumeIcon.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    bounceVolumeIcon();
    const sliderValue = Number(volumeSlider.value);

    if (!media.muted && sliderValue > 0.001) {
      lastAudibleVolume = clamp(media.volume || sliderValue, 0.01, 1);
      write(LAST_VOLUME_KEY, lastAudibleVolume);
      write(VOLUME_KEY, 0);
      write(MUTED_KEY, true);
      media.muted = true;
      animateSlider(0);
      return;
    }

    const restored = clamp(lastAudibleVolume || 0.5, 0.01, 1);
    media.volume = restored;
    media.muted = false;
    write(VOLUME_KEY, restored);
    write(LAST_VOLUME_KEY, restored);
    write(MUTED_KEY, false);
    animateSlider(restored);
    media.play().catch(() => {});
  }, true);

  volumeIcon.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) volumeIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  volumeSlider.addEventListener('input', (event) => {
    event.stopImmediatePropagation();
    cancelAnimationFrame(volumeAnimation);
    const value = clamp(Number(volumeSlider.value), 0, 1);

    if (value <= 0.001) {
      media.muted = true;
      write(VOLUME_KEY, 0);
      write(MUTED_KEY, true);
    } else {
      media.volume = value;
      media.muted = false;
      lastAudibleVolume = value;
      write(VOLUME_KEY, value);
      write(LAST_VOLUME_KEY, value);
      write(MUTED_KEY, false);
    }
    renderVolume(value);
  }, true);

  let volumePointerActive = false;
  const updateVolumeFromPointer = (event) => {
    const sliderRect = volumeSlider.getBoundingClientRect();
    if (sliderRect.width <= 0) return false;
    const controlRect = volumeControl.getBoundingClientRect();
    const insideWideHitArea = (
      event.clientX >= sliderRect.left - 10
      && event.clientX <= sliderRect.right + 10
      && event.clientY >= controlRect.top
      && event.clientY <= controlRect.bottom
    );
    if (!insideWideHitArea) return false;

    const value = clamp((event.clientX - sliderRect.left) / sliderRect.width, 0, 1);
    volumeSlider.value = String(value);
    volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };

  volumeControl.addEventListener('pointerdown', (event) => {
    if (volumeIcon.contains(event.target)) return;
    if (!updateVolumeFromPointer(event)) return;
    volumePointerActive = true;
    event.preventDefault();
    volumeControl.setPointerCapture?.(event.pointerId);
  }, true);
  volumeControl.addEventListener('pointermove', (event) => {
    if (!volumePointerActive) return;
    updateVolumeFromPointer(event);
  }, true);
  for (const eventName of ['pointerup', 'pointercancel']) {
    volumeControl.addEventListener(eventName, () => { volumePointerActive = false; }, true);
  }

  viewersCounter?.classList.toggle('active', byId('welcomeScreen')?.style.display === 'none');
})();

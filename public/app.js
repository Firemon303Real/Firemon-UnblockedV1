const address = document.querySelector("#address");
const homeAddress = document.querySelector("#home-address");
const homeForm = document.querySelector("#home-search");
const navForm = document.querySelector("#nav");
const home = document.querySelector("#home");
const settingsView = document.querySelector("#settings-view");
const gamesView = document.querySelector("#games-view");
const gameGrid = document.querySelector("#game-grid");
const frameHost = document.querySelector("#frame-host");
const tabsEl = document.querySelector("#tabs");
const toast = document.querySelector("#toast");
const proxyLabel = document.querySelector("#proxy-label");

let controller;
let utils;
let tabs = [];
let activeId = null;
let sequence = 0;
let gameCatalog = [];
let toastTimer;

function applyBackground(choice) {
  const backgrounds = {
    stars: "",
    vibrant: "/backgrounds/Vibrant%20Blackhole.jpg",
    spinning: "/backgrounds/Spinning%20Blackhole.gif",
    ocean: "/backgrounds/Blackhole%20Ocean.gif"
  };
  if (!(choice in backgrounds)) choice = "stars";
  try { localStorage.setItem("firemon-background-v1", choice); } catch {}
  const custom = Boolean(backgrounds[choice]);
  document.querySelector(".content").classList.toggle("custom-background", custom);
  home.classList.toggle("custom-background", custom);
  home.style.backgroundImage = custom
    ? 'linear-gradient(180deg, rgba(0,0,0,.28), rgba(0,0,0,.48)), url("' + backgrounds[choice] + '")'
    : "";
  document.querySelectorAll(".background-option").forEach((option) => {
    const selected = option.dataset.background === choice;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}
const newTabId = () => "firemon-tab-" + (++sequence);
const activeTab = () => tabs.find((tab) => tab.id === activeId);

const searchEngines = {
  duckduckgo: { name: "DuckDuckGo", mark: "D", base: "https://duckduckgo.com/?q=" },
  brave: { name: "Brave", mark: "B", base: "https://search.brave.com/search?q=" },
  google: { name: "Google", mark: "G", base: "https://www.google.com/search?q=" },
  bing: { name: "Bing", mark: "b", base: "https://www.bing.com/search?q=" }
};

function applySearchEngine(key) {
  if (!Object.prototype.hasOwnProperty.call(searchEngines, key)) key = "duckduckgo";
  try { localStorage.setItem("firemon-search-engine-v1", key); } catch {}
  const engine = searchEngines[key];
  const mark = document.querySelector("#engine-mark");
  const name = document.querySelector("#engine-name");
  if (mark) mark.textContent = engine.mark;
  if (name) name.textContent = engine.name;
  homeAddress.placeholder = "Search " + engine.name + " or enter a URL";
  document.querySelectorAll(".engine-option").forEach((option) => {
    const selected = option.dataset.engine === key;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}
function getSearchEngineKey() {
  try {
    const saved = localStorage.getItem("firemon-search-engine-v1");
    if (saved && Object.prototype.hasOwnProperty.call(searchEngines, saved)) return saved;
  } catch {}
  return "duckduckgo";
}
function parseInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let candidate = text;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = text.includes(" ") || !text.includes(".")
      ? searchEngines[getSearchEngineKey()].base + encodeURIComponent(text)
      : "https://" + text;
  }
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function notify(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ""; }, 3200);
}

function persistTabs() {
  try {
    localStorage.setItem("firemon-tabs-v1", JSON.stringify({
      active: tabs.findIndex((tab) => tab.id === activeId),
      tabs: tabs.map(({ url, title, view, localPath }) => ({ url, title, view, localPath }))
    }));
  } catch {}
}

function getSavedTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem("firemon-tabs-v1") || "null");
    if (!saved || !Array.isArray(saved.tabs)) return null;
    return saved;
  } catch {
    return null;
  }
}

function titleFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, "") || "New tab"; }
  catch { return "New tab"; }
}

function renderTabs() {
  tabsEl.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement("div");
    item.className = "tab" + (tab.id === activeId ? " active" : "") + (tab.loading ? " loading" : "");
    item.setAttribute("role", "tab");
    item.setAttribute("aria-selected", String(tab.id === activeId));
    item.title = tab.title;

    const favicon = document.createElement("span");
    favicon.className = "tab-favicon";
    favicon.textContent = tab.loading ? "◌" : (tab.url ? "●" : "✦");

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.title;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.setAttribute("aria-label", "Close " + tab.title);
    close.title = "Close tab";
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    item.append(favicon, label, close);
    item.addEventListener("click", () => selectTab(tab.id));
    item.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        event.preventDefault();
        closeTab(tab.id);
      }
    });
    tabsEl.append(item);
  }
}

function updateChrome() {
  const tab = activeTab();
  const hasPage = Boolean(tab?.url);
  const isSettings = tab?.view === "settings";
  const isGames = tab?.view === "games";
  const isLocalGame = tab?.view === "game" && Boolean(tab.localPath);
  const hasLocalPage = isSettings || isGames || isLocalGame;
  home.hidden = hasPage || hasLocalPage;
  settingsView.hidden = !isSettings;
  gamesView.hidden = !isGames;
  frameHost.hidden = !(hasPage || isLocalGame);
  for (const entry of tabs) {
    if (entry.element) entry.element.classList.toggle("frame-active", entry.id === activeId && (hasPage || entry.view === "game"));
  }
  const localGame = isLocalGame ? gameCatalog.find((game) => game.path === tab.localPath) : null;
  address.value = isLocalGame ? "firemon://games/" + (localGame?.id || "game") : hasPage ? tab.url : "";
  document.querySelector("#bottom-home").setAttribute("aria-current", !hasPage && !hasLocalPage ? "page" : "false");
  document.querySelector("#settings-button").setAttribute("aria-current", isSettings ? "page" : "false");
  document.querySelector("#games-button").setAttribute("aria-current", isGames ? "page" : "false");
  let onMovies = false;
  try { onMovies = hasPage && new URL(tab.url).hostname.replace(/^www\./, "") === "movy.sx"; } catch {}
  document.querySelector("#movies-button").setAttribute("aria-current", onMovies ? "page" : "false");
  document.title = isSettings ? "Settings · Firemon Unblocked" : isGames ? "Games · Firemon Unblocked" : isLocalGame ? tab.title + " · Firemon Unblocked" : hasPage ? tab.title + " · Firemon Unblocked" : "Firemon Unblocked";
  renderTabs();
  persistTabs();
}
function attachFrame(tab) {
  tab.element = document.createElement("iframe");
  tab.element.className = "page-frame";
  tab.element.title = tab.title;
  tab.element.addEventListener("load", () => {
    if (tab.loading) {
      tab.loading = false;
      renderTabs();
    }
    try {
      const pageTitle = tab.element.contentDocument?.title;
      if (pageTitle && pageTitle.trim()) {
        tab.title = pageTitle.trim();
        if (tab.id === activeId) document.title = tab.title + " · Firemon Unblocked";
        renderTabs();
        persistTabs();
      }
    } catch {}
  });
  frameHost.append(tab.element);
}

function makeTab(url = "", title = "") {
  const tab = {
    id: newTabId(),
    url,
    title: title || (url ? titleFor(url) : "New tab"),
    view: "",
    localPath: "",
    loading: false,
    session: null,
    sessionPromise: null,
    element: null
  };
  attachFrame(tab);
  tabs.push(tab);
  return tab;
}

function resetTabToHome(tab) {
  if (tab.session && controller) {
    const frameIndex = controller.frames.indexOf(tab.session);
    if (frameIndex >= 0) controller.frames.splice(frameIndex, 1);
  }
  tab.element.remove();
  tab.session = null;
  tab.sessionPromise = null;
  tab.url = "";
  tab.view = "";
  tab.localPath = "";
  tab.title = "New tab";
  tab.loading = false;
  attachFrame(tab);
  updateChrome();
  if (tab.id === activeId) homeAddress.focus({ preventScroll: true });
}

function goHome() {
  const tab = activeTab();
  if (!tab) {
    createTab();
    return;
  }
  if (tab.sessionPromise) {
    tab.sessionPromise.then(() => resetTabToHome(tab), () => resetTabToHome(tab));
    return;
  }
  resetTabToHome(tab);
}

function selectTab(id) {
  const tab = tabs.find((entry) => entry.id === id);
  if (!tab) return;
  activeId = id;
  updateChrome();
  if (tab.url && !tab.session && controller) {
    ensureSession(tab).then((session) => {
      if (tab.url) session.go(tab.url);
    }).catch((error) => notify(error.message || "Could not open this tab."));
  }
}

function openSettings() {
  const tab = makeTab("", "Settings");
  tab.view = "settings";
  selectTab(tab.id);
}

function openGames() {
  refreshGameCatalog().catch((error) => notify(error.message));
  const tab = makeTab("", "Games");
  tab.view = "games";
  selectTab(tab.id);
}

function renderGameCards() {
  if (!gameGrid) return;
  gameGrid.replaceChildren();
  for (const game of gameCatalog) {
    const button = document.createElement("button"); button.className = "game-card"; button.type = "button"; button.title = game.title;
    const art = document.createElement("span"); art.className = "game-art"; art.setAttribute("aria-hidden", "true");
    if (game.imageUrl) art.style.backgroundImage = `url("${game.imageUrl.replace(/["\\\\]/g, "")}")`;
    art.style.backgroundRepeat = "no-repeat"; art.style.backgroundPosition = "center"; art.style.backgroundSize = "contain";
    const details = document.createElement("span"); details.className = "game-details";
    const title = document.createElement("strong"); title.textContent = game.title;
    const description = document.createElement("small"); description.textContent = game.description || "";
    const play = document.createElement("span"); play.className = "game-play"; play.append(document.createTextNode("Play inside Firemon ")); const arrow = document.createElement("b"); arrow.textContent = "→"; play.append(arrow);
    details.append(title, description, play); button.append(art, details); button.addEventListener("click", () => openGame(game.id)); gameGrid.append(button);
  }
}
async function refreshGameCatalog() {
  const response = await fetch("/api/games", { cache: "no-store" }); if (!response.ok) throw new Error("Could not load games.");
  const games = await response.json(); gameCatalog = Array.isArray(games) ? games.filter((game) => game && typeof game.id === "string" && typeof game.title === "string" && typeof game.path === "string") : []; renderGameCards();
}
function openGame(gameId) {
  const game = gameCatalog.find((entry) => entry.id === gameId);
  if (!game) return;
  const tab = makeTab("", game.title);
  tab.view = "game";
  tab.localPath = game.path;
  tab.loading = true;
  tab.element.setAttribute("allow", "autoplay; fullscreen; gamepad");
  tab.element.allowFullscreen = true;
  tab.element.src = tab.localPath;
  selectTab(tab.id);
}
function createTab(url = "", { background = false } = {}) {
  const tab = makeTab();
  if (!background || !activeId) selectTab(tab.id);
  else {
    renderTabs();
    persistTabs();
  }
  if (url) navigateInTab(tab, url);
  else if (!background) homeAddress.focus({ preventScroll: true });
  return tab;
}

async function ensureSession(tab) {
  tab.element.removeAttribute("allow");
  tab.element.removeAttribute("allowfullscreen");
  if (tab.session) return tab.session;
  if (tab.sessionPromise) return tab.sessionPromise;
  if (!controller) throw new Error("The proxy is still starting. Try again in a moment.");

  tab.sessionPromise = Promise.resolve().then(() => {
    tab.session = controller.createFrame(tab.element, {
      plugins: [
        new utils.HttpCachePlugin(),
        new utils.UrlWatcherPlugin((url) => {
          tab.url = url;
  tab.view = "";
  tab.localPath = "";
          tab.title = titleFor(url);
          tab.loading = false;
          if (tab.id === activeId) {
            address.value = url;
            document.title = tab.title + " · Firemon Unblocked";
            let onMovies = false;
            try { onMovies = new URL(url).hostname.replace(/^www\./, "") === "movy.sx"; } catch {}
            document.querySelector("#movies-button").setAttribute("aria-current", onMovies ? "page" : "false");
          }
          renderTabs();
          persistTabs();
        }),
        new utils.CatchEscapedLinksPlugin((url) => { createTab(url); return new URL(location.href); })
      ]
    });
    return tab.session;
  }).finally(() => { tab.sessionPromise = null; });
  return tab.sessionPromise;
}

async function navigateInTab(tab, value) {
  const url = parseInput(value);
  if (!url) {
    if (tab.id === activeId) {
      const input = home.hidden ? address : homeAddress;
      input.setCustomValidity("Enter a search or a valid http/https address.");
      input.reportValidity();
      input.focus();
    }
    return;
  }
  tab.url = url;
  tab.view = "";
  tab.localPath = "";
  tab.title = titleFor(url);
  tab.loading = true;
  if (tab.id === activeId) {
    address.value = url;
    document.title = tab.title + " · Firemon Unblocked";
  }
  updateChrome();
  const urlToOpen = url;
  try {
    const session = await ensureSession(tab);
    if (tab.url === urlToOpen) session.go(urlToOpen);
  } catch (error) {
    tab.loading = false;
    renderTabs();
    notify(error.message || "Could not open this page.");
  }
}

function navigate(value) {
  let tab = activeTab();
  if (!tab) tab = createTab();
  navigateInTab(tab, value);
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  if (tab.session && controller) {
    const frameIndex = controller.frames.indexOf(tab.session);
    if (frameIndex >= 0) controller.frames.splice(frameIndex, 1);
  }
  tab.element.remove();

  if (activeId === id) {
    const next = tabs[index] || tabs[index - 1];
    activeId = next?.id || null;
    if (next) selectTab(next.id);
  }
  if (!tabs.length) createTab();
  else updateChrome();
}

function setLoading(tab, value) {
  tab.loading = value;
  renderTabs();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Scramjet runtime: " + src));
    document.head.append(script);
  });
}

async function loadRuntime() {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    throw new Error("Open Firemon on localhost or an HTTPS website to enable Scramjet.");
  }
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  }
  const serviceworker = navigator.serviceWorker.controller ?? registration.active;
  if (!serviceworker) throw new Error("Scramjet's service worker did not start.");

  for (const src of ["/scram/scramjet.js", "/controller/controller.api.js", "/utils/scramjet-utils.js"]) {
    await loadScript(src);
  }
  const api = window.$scramjetController;
  utils = window.$scramjetUtils;
  const { default: LibcurlClient } = await import("/libcurl/index.mjs");
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const transport = new LibcurlClient({ wisp: `${scheme}//${location.host}/wisp/` });
  controller = new api.Controller({
    serviceworker,
    transport,
    config: {
      scramjetPath: "/scram/scramjet.js",
      wasmPath: "/scram/scramjet.wasm",
      injectPath: "/controller/controller.inject.js"
    }
  });
  await controller.wait();
  proxyLabel.textContent = "Proxy Connected";
  document.querySelector("#proxy-state").classList.add("connected");
  setInterval(() => navigator.serviceWorker.controller?.postMessage("keepalive"), 15000);

  if (!tabs.length) createTab();
  const selected = activeTab();
  if (selected?.url) {
    selected.loading = true;
    renderTabs();
    const session = await ensureSession(selected);
    session.go(selected.url);
  } else if (!selected?.view) {
    homeAddress.focus({ preventScroll: true });
  }
}

navForm.addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(address.value);
});
homeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(homeAddress.value);
});
document.querySelectorAll(".quick-card[data-url]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); navigate(link.dataset.url); }));
homeAddress.addEventListener("input", () => homeAddress.setCustomValidity(""));
address.addEventListener("input", () => address.setCustomValidity(""));
document.querySelector("#new-tab").addEventListener("click", () => createTab());
document.querySelector("#bottom-home").addEventListener("click", goHome);
document.querySelector("#movies-button").addEventListener("click", () => {
  createTab("https://movy.sx/");
});
document.querySelector("#settings-button").addEventListener("click", openSettings);
document.querySelector("#games-button").addEventListener("click", openGames);

document.querySelectorAll(".background-option").forEach((option) => option.addEventListener("click", () => applyBackground(option.dataset.background)));
document.querySelectorAll(".engine-option").forEach((option) => option.addEventListener("click", () => applySearchEngine(option.dataset.engine)));
document.querySelector("#back").addEventListener("click", () => activeTab()?.session?.back());
document.querySelector("#forward").addEventListener("click", () => activeTab()?.session?.forward());
document.querySelector("#reload").addEventListener("click", () => {
  const tab = activeTab();
  if (tab?.session) {
    setLoading(tab, true);
    tab.session.reload();
  }
});
window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === "t") {
    event.preventDefault();
    createTab();
  } else if (event.key.toLowerCase() === "l") {
    event.preventDefault();
    address.focus();
    address.select();
  } else if (event.key === "Tab" && tabs.length > 1) {
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === activeId);
    const direction = event.shiftKey ? -1 : 1;
    const next = (index + direction + tabs.length) % tabs.length;
    selectTab(tabs[next].id);
  }
});

const savedAtStart = getSavedTabs();
if (savedAtStart?.tabs?.length) {
  for (const entry of savedAtStart.tabs) {
    const tab = makeTab(entry.url || "", entry.title || "");
    tab.view = entry.view || "";
    tab.localPath = entry.localPath || "";
    if (tab.view === "game" && tab.localPath) {
      tab.element.setAttribute("allow", "autoplay; fullscreen");
      tab.element.allowFullscreen = true;
      tab.element.src = tab.localPath;
    }
  }
  const restored = tabs[Math.min(Math.max(savedAtStart.active || 0, 0), tabs.length - 1)];
  activeId = restored.id;
  updateChrome();
} else {
  createTab();
}

let initialBackground = "stars";
try { initialBackground = localStorage.getItem("firemon-background-v1") || "stars"; } catch {}
applyBackground(initialBackground);
let initialSearchEngine = "duckduckgo";
try { initialSearchEngine = localStorage.getItem("firemon-search-engine-v1") || "duckduckgo"; } catch {}
applySearchEngine(initialSearchEngine);

refreshGameCatalog().catch((error) => notify(error.message));
loadRuntime().catch((error) => {
  proxyLabel.textContent = "Proxy Offline";
  document.querySelector("#proxy-state").classList.remove("connected");
  notify(error.message || "Scramjet could not start.");
});
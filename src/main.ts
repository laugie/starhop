import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { AppearanceController, fontOf, themeOf } from "./appearance.ts";
import { fontReady, loadAppearance, saveAppearance } from "./appearance-api.ts";
import {
  addManualHost,
  errorText,
  listHosts,
  removeManualHost,
  sshConfigHosts,
  type HostEntry,
  type ListHostsResponse,
} from "./hosts.ts";
import { loadTopology, probePresence, type TopologyView } from "./topology.ts";
import { mergeDiscovered, type HomeDevices } from "./home-devices.ts";
import { parseSshInput } from "./ssh-paste.ts";
import { readKeyFile } from "./key-import.ts";
import { tailscaleHint } from "./welcome.ts";
import { PRESENCE_INTERVAL_MS, applyPresence, connectedDevices, type DevicePresence } from "./presence.ts";
import { renderTopology, syncDeviceOpenState } from "./topology-view.ts";
import { mountTerminal, type TerminalHost } from "./terminal.ts";
import { mountTabBar, toolButton, type TabBar } from "./tab-bar.ts";
import { closeSession, sshTargetOf } from "./session.ts";
import { AutoBeautify, reportMessage, type ShellTarget } from "./remote-shell.ts";
import { runRemoteShell } from "./remote-shell-api.ts";
import { onNativeDrag } from "./sftp-api.ts";
import { mountSftpView, type SftpView } from "./sftp-view.ts";
import { QuitPrompt } from "./quit-confirm.ts";
import { closePromptShown, onCloseRequested, quitConfirmed } from "./quit-api.ts";
import { askCloseConfirm, closeConfirmOpen, needsCloseConfirm } from "./close-confirm.ts";
import { sessionLimitMessage, TabStrip, type ShortcutAction } from "./tabs.ts";
import { authSettings, authStatus, type AuthStateName } from "./auth.ts";
import { mountLogin } from "./login.ts";
import { mountSettings } from "./settings.ts";
import { startupRoute } from "./startup.ts";
import { ZoomController } from "./zoom.ts";
import { loadUiZoom, saveUiZoom } from "./zoom-api.ts";
import { t } from "./locales/servers.ts";

const appElement = document.querySelector("#app");
if (!(appElement instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const app: HTMLElement = appElement;

type Page = "topology" | "manual";

// The home tab is the topology page. Manual servers share that tab and are
// toggled from the toolbar, so "拓扑" appears only once.
const manualButton = toolButton("servers", t("manualServers"));
manualButton.setAttribute("aria-pressed", "false");
const refreshButton = toolButton("reload", t("reload"));
const filesButton = toolButton("folder", t("files"));
filesButton.setAttribute("aria-pressed", "false");
const planetButton = toolButton("planet", t("view3d"));
planetButton.setAttribute("aria-pressed", "true");
planetButton.title = t("view3dTitle");

const statusBar = el("div", "status");
statusBar.setAttribute("role", "status");

const topologyRoot = el("div", "topology");
topologyRoot.tabIndex = -1;

const manualRoot = el("div", "manual-page");
manualRoot.hidden = true;
const list = document.createElement("ul");
list.className = "hosts";

const formSection = el("section", "panel");
const formTitle = el("h2", "section-title");
formTitle.textContent = t("addServer");
// Paste an ssh command or user@host:port to fill the fields below.
const pasteRow = el("div", "paste-row");
const pasteLabel = document.createElement("label");
pasteLabel.className = "field";
const pasteCaption = el("span", "field-label");
pasteCaption.textContent = t("pasteCaption");
const pasteInput = document.createElement("input");
pasteInput.type = "text";
pasteInput.autocomplete = "off";
pasteInput.spellcheck = false;
pasteInput.placeholder = t("pastePlaceholder");
pasteLabel.append(pasteCaption, pasteInput);
const pasteButton = document.createElement("button");
pasteButton.type = "button";
pasteButton.className = "button";
pasteButton.textContent = t("pasteFill");
pasteRow.append(pasteLabel, pasteButton);
const form = document.createElement("form");
form.className = "form";
const nameInput = field(form, t("name"), "name", "text", true);
const hostInput = field(form, t("host"), "host", "text", true);
const userInput = field(form, t("user"), "user", "text", false);
const portInput = field(form, t("port"), "port", "number", false);
portInput.placeholder = t("portDefault");
portInput.title = t("portTitle");
portInput.min = "1";
portInput.max = "65535";
// Optional private key. The text is read when the form is submitted.
const keyField = el("div", "field key-field");
keyField.title = t("keyTitle");
const keyCaption = el("span", "field-label");
keyCaption.textContent = t("keyLabel");
const keyInput = document.createElement("input");
keyInput.type = "file";
keyInput.hidden = true;
const keyRow = el("div", "key-row");
const keyChoose = document.createElement("button");
keyChoose.type = "button";
keyChoose.className = "button";
keyChoose.textContent = t("keyChoose");
const keyName = el("span", "key-name");
const keyClear = document.createElement("button");
keyClear.type = "button";
keyClear.className = "button ghost";
keyClear.textContent = t("keyClear");
keyRow.append(keyChoose, keyName, keyClear);
keyField.append(keyCaption, keyInput, keyRow);
form.append(keyField);
syncKeyField();
const submit = document.createElement("button");
submit.type = "submit";
submit.className = "button primary";
submit.textContent = t("add");
form.append(submit);
const formError = el("p", "form-error");
formError.setAttribute("role", "alert");
formSection.append(formTitle, pasteRow, form, formError);

// Import host aliases from ~/.ssh/config as manual servers.
const importSection = el("section", "panel import-panel");
const importTitle = el("h2", "section-title");
importTitle.textContent = t("importTitle");
const importNote = el("p", "import-note");
importNote.textContent = t("importNote");
const importLoad = document.createElement("button");
importLoad.type = "button";
importLoad.className = "button";
importLoad.textContent = t("importLoad");
const importList = el("ul", "import-list");
const importSubmit = document.createElement("button");
importSubmit.type = "button";
importSubmit.className = "button primary";
importSubmit.textContent = t("importSubmit");
importSubmit.hidden = true;
const importStatus = el("p", "form-error");
importStatus.setAttribute("role", "status");
importSection.append(importTitle, importNote, importLoad, importList, importSubmit, importStatus);

const manualInner = el("div", "manual-inner");
manualInner.append(list, formSection, importSection);
manualRoot.append(manualInner);

const terminalPanel = el("section", "terminal-panel");
terminalPanel.hidden = true;
const sftpPanel = el("section", "sftp-panel");
sftpPanel.hidden = true;
const shell = el("div", "shell");
shell.hidden = true;
shell.append(statusBar, topologyRoot, manualRoot, terminalPanel, sftpPanel);
app.append(shell);

const tabBar: TabBar = mountTabBar(shell, {
  onActivate: (key) => {
    if (strip.tabs[0]?.key === key) {
      showPage("topology");
      return;
    }
    present(key);
  },
  onClose: (key) => {
    void requestClose(key);
  },
  onNew: () => {
    focusHome();
  },
  onReconnect: () => {
    void reconnectActive();
  },
});

const host: { terminal: TerminalHost | null } = { terminal: null };
/** Wait after a tab connects before the background beautify run. */
const AUTO_BEAUTIFY_DELAY_MS = 4000;
/** Route of each session tab, for the remote shell script and file transfer. */
const shellTargets = new Map<string, ShellTarget>();
/** File transfer view of each session tab, made the first time it is opened. */
const sftpViews = new Map<string, SftpView>();
/** Session tabs currently showing file transfer instead of the terminal. */
const filesShown = new Set<string>();
const strip: TabStrip = new TabStrip({
  openSession(name: string, connectionName?: string): Promise<{ id: string }> {
    const opener = host.terminal;
    if (!opener) {
      throw new Error(t("cannotOpenTab"));
    }
    const tab = [...strip.tabs].reverse().find(
      (item) =>
        item.track === "device" &&
        item.deviceName === name &&
        item.connectionName === connectionName &&
        item.sessionId === undefined &&
        item.status === "connecting",
    );
    if (!tab) {
      throw new Error(t("cannotOpenTab"));
    }
    shellTargets.set(tab.key, {
      kind: "device",
      deviceName: name,
      ...(connectionName ? { connectionName } : {}),
    });
    return opener.openDevice(tab.key, name, connectionName);
  },
  closeSession: (id) => closeSession(id),
  limit: 8,
  onChange: () => {
    tabBar.render(strip);
    markActive();
  },
});

const terminal = mountTerminal(terminalPanel, {
  onChange: () => {
    tabBar.render(strip);
    markActive();
  },
  onConnected: (key, id) => {
    strip.onConnected(key, id);
    const target = shellTargets.get(key);
    if (target) {
      // The PTY is up but ssh may still be logging in; start a little later.
      window.setTimeout(() => {
        const tab = strip.tabs.find((item) => item.key === key);
        if (tab && tab.status === "connected" && shellTargets.get(key) === target) {
          void autoBeautify.connected(target, tab.title);
        }
      }, AUTO_BEAUTIFY_DELAY_MS);
    }
  },
  onExit: (key, code) => {
    strip.onExit(key, code);
  },
  onFailed: (key, message) => {
    strip.onFailed(key, message);
  },
  onShortcut: (action) => {
    if (action.type === "zoom") {
      void zoom.step(action.step);
      return;
    }
    if (!closeConfirmOpen()) {
      applyShortcut(action);
    }
  },
  onNew: () => {
    if (!closeConfirmOpen()) {
      focusHome();
    }
  },
  onCycle: (step) => {
    if (!closeConfirmOpen()) {
      cycleTab(step);
    }
  },
});
host.terminal = terminal;
tabBar.render(strip);

const settingsSlot = el("div", "settings-slot");
const settingsButton = toolButton("gear", t("settings"), { iconOnly: true });
settingsButton.setAttribute("aria-expanded", "false");
settingsSlot.append(settingsButton);
tabBar.end.append(filesButton, planetButton, manualButton, refreshButton, el("span", "toolbar-divider"), settingsSlot);
let zoomedTo = 100;
const zoom = new ZoomController({
  save: (percent) => saveUiZoom(percent),
  onChange: () => {
    if (zoom.percent !== zoomedTo) {
      zoomedTo = zoom.percent;
      terminal.refit();
    }
    settings.renderZoom();
  },
});
let appearanceRequest = 0;
let paintedMode = "3d";
const appearance: AppearanceController = new AppearanceController({
  save: (change) => saveAppearance(change),
  onChange: () => {
    settings.renderAppearance();
    planetButton.setAttribute("aria-pressed", appearance.topologyMode === "3d" ? "true" : "false");
    if (appearance.topologyMode !== paintedMode) {
      paintedMode = appearance.topologyMode;
      paintTopology();
    }
    const theme = themeOf(appearance.theme);
    const font = fontOf(appearance.font);
    const request = ++appearanceRequest;
    void fontReady(font.family, font.bundled).then(() => {
      if (request === appearanceRequest) {
        terminal.setAppearance(theme, font);
      }
    });
  },
});
const autoBeautify = new AutoBeautify({
  run: (target, mode) => runRemoteShell(target, mode),
  enabled: () => appearance.autoBeautify,
  onReport: (label, result, mode) => {
    const message =
      result instanceof Error ? t("labelledError", { label, message: result.message }) : reportMessage(result, label);
    settings.renderShell(message);
    if (AutoBeautify.notable(result, mode)) {
      showToast(message);
    }
  },
});
const settings = mountSettings(settingsButton, zoom, appearance, {
  active: () => {
    const tab = strip.tabs.find((item) => item.key === strip.activeKey);
    return tab && tab.kind === "session" && shellTargets.has(tab.key) ? tab.title : null;
  },
  run: (mode) => {
    const key = strip.activeKey;
    const target = shellTargets.get(key);
    return target ? autoBeautify.run(target, tabTitle(key), mode) : Promise.resolve();
  },
});
void loadAppearance()
  .then((view) => {
    appearance.load(view);
  })
  .catch(() => {
    appearance.load({ theme: appearance.theme, font: appearance.font, readOnly: false });
  });
void loadUiZoom()
  .then((view) => {
    zoom.load(view);
  })
  .catch(() => {
    // Keep 100%. The settings row shows the level actually in use.
  });

let page: Page = "topology";
let signedIn = false;
let refreshGeneration = 0;
let topologyGeneration = 0;
let topologyBusy = false;
let hostsBusy = false;
let manualLoaded = false;
let topologyView: TopologyView | null = null;
/** topology.json as loaded, before discovered devices are added. */
let topologyBase: TopologyView | null = null;
/** Last Tailscale + manual server list, shown on the home screen too. */
let discoveredHosts: ListHostsResponse | null = null;
let home: HomeDevices | null = null;
let presenceBusy = false;
let presenceAt = 0;
let lastPresence: DevicePresence[] = [];
let diagramWidth = 0;
let diagramFrame = 0;

// Re-lay out the diagram when the window width changes.
new ResizeObserver(() => {
  if (diagramFrame !== 0) {
    return;
  }
  diagramFrame = window.requestAnimationFrame(() => {
    diagramFrame = 0;
    const width = topologyRoot.clientWidth;
    if (topologyView && width > 0 && width !== diagramWidth) {
      paintTopology();
    }
  });
}).observe(topologyRoot);

planetButton.addEventListener("click", () => {
  void appearance.set({ topologyMode: appearance.topologyMode === "3d" ? "2d" : "3d" });
  if (page !== "topology" || !viewingHome()) {
    showPage("topology");
  }
});
filesButton.addEventListener("click", () => {
  const key = strip.activeKey;
  if (!shellTargets.has(key) || viewingHome()) {
    return;
  }
  if (filesShown.has(key)) {
    filesShown.delete(key);
  } else {
    filesShown.add(key);
  }
  present(key);
});
// Files dragged in from Finder or Explorer go to the file transfer view on screen.
void onNativeDrag((event) => {
  const key = strip.activeKey;
  if (signedIn && !viewingHome() && filesShown.has(key)) {
    sftpViews.get(key)?.nativeDrag(event);
  }
}).catch(() => {
  // Without the event the panes still work with buttons and in-app drags.
});
manualButton.addEventListener("click", () => {
  if (page === "manual" && viewingHome()) {
    showPage("topology");
    return;
  }
  showPage("manual");
  if (!manualLoaded) {
    void refreshHosts();
  }
});
refreshButton.addEventListener("click", () => {
  if (page === "topology") {
    void refreshTopology();
  } else {
    void refreshHosts();
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void onAdd();
});

function syncKeyField(): void {
  const file = keyInput.files?.[0];
  keyName.textContent = file ? file.name : t("keyNone");
  keyClear.hidden = !file;
}
keyChoose.addEventListener("click", () => {
  keyInput.click();
});
keyInput.addEventListener("change", () => {
  formError.textContent = "";
  syncKeyField();
});
keyClear.addEventListener("click", () => {
  keyInput.value = "";
  syncKeyField();
});

function fillFromPaste(): void {
  const parsed = parseSshInput(pasteInput.value);
  if ("error" in parsed) {
    formError.textContent = parsed.error;
    return;
  }
  formError.textContent = "";
  if (nameInput.value.trim() === "") {
    nameInput.value = parsed.name;
  }
  hostInput.value = parsed.host;
  userInput.value = parsed.user ?? "";
  portInput.value = parsed.port === null ? "" : String(parsed.port);
  nameInput.focus();
  nameInput.select();
}
pasteButton.addEventListener("click", fillFromPaste);
pasteInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    fillFromPaste();
  }
});

let importBusy = false;
async function loadSshConfig(): Promise<void> {
  if (importBusy) {
    return;
  }
  importBusy = true;
  importLoad.disabled = true;
  importStatus.textContent = "";
  try {
    const aliases = await sshConfigHosts();
    const added = new Set((discoveredHosts?.hosts ?? []).filter((h) => h.source !== "tailscale").map((h) => h.host));
    importList.replaceChildren();
    const fresh = aliases.filter((alias) => !added.has(alias));
    for (const alias of fresh) {
      const item = el("li", "import-item");
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = alias;
      box.checked = true;
      label.append(box, ` ${alias}`);
      item.append(label);
      importList.append(item);
    }
    importSubmit.hidden = fresh.length === 0;
    if (aliases.length === 0) {
      importStatus.textContent = t("importNone");
    } else if (fresh.length === 0) {
      importStatus.textContent = t("importAllAdded");
    }
  } catch (err) {
    importStatus.textContent = errorText(err);
  } finally {
    importBusy = false;
    importLoad.disabled = false;
  }
}
importLoad.addEventListener("click", () => {
  void loadSshConfig();
});
importSubmit.addEventListener("click", () => {
  void importSelected();
});

async function importSelected(): Promise<void> {
  const chosen = [...importList.querySelectorAll<HTMLInputElement>("input[type=checkbox]")]
    .filter((box) => box.checked)
    .map((box) => box.value);
  if (chosen.length === 0) {
    importStatus.textContent = t("importPickFirst");
    return;
  }
  importSubmit.disabled = true;
  importStatus.textContent = "";
  const failed: string[] = [];
  for (const alias of chosen) {
    try {
      // Connect by alias: ssh applies HostName, User, Port and keys itself.
      await addManualHost({ name: alias, host: alias, user: null, port: null });
    } catch (err) {
      failed.push(t("importFailedItem", { alias, error: errorText(err) }));
    }
  }
  importSubmit.disabled = false;
  await refreshHosts();
  await loadSshConfig();
  importStatus.textContent =
    failed.length > 0
      ? t("importPartial", { list: failed.join(t("importSeparator")) })
      : t("imported", { n: chosen.length });
}

// Window close button, Alt+F4 and Cmd+Q with open sessions: ask in the page.
const quitPrompt = new QuitPrompt({
  shown: () => closePromptShown(),
  // A tab's close dialog already holds the keyboard; the user can close again after it.
  ask: (message) =>
    closeConfirmOpen()
      ? Promise.resolve(false)
      : askCloseConfirm(t("quitTitle"), { message, confirmLabel: t("quitConfirm"), focusCancel: true }),
  confirm: () => quitConfirmed(),
});
void onCloseRequested((sessions) => {
  void quitPrompt.request(sessions);
});

void start();

async function start(): Promise<void> {
  const route = await resolveStartupRoute();
  if (route === "home") {
    enterApp();
    return;
  }
  mountLogin(app, () => {
    enterApp();
  });
}

async function resolveStartupRoute(): Promise<ReturnType<typeof startupRoute>> {
  let lockEnabled = false;
  try {
    const settings = await authSettings();
    lockEnabled = settings.loginLockEnabled;
  } catch {
    lockEnabled = false;
  }
  let authState: AuthStateName = "unavailable";
  try {
    const snapshot = await authStatus();
    authState = snapshot.state;
  } catch {
    authState = "unavailable";
  }
  return startupRoute({ lockEnabled, authState });
}

function enterApp(): void {
  signedIn = true;
  shell.hidden = false;
  showPage("topology");
  void refreshTopology();
}

function showPage(next: Page): void {
  page = next;
  syncNav();
  const home = strip.tabs[0];
  if (home) {
    present(home.key);
  }
}

function syncNav(): void {
  manualButton.setAttribute("aria-pressed", page === "manual" && viewingHome() ? "true" : "false");
  syncRefreshButton();
}

function focusHome(): void {
  page = "topology";
  syncNav();
  const home = strip.tabs[0];
  if (home) {
    present(home.key);
  }
  topologyRoot.focus();
}

function viewingHome(): boolean {
  const tab = strip.tabs.find((item) => item.key === strip.activeKey);
  return !tab || tab.kind === "home";
}

function present(key: string): void {
  strip.activate(key);
  const onHome = viewingHome();
  terminalPanel.hidden = onHome;
  if (onHome) {
    terminal.activate(null);
    showFiles(null);
    topologyRoot.hidden = page !== "topology";
    manualRoot.hidden = page !== "manual";
    statusBar.hidden = page !== "manual";
  } else {
    topologyRoot.hidden = true;
    manualRoot.hidden = true;
    statusBar.hidden = true;
    const files = filesShown.has(key) && shellTargets.has(key);
    terminalPanel.hidden = files;
    terminal.activate(files ? null : key);
    showFiles(files ? key : null);
  }
  tabBar.render(strip);
  markActive();
  syncNav();
  if (onHome) {
    void probePresenceNow();
  }
}

/** Show the file transfer view of `key`, or none. Creates it on first use. */
function showFiles(key: string | null): void {
  sftpPanel.hidden = key === null;
  for (const [viewKey, view] of sftpViews) {
    if (viewKey !== key) {
      view.root.hidden = true;
    }
  }
  if (key === null) {
    return;
  }
  const target = shellTargets.get(key);
  if (!target) {
    return;
  }
  let view = sftpViews.get(key);
  if (!view) {
    view = mountSftpView(sftpPanel, target, tabTitle(key), {
      onBack: () => {
        filesShown.delete(key);
        if (strip.activeKey === key) {
          present(key);
        }
      },
    });
    sftpViews.set(key, view);
  }
  view.show();
}

function syncFilesButton(): void {
  const key = strip.activeKey;
  const usable = !viewingHome() && shellTargets.has(key);
  filesButton.disabled = !usable;
  filesButton.title = usable ? t("filesTitle") : t("filesNeedTab");
  filesButton.setAttribute("aria-pressed", usable && filesShown.has(key) ? "true" : "false");
}

function applyShortcut(action: ShortcutAction): void {
  if (action.type === "close") {
    void requestClose(strip.activeKey);
    return;
  }
  if (action.type === "zoom") {
    void zoom.step(action.step);
    return;
  }
  strip.jump(action.index);
  present(strip.activeKey);
}

function cycleTab(step: number): void {
  const tabs = strip.tabs;
  const index = Math.max(0, tabs.findIndex((tab) => tab.key === strip.activeKey));
  const next = tabs[(index + step + tabs.length) % tabs.length];
  if (next) {
    present(next.key);
  }
}

async function requestClose(key: string): Promise<void> {
  if (closeConfirmOpen()) {
    return;
  }
  const tab = strip.tabs.find((item) => item.key === key);
  if (!tab || tab.kind !== "session") {
    return;
  }
  const transfers = sftpViews.get(key)?.busy() ?? 0;
  const ask =
    transfers > 0
      ? {
          message: t("transfersPending", { n: transfers }),
          confirmLabel: t("closeTab"),
          focusCancel: true,
        }
      : undefined;
  if ((needsCloseConfirm(tab.status) || transfers > 0) && !(await askCloseConfirm(tab.title, ask))) {
    present(strip.activeKey);
    return;
  }
  if (!strip.tabs.some((item) => item.key === key)) {
    return;
  }
  terminal.discard(key);
  sftpViews.get(key)?.dispose();
  sftpViews.delete(key);
  filesShown.delete(key);
  shellTargets.delete(key);
  strip.close(key);
  present(strip.activeKey);
}

async function connectDevice(name: string, connectionName?: string | null): Promise<void> {
  if (!strip.canOpen()) {
    tabBar.setAlert(sessionLimitMessage(strip.maxSessions()));
    markActive();
    return;
  }
  tabBar.setAlert("");
  terminalPanel.hidden = false;
  try {
    const pending = strip.openDevice(name, connectionName || undefined);
    present(strip.activeKey);
    await pending;
    present(strip.activeKey);
  } catch (err) {
    tabBar.setAlert(errorText(err));
    present(strip.activeKey);
  }
}

async function connectHost(host: HostEntry): Promise<void> {
  if (!strip.canOpen()) {
    tabBar.setAlert(sessionLimitMessage(strip.maxSessions()));
    markActive();
    return;
  }
  tabBar.setAlert("");
  terminalPanel.hidden = false;
  try {
    const pending = strip.openHost(host.name, host.id, () => {
      const tab = [...strip.tabs].reverse().find(
        (item) =>
          item.track === "host" &&
          item.hostId === host.id &&
          item.sessionId === undefined &&
          item.status === "connecting",
      );
      if (!tab) {
        throw new Error(t("cannotOpenTab"));
      }
      shellTargets.set(tab.key, { kind: "host", ...sshTargetOf(host) });
      return terminal.openHost(tab.key, host);
    });
    present(strip.activeKey);
    await pending;
    present(strip.activeKey);
  } catch (err) {
    tabBar.setAlert(errorText(err));
    present(strip.activeKey);
  }
}

async function reconnectActive(): Promise<void> {
  const tab = strip.tabs.find((item) => item.key === strip.activeKey);
  if (!tab || !strip.prepareReconnect(tab.key)) {
    return;
  }
  tabBar.setAlert("");
  try {
    await terminal.reconnect(tab.key);
  } catch (err) {
    tabBar.setAlert(errorText(err));
  }
  tabBar.render(strip);
}

function syncRefreshButton(): void {
  refreshButton.disabled = page === "topology" ? topologyBusy : hostsBusy;
}

async function refreshTopology(): Promise<void> {
  if (!signedIn) {
    return;
  }
  const generation = ++topologyGeneration;
  topologyBusy = true;
  syncRefreshButton();
  try {
    // The host list reads Tailscale; a failure there must not hide the topology.
    const [view, hosts] = await Promise.all([loadTopology(), listHosts().catch(() => null)]);
    if (generation !== topologyGeneration) {
      return;
    }
    topologyBase = view;
    if (hosts) {
      discoveredHosts = hosts;
    }
    rebuildHome();
    void probePresenceNow(true);
  } catch (err) {
    if (generation !== topologyGeneration) {
      return;
    }
    topologyBase = null;
    home = null;
    topologyView = {
      configPath: "",
      state: "error",
      message: errorText(err),
      regions: [],
    };
    paintTopology();
  } finally {
    if (generation === topologyGeneration) {
      topologyBusy = false;
      syncRefreshButton();
    }
  }
}

function topologyShowing(): boolean {
  return signedIn && !document.hidden && page === "topology" && viewingHome();
}

/**
 * One online-state round, only while the topology page is showing. Without
 * `force` it runs only when the last round is older than the interval, so
 * switching tabs does not probe the servers again and again.
 */
async function probePresenceNow(force = false): Promise<void> {
  if (presenceBusy || !topologyShowing() || topologyView?.state !== "ok") {
    return;
  }
  if (!force && Date.now() - presenceAt < PRESENCE_INTERVAL_MS) {
    return;
  }
  presenceBusy = true;
  presenceAt = Date.now();
  const generation = topologyGeneration;
  let reloaded = false;
  try {
    const results = await probePresence(connectedDevices(strip.tabs));
    if (generation !== topologyGeneration || !topologyView) {
      reloaded = true;
      return;
    }
    lastPresence = results;
    const next = applyPresence(topologyView, results);
    if (next !== topologyView) {
      topologyView = next;
      paintTopology();
    }
  } catch {
    // Keep the last states; the next round tries again.
  } finally {
    presenceBusy = false;
    if (reloaded) {
      void probePresenceNow(true);
    }
  }
}

window.setInterval(() => {
  void probePresenceNow();
}, 15_000);
document.addEventListener("visibilitychange", () => {
  void probePresenceNow();
});

/** Topology plus discovered devices, keeping the last online states. */
function rebuildHome(): void {
  if (!topologyBase) {
    return;
  }
  home = mergeDiscovered(topologyBase, discoveredHosts);
  // Keep the last online states until the next round replaces them.
  topologyView = applyPresence(home.view, lastPresence);
  paintTopology();
}

function activeHomeName(active: (typeof strip.tabs)[number] | undefined): string | null {
  if (active?.track === "device") {
    return active.deviceName ?? null;
  }
  if (active?.track === "host" && active.hostId) {
    return home?.nameByHostId.get(active.hostId) ?? null;
  }
  return null;
}

function paintTopology(): void {
  if (!topologyView) {
    return;
  }
  const active = strip.tabs.find((item) => item.key === strip.activeKey);
  diagramWidth = topologyRoot.clientWidth;
  renderTopology(topologyRoot, topologyView, {
    width: diagramWidth,
    onConnect: (name, connectionName) => {
      const host = home?.hostByName.get(name);
      if (host) {
        void connectHost(host);
        return;
      }
      void connectDevice(name, connectionName);
    },
    activeName: activeHomeName(active),
    welcome: {
      tailscale: tailscaleHint(discoveredHosts?.status ?? null, discoveredHosts?.message),
      configPath: topologyBase?.configPath ?? "",
      onAddServer: () => {
        showPage("manual");
        pasteInput.focus();
      },
      onImportSshConfig: () => {
        showPage("manual");
        void loadSshConfig();
        importSection.scrollIntoView({ block: "nearest" });
      },
    },
    canOpen: strip.canOpen(),
    mode: appearance.topologyMode,
  });
}

async function refreshHosts(): Promise<void> {
  if (!signedIn) {
    return;
  }
  const generation = ++refreshGeneration;
  hostsBusy = true;
  syncRefreshButton();
  try {
    const result = await listHosts();
    if (generation !== refreshGeneration) {
      return;
    }
    manualLoaded = true;
    render(result);
    discoveredHosts = result;
    rebuildHome();
    formError.textContent = "";
  } catch (err) {
    if (generation !== refreshGeneration) {
      return;
    }
    statusBar.dataset.state = "error";
    statusBar.title = "";
    statusBar.textContent = t("listFailed");
    formError.textContent = errorText(err);
  } finally {
    if (generation === refreshGeneration) {
      hostsBusy = false;
      syncRefreshButton();
    }
  }
}

async function onAdd(): Promise<void> {
  formError.textContent = "";
  const name = nameInput.value.trim();
  const host = hostInput.value.trim();
  const user = userInput.value.trim();
  const portRaw = portInput.value.trim();
  let port: number | null = null;
  if (portRaw !== "") {
    port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      formError.textContent = t("portRange");
      return;
    }
  }
  submit.disabled = true;
  try {
    const keyFile = keyInput.files?.[0];
    await addManualHost({
      name,
      host,
      user: user === "" ? null : user,
      port,
      identityKey: keyFile ? await readKeyFile(keyFile) : null,
    });
    form.reset();
    syncKeyField();
    await refreshHosts();
  } catch (err) {
    formError.textContent = errorText(err);
  } finally {
    submit.disabled = false;
  }
}

function render(result: ListHostsResponse): void {
  statusBar.replaceChildren();
  statusBar.dataset.state = result.status;
  statusBar.title = result.message ?? "";
  if (result.configNotice) {
    const notice = el("span", "status-notice");
    notice.textContent = result.configNotice;
    statusBar.append(notice);
  }
  if (result.message) {
    const message = el("span", "status-text");
    message.textContent = result.message;
    message.title = result.message;
    statusBar.append(message);
  }
  if (result.selfName) {
    const selfName = el("span", "status-self");
    selfName.textContent = t("selfName", { name: result.selfName });
    statusBar.append(selfName);
  }
  if (!result.message) {
    const message = el("span", "status-text");
    message.textContent = result.status === "ok" ? t("tailscaleRunning") : "";
    statusBar.append(message);
  }

  list.replaceChildren();
  if (result.hosts.length === 0) {
    const empty = el("li", "empty");
    empty.textContent = t("noServers");
    list.append(empty);
    return;
  }

  for (const host of result.hosts) {
    list.append(renderHost(host));
  }
}

function markActive(): void {
  syncFilesButton();
  const active = strip.tabs.find((item) => item.key === strip.activeKey);
  const activeId = active?.track === "host" ? active.hostId ?? null : null;
  const activeName = activeHomeName(active);
  const canOpen = strip.canOpen();
  const limit = sessionLimitMessage(strip.maxSessions());
  for (const item of list.querySelectorAll<HTMLLIElement>(".host")) {
    item.classList.toggle("host-active", item.dataset.hostId === activeId);
    item.classList.toggle("host-open-disabled", !canOpen);
    item.title = canOpen ? "" : limit;
    if (canOpen) {
      item.removeAttribute("aria-disabled");
    } else {
      item.setAttribute("aria-disabled", "true");
    }
  }
  for (const item of topologyRoot.querySelectorAll<SVGElement>(".device")) {
    item.classList.toggle("device-active", item.dataset.deviceName === activeName);
  }
  syncDeviceOpenState(topologyRoot, canOpen);
}

function renderHost(host: HostEntry): HTMLLIElement {
  const item = el("li", "host");
  item.dataset.hostId = host.id;
  const active = strip.tabs.find((item) => item.key === strip.activeKey);
  if (active?.track === "host" && host.id === active.hostId) {
    item.classList.add("host-active");
  }
  if (!strip.canOpen()) {
    item.classList.add("host-open-disabled");
    item.title = sessionLimitMessage(strip.maxSessions());
    item.setAttribute("aria-disabled", "true");
  }
  item.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-action='remove']")) {
      return;
    }
    void connectHost(host);
  });
  const main = el("div", "host-main");
  const dot = el("span", host.online === true ? "dot online" : "dot offline");
  dot.setAttribute("aria-label", host.online === true ? t("online") : t("offline"));
  const name = el("span", "host-name");
  name.textContent = host.name;
  main.append(dot, name);

  const meta = el("div", "host-meta");
  const address = el("span", "host-address");
  address.textContent = addressLine(host);
  const tag = el("span", "tag");
  tag.textContent = sourceLabel(host.source);
  meta.append(address, tag);
  if (host.hasKey) {
    const keyTag = el("span", "tag");
    keyTag.textContent = t("keyTag");
    meta.append(keyTag);
  }

  const connect = document.createElement("button");
  connect.type = "button";
  connect.className = "button";
  connect.textContent = t("connect");
  meta.append(connect);

  if (host.source === "manual" || host.source === "tailscale+manual") {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button ghost";
    remove.dataset.action = "remove";
    remove.textContent = t("remove");
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      void onRemove(host.id);
    });
    meta.append(remove);
  }

  item.append(main, meta);
  return item;
}

async function onRemove(id: string): Promise<void> {
  formError.textContent = "";
  try {
    await removeManualHost(id);
    await refreshHosts();
  } catch (err) {
    formError.textContent = errorText(err);
  }
}

function addressLine(host: HostEntry): string {
  const target = host.ip ?? host.host;
  const withUser = host.user ? `${host.user}@${target}` : target;
  return host.port == null ? withUser : `${withUser}:${host.port}`;
}

function sourceLabel(source: HostEntry["source"]): string {
  switch (source) {
    case "tailscale":
      return "Tailscale";
    case "manual":
      return t("sourceManual");
    case "tailscale+manual":
      return t("sourceBoth");
  }
}

function tabTitle(key: string): string {
  return strip.tabs.find((item) => item.key === key)?.title ?? "";
}

let toastTimer = 0;
const toast = el("div", "toast");
toast.setAttribute("role", "status");
toast.hidden = true;
app.append(toast);

/** A short notice that does not move the terminal. Click to dismiss. */
function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 9000);
}
toast.addEventListener("click", () => {
  toast.hidden = true;
});

function field(
  form: HTMLFormElement,
  labelText: string,
  name: string,
  type: string,
  required: boolean,
): HTMLInputElement {
  const label = document.createElement("label");
  label.className = "field";
  const caption = el("span", "field-label");
  caption.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.required = required;
  input.autocomplete = "off";
  label.append(caption, input);
  form.append(label);
  return input;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

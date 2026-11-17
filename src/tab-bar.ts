import { dropSlot, statusLabel, type TabModel, type TabStrip } from "./tabs.ts";
import { uiIcon, type UiIconName } from "./ui-icons.ts";
import { t } from "./locales/tabs.ts";

export interface TabBar {
  render(strip: TabStrip): void;
  setAlert(message: string): void;
  end: HTMLElement;
}

export function mountTabBar(
  parent: HTMLElement,
  handlers: {
    onActivate(key: string): void;
    onClose(key: string): void;
    /** A session tab was dragged to `index` in the strip (home is index 0). */
    onMove(key: string, index: number): void;
    onNew(): void;
    onReconnect(): void;
  },
): TabBar {
  const bar = el("div", "tabbar");
  const list = el("div", "tabbar-list tab-list");
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", t("tabList"));

  const fresh = toolButton("plus", t("newTab"), { iconOnly: true });
  fresh.classList.add("tabbar-new");
  fresh.title = t("newTabTitle");
  fresh.addEventListener("click", () => {
    handlers.onNew();
  });

  const reconnect = toolButton("reconnect", t("reconnect"));
  reconnect.classList.add("tabbar-reconnect", "attention");
  reconnect.hidden = true;
  reconnect.addEventListener("click", () => {
    handlers.onReconnect();
  });

  const alert = el("p", "tabbar-alert");
  alert.setAttribute("role", "alert");
  alert.hidden = true;

  const end = el("div", "tabbar-end");
  end.append(reconnect);
  bar.append(list, fresh, end);
  parent.prepend(bar, alert);

  // Dragging reorders session tabs. Pointer events, not HTML5 drag and drop:
  // Tauri takes over system drag and drop, and on Windows HTML5 drops never
  // arrive. The strip re-renders on every move (and whenever a session changes
  // state), so the drag is tracked by tab key, never by element.
  let drag: TabDrag | null = null;
  let suppressClick = false;
  let current: TabStrip | null = null;

  list.addEventListener("pointerdown", onPointerDown);
  // The click that ends a drag must not switch tabs.
  list.addEventListener(
    "click",
    (event) => {
      if (suppressClick) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    true,
  );

  function render(strip: TabStrip): void {
    current = strip;
    if (drag && !strip.tabs.some((tab) => tab.key === drag?.key && tab.kind === "session")) {
      endDrag();
    }
    list.replaceChildren();
    for (const tab of strip.tabs) {
      list.append(renderTab(tab, tab.key === strip.activeKey));
    }
    followPointer();
    const active = strip.tabs.find((tab) => tab.key === strip.activeKey);
    reconnect.hidden = !active || active.kind !== "session" || active.status !== "ended";
  }

  function renderTab(tab: TabModel, selected: boolean): HTMLElement {
    const element = el("div", "tab");
    element.dataset.key = tab.key;
    element.setAttribute("role", "tab");
    element.tabIndex = 0;
    element.classList.toggle("tab-active", selected);
    element.classList.toggle("tab-home", tab.kind === "home");
    element.setAttribute("aria-selected", selected ? "true" : "false");
    const caption = tabCaption(tab);
    element.title = caption;
    element.setAttribute("aria-label", caption);
    if (tab.kind === "home") {
      element.insertAdjacentHTML("beforeend", uiIcon("topology"));
    }
    if (tab.kind === "session") {
      const dot = el("span", `tab-status tab-status-${tab.status}`);
      dot.setAttribute("aria-hidden", "true");
      element.append(dot);
      element.classList.toggle("tab-ended", tab.status === "ended" || tab.status === "failed");
    }
    const title = el("span", "tab-title");
    title.textContent = tab.title;
    element.append(title);
    if (tab.kind === "session") {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.setAttribute("aria-label", t("closeTab"));
      close.innerHTML = uiIcon("close");
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onClose(tab.key);
      });
      element.append(close);
    }
    element.classList.toggle("tab-dragging", drag?.active === true && drag.key === tab.key);
    element.addEventListener("click", () => {
      handlers.onActivate(tab.key);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handlers.onActivate(tab.key);
    });
    return element;
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || drag || !(event.target instanceof Element)) {
      return;
    }
    if (event.target.closest(".tab-close")) {
      return;
    }
    const element = event.target.closest<HTMLElement>(".tab");
    const key = element?.dataset.key;
    const tab = current?.tabs.find((item) => item.key === key);
    if (!element || !key || !tab || tab.kind !== "session") {
      return;
    }
    const rect = element.getBoundingClientRect();
    drag = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      grab: event.clientX - rect.left,
      startIndex: current?.tabs.indexOf(tab) ?? 1,
      active: false,
    };
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", cancelDrag, true);
    document.addEventListener("keydown", onDragKey, true);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    drag.x = event.clientX;
    if (!drag.active) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved < TAB_DRAG_THRESHOLD_PX) {
        return;
      }
      drag.active = true;
      bar.classList.add("tabbar-dragging");
      tabElement(drag.key)?.classList.add("tab-dragging");
    }
    event.preventDefault();
    const elements = sessionElements();
    const dragged = elements.findIndex((element) => element.dataset.key === drag?.key);
    if (dragged < 0) {
      return;
    }
    // Centres from where the tabs sit in the row, ignoring the dragged tab's offset.
    const centers = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const shift = element.dataset.key === drag?.key ? currentShift(element) : 0;
      return rect.left - shift + rect.width / 2;
    });
    const draggedCenter = event.clientX - drag.grab + (elements[dragged]?.getBoundingClientRect().width ?? 0) / 2;
    const slot = dropSlot(centers, dragged, draggedCenter);
    if (slot !== dragged) {
      // Session tabs start at index 1, after home.
      handlers.onMove(drag.key, slot + 1);
    }
    followPointer();
  }

  function onPointerUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const wasActive = drag.active;
    endDrag();
    if (wasActive) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  }

  function onDragKey(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !drag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
  }

  /** Escape or a cancelled pointer puts the tab back where the drag began. */
  function cancelDrag(): void {
    const state = drag;
    endDrag();
    if (state?.active) {
      handlers.onMove(state.key, state.startIndex);
    }
  }

  function endDrag(): void {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", cancelDrag, true);
    document.removeEventListener("keydown", onDragKey, true);
    const key = drag?.key;
    drag = null;
    bar.classList.remove("tabbar-dragging");
    const element = key ? tabElement(key) : null;
    if (element) {
      element.classList.remove("tab-dragging");
      element.style.transform = "";
    }
  }

  /** Shifts the dragged tab so it stays under the pointer, within the session tabs. */
  function followPointer(): void {
    if (!drag?.active) {
      return;
    }
    const element = tabElement(drag.key);
    const elements = sessionElements();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!element || !first || !last) {
      return;
    }
    element.style.transform = "";
    const rect = element.getBoundingClientRect();
    const min = first.getBoundingClientRect().left;
    const max = last.getBoundingClientRect().right - rect.width;
    const left = Math.min(Math.max(drag.x - drag.grab, min), Math.max(min, max));
    element.style.transform = `translateX(${left - rect.left}px)`;
  }

  function currentShift(element: HTMLElement): number {
    const match = /translateX\((-?[\d.]+)px\)/.exec(element.style.transform);
    return match ? Number(match[1]) : 0;
  }

  function sessionElements(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>(".tab:not(.tab-home)"));
  }

  function tabElement(key: string): HTMLElement | null {
    return sessionElements().find((element) => element.dataset.key === key) ?? null;
  }

  return {
    render,
    end,
    setAlert(message: string): void {
      alert.textContent = message;
      alert.hidden = message === "";
    },
  };
}

/** Pointer travel before a press on a tab becomes a drag. */
const TAB_DRAG_THRESHOLD_PX = 5;

interface TabDrag {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Latest pointer x. */
  x: number;
  /** Distance from the tab's left edge to the pointer when pressed. */
  grab: number;
  /** Index in the strip when the drag began, for Escape. */
  startIndex: number;
  active: boolean;
}

/** Flat toolbar button with an icon and an optional visible label. */
export function toolButton(
  icon: UiIconName,
  label: string,
  options: { iconOnly?: boolean } = {},
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = options.iconOnly ? "tool-button icon-only" : "tool-button";
  button.setAttribute("aria-label", label);
  button.insertAdjacentHTML("beforeend", uiIcon(icon));
  if (options.iconOnly) {
    button.title = label;
  } else {
    const text = el("span", "tool-label");
    text.textContent = label;
    button.append(text);
  }
  return button;
}

function tabCaption(tab: TabModel): string {
  if (tab.kind === "home") {
    return tab.title;
  }
  const status = statusLabel(tab.status);
  if (tab.detail) {
    return t("captionDetail", { title: tab.title, status, detail: tab.detail });
  }
  return t("caption", { title: tab.title, status });
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

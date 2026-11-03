/** Choosing a direct / ProxyJump session or a command relay. No DOM. */

import { t } from "./locales/topology.js";

export const DEFAULT_CONNECTION_LABEL = t("defaultConnection");

export interface ConnectionChoice {
  /** `null` is the device's existing direct or ProxyJump method. */
  connectionName: string | null;
  label: string;
}

export type MenuAction =
  | { type: "move"; index: number }
  | { type: "choose" }
  | { type: "close" }
  | { type: "ignore" };

/** No menu when the device has no extra relays. */
export function connectionChoices(
  names: readonly string[] | undefined,
): ConnectionChoice[] | null {
  if (!names || names.length === 0) {
    return null;
  }
  return [
    { connectionName: null, label: DEFAULT_CONNECTION_LABEL },
    ...names.map((name) => ({ connectionName: name, label: name })),
  ];
}

export function deviceTabTitle(deviceName: string, connectionName?: string | null): string {
  if (!connectionName) {
    return deviceName;
  }
  return `${deviceName} · ${connectionName}`;
}

/** Fields for `open_session`. An empty connection name is the default method. */
export function topologySessionFields(
  deviceName: string,
  connectionName?: string | null,
): { deviceName: string; connectionName?: string } {
  if (!connectionName) {
    return { deviceName };
  }
  return { deviceName, connectionName };
}

/**
 * Same allowlist as the backend relay template.
 * Returns an error message, or `null` when the template is accepted.
 * The backend still checks the file; this does not replace that.
 */
export function relayCommandError(command: string): string | null {
  if (command.length === 0) {
    return t("relayEmpty");
  }
  if (command.startsWith("-")) {
    return t("relayDash");
  }
  let hasHost = false;
  let hasPort = false;
  for (let index = 0; index < command.length; ) {
    const ch = command[index] ?? "";
    if (ch === "%") {
      const next = command[index + 1];
      if (next === undefined) {
        return t("relayUnknownPlaceholder");
      }
      if (next === "h") {
        hasHost = true;
      } else if (next === "p") {
        hasPort = true;
      } else if (next !== "%") {
        return t("relayUnknownPlaceholderNamed", { name: next });
      }
      index += 2;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return t("relayControl");
    }
    if (!/[A-Za-z0-9._/:=@+\- ]/.test(ch)) {
      return t("relayChar", { ch });
    }
    index += 1;
  }
  if (!hasHost || !hasPort) {
    return t("relayHostPort");
  }
  return null;
}

export function menuAction(key: string, choiceCount: number, index: number): MenuAction {
  if (choiceCount <= 0) {
    return { type: "ignore" };
  }
  if (key === "ArrowDown") {
    return { type: "move", index: (index + 1) % choiceCount };
  }
  if (key === "ArrowUp") {
    return { type: "move", index: (index - 1 + choiceCount) % choiceCount };
  }
  if (key === "Enter" || key === " ") {
    return { type: "choose" };
  }
  if (key === "Escape") {
    return { type: "close" };
  }
  return { type: "ignore" };
}

/** Markup for the jump / relay chooser. The command field is a local check only. */
export function renderConnectionMenu(deviceName: string, names: readonly string[]): string {
  const choices = connectionChoices(names) ?? [
    { connectionName: null, label: DEFAULT_CONNECTION_LABEL },
  ];
  const items = choices
    .map((choice) => {
      const value = choice.connectionName === null ? "" : escapeHtml(choice.connectionName);
      return `<button type="button" class="button" role="menuitem" data-connection="${value}">${escapeHtml(choice.label)}</button>`;
    })
    .join("");
  return (
    `<div class="connection-menu" role="menu" aria-label="${escapeHtml(t("menuLabel"))}">` +
    `<p class="connection-menu-title">${escapeHtml(deviceName)}</p>` +
    items +
    `<label class="relay-command-label">${escapeHtml(t("relayCommand"))}<input class="relay-command-input" type="text" spellcheck="false"></label>` +
    `<p class="relay-command-error" role="alert"></p>` +
    `<p class="connection-menu-note">${escapeHtml(t("menuNote"))}</p>` +
    `</div>`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

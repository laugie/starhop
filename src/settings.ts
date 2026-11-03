import { ANSI_KEYS, FONTS, THEMES, themeOf, type AppearanceController } from "./appearance.ts";
import { fontInstalled } from "./appearance-api.ts";
import { authSetLock, authSettings, authSetup, type LockSettings } from "./auth.ts";
import { errorText } from "./hosts.ts";
import { mountCredentialPrompt } from "./login.ts";
import { planLockChange } from "./startup.ts";
import { toolButton } from "./tab-bar.ts";
import { shortcutPlatform } from "./terminal.ts";
import { zoomLabel, type ZoomController } from "./zoom.ts";
import { locale, type LocaleSetting } from "./i18n.ts";
import { saveLocale, startLocale } from "./locale-api.ts";
import { t } from "./locales/settings.ts";

export interface SettingsPanel {
  /** Show the current zoom level and which steps are possible. */
  renderZoom(): void;
  /** Show the current terminal theme and font. */
  renderAppearance(): void;
  /** Refresh the remote shell row; `status` replaces the last result line. */
  renderShell(status?: string): void;
}

/** The remote shell row acts on the active tab's host. */
export interface ShellActions {
  /** Title of the active session tab, or null on the home tab. */
  active(): string | null;
  run(mode: "apply" | "restore"): Promise<void>;
}

/**
 * Gear button dialog: UI zoom, terminal theme and font, and a switch that
 * requires login on the next launch. The button itself is created by the
 * shell so the top bar owns the slot.
 */
export function mountSettings(
  button: HTMLButtonElement,
  zoom: ZoomController,
  appearance: AppearanceController,
  shell: ShellActions,
): SettingsPanel {
  const slot = button.parentElement;
  if (!(slot instanceof HTMLElement)) {
    throw new Error("missing settings slot");
  }

  const dialog = document.createElement("div");
  dialog.className = "settings-popover";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", t("title"));

  const title = document.createElement("h2");
  title.className = "section-title";
  title.id = "settings-title";
  title.textContent = t("title");
  dialog.setAttribute("aria-labelledby", title.id);

  const row = document.createElement("label");
  row.className = "settings-switch";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const caption = document.createElement("span");
  caption.textContent = t("loginLock");
  row.append(checkbox, caption);

  const notice = document.createElement("p");
  notice.className = "settings-notice";

  const hint = document.createElement("p");
  hint.className = "login-hint";

  const dialogError = document.createElement("p");
  dialogError.className = "form-error";
  dialogError.setAttribute("role", "alert");

  const promptHost = document.createElement("div");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "button";
  closeButton.textContent = t("close");

  const zoomRow = document.createElement("div");
  zoomRow.className = "settings-zoom";
  zoomRow.setAttribute("role", "group");
  const zoomCaption = document.createElement("span");
  zoomCaption.id = "settings-zoom-caption";
  zoomCaption.textContent = t("zoom");
  zoomRow.setAttribute("aria-labelledby", zoomCaption.id);
  const zoomOut = toolButton("minus", t("zoomOut"), { iconOnly: true });
  const zoomValue = document.createElement("output");
  zoomValue.className = "settings-zoom-value";
  zoomValue.setAttribute("aria-live", "polite");
  const zoomIn = toolButton("plus", t("zoomIn"), { iconOnly: true });
  const zoomReset = document.createElement("button");
  zoomReset.type = "button";
  zoomReset.className = "button";
  zoomReset.textContent = t("zoomReset");
  const zoomControls = document.createElement("div");
  zoomControls.className = "settings-zoom-controls";
  zoomControls.append(zoomOut, zoomValue, zoomIn, zoomReset);
  zoomRow.append(zoomCaption, zoomControls);
  const mod = shortcutPlatform() === "mac" ? "⌘" : "Ctrl+";
  const zoomHint = document.createElement("p");
  zoomHint.className = "login-hint";
  zoomHint.textContent = t("zoomShortcuts", { mod });
  const zoomNotice = document.createElement("p");
  zoomNotice.className = "settings-notice";
  zoomOut.addEventListener("click", () => {
    void zoom.step("out");
  });
  zoomIn.addEventListener("click", () => {
    void zoom.step("in");
  });
  zoomReset.addEventListener("click", () => {
    void zoom.step("reset");
  });

  const divider = document.createElement("hr");
  divider.className = "settings-divider";

  const themeField = selectField(t("theme"), "settings-theme");
  for (const theme of THEMES) {
    themeField.select.append(new Option(theme.label, theme.id));
  }
  const swatches = document.createElement("div");
  swatches.className = "settings-swatches";
  swatches.setAttribute("aria-hidden", "true");
  const fontField = selectField(t("font"), "settings-font");
  const fontOptions = FONTS.map((choice) => {
    const installed = choice.bundled || fontInstalled(choice.family);
    const option = new Option(installed ? choice.label : t("fontMissing", { label: choice.label }), choice.id);
    option.dataset.installed = installed ? "true" : "false";
    fontField.select.append(option);
    return option;
  });
  const appearanceNotice = document.createElement("p");
  appearanceNotice.className = "settings-notice";
  themeField.select.addEventListener("change", () => {
    void appearance.set({ theme: themeField.select.value });
  });
  fontField.select.addEventListener("change", () => {
    void appearance.set({ font: fontField.select.value });
  });

  const lookDivider = document.createElement("hr");
  lookDivider.className = "settings-divider";

  const shellDivider = document.createElement("hr");
  shellDivider.className = "settings-divider";
  const autoRow = document.createElement("label");
  autoRow.className = "settings-switch";
  const autoBox = document.createElement("input");
  autoBox.type = "checkbox";
  const autoCaption = document.createElement("span");
  autoCaption.textContent = t("beautify");
  autoRow.append(autoBox, autoCaption);
  const shellHelp = document.createElement("p");
  shellHelp.className = "settings-help";
  shellHelp.textContent = t("beautifyHelp");
  const shellRow = document.createElement("div");
  shellRow.className = "settings-shell";
  const shellTarget = document.createElement("span");
  shellTarget.className = "settings-shell-target";
  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "button";
  applyButton.textContent = t("beautifyApply");
  const restoreButton = document.createElement("button");
  restoreButton.type = "button";
  restoreButton.className = "button ghost";
  restoreButton.textContent = t("beautifyRestore");
  const shellButtons = document.createElement("div");
  shellButtons.className = "settings-shell-buttons";
  shellButtons.append(applyButton, restoreButton);
  shellRow.append(shellTarget, shellButtons);
  const shellStatus = document.createElement("p");
  shellStatus.className = "settings-shell-status";
  shellStatus.setAttribute("aria-live", "polite");
  let shellBusy = false;
  autoBox.addEventListener("change", () => {
    void appearance.set({ autoBeautify: autoBox.checked });
  });
  for (const [button, mode] of [
    [applyButton, "apply"],
    [restoreButton, "restore"],
  ] as const) {
    button.addEventListener("click", () => {
      if (shellBusy || shell.active() === null) {
        return;
      }
      shellBusy = true;
      renderShell(mode === "apply" ? t("beautifyApplying") : t("beautifyRestoring"));
      void shell.run(mode).finally(() => {
        shellBusy = false;
        renderShell();
      });
    });
  }

  // Language: saved now, used from the next start (the whole UI is built once).
  const languageField = selectField(t("language"), "settings-language");
  for (const [value, label] of [
    ["auto", t("languageAuto")],
    ["en", "English"],
    ["zh-CN", "简体中文"],
  ] as const) {
    languageField.select.append(new Option(label, value));
  }
  languageField.select.value = startLocale()?.setting ?? "auto";
  languageField.select.disabled = startLocale()?.readOnly ?? false;
  const languageNote = document.createElement("p");
  languageNote.className = "login-hint";
  languageNote.textContent = t("languageNote");
  languageNote.hidden = true;
  languageField.select.addEventListener("change", () => {
    const setting = languageField.select.value as LocaleSetting;
    void saveLocale(setting, navigator.language || "").then(
      (view) => {
        languageNote.textContent = view.message ?? t("languageNote");
        languageNote.hidden = view.effective === locale() && !view.message;
      },
      (err: unknown) => {
        languageNote.textContent = errorText(err);
        languageNote.hidden = false;
      },
    );
  });
  const languageDivider = document.createElement("hr");
  languageDivider.className = "settings-divider";

  dialog.append(
    title,
    languageField.row,
    languageNote,
    languageDivider,
    zoomRow,
    zoomHint,
    zoomNotice,
    lookDivider,
    themeField.row,
    swatches,
    fontField.row,
    appearanceNotice,
    shellDivider,
    autoRow,
    shellHelp,
    shellRow,
    shellStatus,
    divider,
    row,
    notice,
    hint,
    dialogError,
    promptHost,
    closeButton,
  );
  slot.append(dialog);
  renderZoom();
  renderAppearance();
  renderShell();

  let savedEnabled = false;
  let hasSecret = false;
  let readOnly = false;
  let busy = false;
  let closePrompt: (() => void) | null = null;

  button.addEventListener("click", () => {
    if (dialog.hidden) {
      dialog.hidden = false;
      button.setAttribute("aria-expanded", "true");
      renderShell();
      void refresh();
    } else {
      hide();
    }
  });
  closeButton.addEventListener("click", () => {
    hide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) {
      hide();
    }
  });
  checkbox.addEventListener("change", () => {
    const next = checkbox.checked;
    checkbox.checked = savedEnabled;
    if (readOnly || busy) {
      return;
    }
    void request(next);
  });

  function hide(): void {
    dialog.hidden = true;
    button.setAttribute("aria-expanded", "false");
    dismissPrompt();
    dialogError.textContent = "";
  }

  function dismissPrompt(): void {
    closePrompt?.();
    closePrompt = null;
  }

  async function refresh(): Promise<void> {
    dialogError.textContent = "";
    try {
      apply(await authSettings());
      hint.textContent = "";
    } catch (err) {
      dialogError.textContent = errorText(err);
    }
  }

  function apply(result: LockSettings): void {
    savedEnabled = result.loginLockEnabled;
    hasSecret = result.hasSecret;
    readOnly = result.readOnly;
    checkbox.checked = savedEnabled;
    checkbox.disabled = readOnly || busy;
    notice.textContent = result.message ?? "";
  }

  async function request(next: boolean): Promise<void> {
    dismissPrompt();
    dialogError.textContent = "";
    hint.textContent = "";
    const plan = planLockChange(savedEnabled, next, hasSecret);
    if (plan.step === "save") {
      try {
        await persist(next);
      } catch (err) {
        dialogError.textContent = errorText(err);
      }
      return;
    }
    const mode = plan.step === "setup" ? "setup" : "verify";
    busy = true;
    checkbox.disabled = true;
    const prompt = mountCredentialPrompt(
      promptHost,
      mode,
      async (username, secret, confirm) => {
        if (mode === "setup") {
          const snapshot = await authSetup(username, secret, confirm);
          if (snapshot.state !== "unlocked") {
            throw new Error(snapshot.message || t("lockSetupIncomplete"));
          }
        }
        await persist(next, username, secret);
        dismissPrompt();
      },
      () => {
        busy = false;
        checkbox.disabled = readOnly;
        closePrompt = null;
      },
    );
    closePrompt = () => {
      busy = false;
      checkbox.disabled = readOnly;
      prompt.close();
    };
  }

  async function persist(enabled: boolean, username?: string, secret?: string): Promise<void> {
    busy = true;
    checkbox.disabled = true;
    try {
      const result = await authSetLock(enabled, username, secret);
      apply(result);
      hint.textContent = enabled ? t("lockOnNextStart") : t("lockOff");
    } catch (err) {
      checkbox.checked = savedEnabled;
      try {
        apply(await authSettings());
      } catch {
        checkbox.disabled = readOnly;
      }
      throw err;
    } finally {
      busy = false;
      checkbox.disabled = readOnly || busy;
    }
  }

  function renderZoom(): void {
    zoomValue.textContent = zoomLabel(zoom.percent);
    zoomOut.disabled = !zoom.canStep("out");
    zoomIn.disabled = !zoom.canStep("in");
    zoomReset.disabled = !zoom.canStep("reset");
    zoomNotice.textContent = zoom.message;
  }

  function renderAppearance(): void {
    themeField.select.value = appearance.theme;
    fontField.select.value = appearance.font;
    for (const option of fontOptions) {
      // A missing font stays selectable while it is the saved choice.
      option.disabled = option.dataset.installed !== "true" && option.value !== appearance.font;
    }
    const palette = themeOf(appearance.theme).palette;
    swatches.style.background = palette.background;
    swatches.replaceChildren(
      ...ANSI_KEYS.map((key) => {
        const chip = document.createElement("span");
        chip.style.background = palette[key];
        return chip;
      }),
    );
    appearanceNotice.textContent = appearance.message;
    autoBox.checked = appearance.autoBeautify;
    autoBox.disabled = appearance.readOnly;
  }

  function renderShell(status?: string): void {
    const label = shell.active();
    shellTarget.textContent = label === null ? t("shellNoTab") : t("shellTab", { label });
    applyButton.disabled = label === null || shellBusy;
    restoreButton.disabled = label === null || shellBusy;
    if (status !== undefined) {
      shellStatus.textContent = status;
    }
  }

  return { renderZoom, renderAppearance, renderShell };
}

function selectField(caption: string, id: string): { row: HTMLLabelElement; select: HTMLSelectElement } {
  const row = document.createElement("label");
  row.className = "settings-field";
  row.htmlFor = id;
  const text = document.createElement("span");
  text.textContent = caption;
  const select = document.createElement("select");
  select.id = id;
  select.className = "settings-select";
  row.append(text, select);
  return { row, select };
}

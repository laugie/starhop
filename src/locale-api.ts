import { invoke } from "@tauri-apps/api/core";
import type { Locale, LocaleSetting } from "./i18n.ts";

export interface LocaleView {
  setting: LocaleSetting;
  effective: Locale;
  readOnly: boolean;
  message?: string | null;
}

/** First call at start: the saved setting and the language to use. */
export function syncLocale(system: string): Promise<LocaleView> {
  return invoke<LocaleView>("locale_sync", { system });
}

/** Save the setting. The page uses it from the next start. */
export function saveLocale(setting: LocaleSetting, system: string): Promise<LocaleView> {
  return invoke<LocaleView>("locale_set", { setting, system });
}

let atStart: LocaleView | null = null;

/** The view read at start (src/boot.ts), for the settings dialog. */
export function startLocale(): LocaleView | null {
  return atStart;
}

export function rememberStartLocale(view: LocaleView): void {
  atStart = view;
}

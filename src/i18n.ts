// UI language. Each area of the UI keeps its own messages in
// `src/locales/<area>.ts`, written once in English and once in Chinese:
//
//   export const t = defineMessages(
//     { greeting: "Hello, {name}", tabs: (p: { n: number }) => (p.n === 1 ? "1 tab" : `${p.n} tabs`) },
//     { greeting: "你好，{name}", tabs: (p: { n: number }) => `${p.n} 个标签` },
//   );
//   t("greeting", { name: "Ada" });
//
// The Chinese table must have exactly the English keys (TypeScript checks it).
// The language is chosen once at start (src/boot.ts) before any UI module
// loads, so module-level constants are already in the right language.
// Pure: no DOM and no Tauri calls.

export type Locale = "en" | "zh-CN";
export type LocaleSetting = "auto" | Locale;
export const LOCALES: readonly Locale[] = ["en", "zh-CN"];

let current: Locale = "en";

export function locale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  current = next;
}

/** The saved setting, or the system language for "auto". Any `zh*` is Chinese. */
export function resolveLocale(setting: string | null | undefined, system: string | null | undefined): Locale {
  const tag = setting === "en" || setting === "zh-CN" ? setting : (system ?? "");
  return tag.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

type Params = Record<string, string | number>;
// Message functions take their own parameter object type.
type Message = string | ((params: any) => string);

type ParamsOf<M> = M extends (params: infer P) => string ? P : Params;

/** Replace `{name}` with `params.name`. Unknown names are left as they are. */
export function fill(template: string, params?: Params): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export type Translate<E extends Record<string, Message>> = <K extends keyof E & string>(
  key: K,
  ...params: E[K] extends string ? [params?: Params] : [params: ParamsOf<E[K]>]
) => string;

/**
 * One area's messages. `zh` must have the same keys as `en`; a message is a
 * `{name}` template or a function of its parameters (for plurals).
 */
export function defineMessages<E extends Record<string, Message>>(
  en: E,
  zh: { [K in keyof E]: E[K] extends string ? string : E[K] },
): Translate<E> {
  const tables: Record<Locale, Record<string, Message>> = { en, "zh-CN": zh };
  return ((key: string, params?: Params) => {
    const message = tables[current][key] ?? en[key];
    if (typeof message === "function") {
      return message(params ?? {});
    }
    return fill(message ?? key, params);
  }) as Translate<E>;
}

// Entry point. Pick the UI language first, then load the app, so every
// module (including module-level constants) is built in that language.
import { locale, resolveLocale, setLocale } from "./i18n.ts";
import { rememberStartLocale, syncLocale } from "./locale-api.ts";

async function boot(): Promise<void> {
  const system = navigator.language || "";
  try {
    const view = await syncLocale(system);
    rememberStartLocale(view);
    setLocale(view.effective);
  } catch {
    setLocale(resolveLocale("auto", system));
  }
  document.documentElement.lang = locale();
  await import("./main.ts");
}

void boot();

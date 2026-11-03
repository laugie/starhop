// First-run welcome card on an empty home screen: the Tailscale line.
// Messages live in src/locales/welcome.ts.

import type { ListStatus } from "./hosts.js";
import { t } from "./locales/welcome.js";

/** One line about Tailscale for the welcome card. Null when nothing is known. */
export function tailscaleHint(status: ListStatus | null, message?: string): string | null {
  switch (status) {
    case "ok":
      return t("tailscaleOk");
    case "needs_login":
      return t("tailscaleNeedsLogin");
    case "not_running":
      return t("tailscaleNotRunning");
    case "not_installed":
      return t("tailscaleNotInstalled");
    case "error":
      return message ? t("tailscaleError", { message }) : t("tailscaleErrorPlain");
    default:
      return null;
  }
}

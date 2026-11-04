// Read the private key file picked in the "add server" form. The text goes to
// the back end, which checks it properly and keeps its own copy; the page never
// sends a path. This only stops an obviously wrong file before reading it all.

import { t } from "./locales/servers.js";

/** Same limit as `KEY_MAX_BYTES` in `src-tauri/src/hosts/key.rs`. */
export const KEY_MAX_BYTES = 64 * 1024;

export async function readKeyFile(file: Pick<File, "size" | "text">): Promise<string> {
  if (file.size > KEY_MAX_BYTES) {
    throw new Error(t("keyTooLarge"));
  }
  return file.text();
}

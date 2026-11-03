// Turn a pasted `ssh ...` command, `ssh://` URL or `user@host:port` into the
// fields of the "add server" form. Pure; the back end validates again.

import { t } from "./locales/paste.js";

export interface ParsedServer {
  name: string;
  host: string;
  user: string | null;
  port: number | null;
}

export type ParseResult = ParsedServer | { error: string };

/** Options that need ~/.ssh/config: the form has no field for them. */
const CONFIG_ONLY = new Set(["-i", "-J", "-o", "-F"]);
/** Flags without a value that do not change where ssh connects. */
const HARMLESS = new Set(["-t", "-T", "-A", "-a", "-C", "-q", "-v", "-vv", "-vvv", "-4", "-6", "-X", "-Y", "-x", "-K", "-k"]);
const UNSAFE = /[;|&$`<>()'"\\]/;

export function parseSshInput(text: string): ParseResult {
  let input = text.trim().replace(/^\$\s+/, "");
  if (input === "") {
    return { error: t("empty") };
  }
  if (UNSAFE.test(input) || /[\r\n]/.test(input)) {
    return { error: t("unsafe") };
  }
  if (/^ssh:\/\//i.test(input)) {
    return parseTarget(input.slice(6).replace(/\/$/, ""), null, null);
  }
  const words = input.split(/\s+/);
  if (words[0] !== "ssh") {
    if (words.length > 1) {
      return { error: t("oneOnly") };
    }
    return parseTarget(words[0]!, null, null);
  }

  let user: string | null = null;
  let port: number | null = null;
  let target: string | null = null;
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i]!;
    if (target === null || word.startsWith("-")) {
      if (word === "-p" || word === "-l") {
        const value = words[i + 1];
        i += 1;
        if (value === undefined) {
          return { error: word === "-p" ? t("missingPort") : t("missingUser") };
        }
        if (word === "-p") {
          port = portOf(value);
          if (port === null) {
            return { error: t("badPort") };
          }
        } else {
          user = value;
        }
        continue;
      }
      if (/^-p\d+$/.test(word)) {
        port = portOf(word.slice(2));
        if (port === null) {
          return { error: t("badPort") };
        }
        continue;
      }
      if (/^-l.+/.test(word)) {
        user = word.slice(2);
        continue;
      }
      if (HARMLESS.has(word)) {
        continue;
      }
      const flag = word.slice(0, 2);
      if (word.startsWith("-") && CONFIG_ONLY.has(flag)) {
        return { error: t("configOnly", { flag }) };
      }
      if (word.startsWith("-")) {
        return { error: t("unsupported", { flag }) };
      }
      target = word;
      continue;
    }
    return { error: t("remoteCommand") };
  }
  if (target === null) {
    return { error: t("noHost") };
  }
  input = target;
  return parseTarget(input, user, port);
}

function parseTarget(text: string, user: string | null, port: number | null): ParseResult {
  let rest = text;
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    const named = rest.slice(0, at);
    if (named === "") {
      return { error: t("noUserBeforeAt") };
    }
    user = user ?? named;
    rest = rest.slice(at + 1);
  }
  let host = rest;
  const bracket = /^\[([^\]]+)\](?::(.*))?$/.exec(rest);
  if (bracket) {
    host = bracket[1]!;
    if (bracket[2] !== undefined) {
      port = portOf(bracket[2]);
      if (port === null) {
        return { error: t("badPort") };
      }
    }
  } else if ((rest.match(/:/g) ?? []).length === 1) {
    const [name, value] = rest.split(":") as [string, string];
    host = name;
    port = portOf(value);
    if (port === null) {
      return { error: t("badPort") };
    }
  }
  if (host === "" || host.startsWith("-") || /\s/.test(host)) {
    return { error: t("badHost") };
  }
  if (user !== null && (user === "" || user.startsWith("-"))) {
    return { error: t("badUser") };
  }
  return { name: host, host, user, port };
}

function portOf(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return value >= 1 && value <= 65535 ? value : null;
}

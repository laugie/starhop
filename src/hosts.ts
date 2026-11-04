import { invoke } from "@tauri-apps/api/core";
import { t } from "./locales/servers.js";

export type HostSource = "tailscale" | "manual" | "tailscale+manual";

export type ListStatus = "ok" | "not_installed" | "not_running" | "needs_login" | "error";

export interface HostEntry {
  id: string;
  name: string;
  host: string;
  ip: string | null;
  online: boolean | null;
  os: string | null;
  user: string | null;
  port: number | null;
  source: HostSource;
  connectTarget: string;
  /** A private key was imported for this manual server. */
  hasKey: boolean;
}

export interface ListHostsResponse {
  status: ListStatus;
  hosts: HostEntry[];
  message?: string;
  selfName?: string;
  configNotice?: string;
}

export interface NewManualHost {
  name: string;
  host: string;
  user: string | null;
  port: number | null;
  /** Text of a private key file, kept by the back end. Never a path. */
  identityKey?: string | null;
}

export function listHosts(): Promise<ListHostsResponse> {
  return invoke<ListHostsResponse>("list_hosts");
}

export function addManualHost(input: NewManualHost): Promise<void> {
  return invoke("add_manual_host", {
    name: input.name,
    host: input.host,
    user: input.user,
    port: input.port,
    identityKey: input.identityKey ?? null,
  });
}

export function removeManualHost(id: string): Promise<void> {
  return invoke("remove_manual_host", { id });
}

/** Host aliases in ~/.ssh/config and its includes. Read only. */
export function sshConfigHosts(): Promise<string[]> {
  return invoke<string[]>("ssh_config_hosts");
}

export function errorText(err: unknown): string {
  if (typeof err === "string" && err.trim() !== "") {
    return err;
  }
  if (err instanceof Error && err.message.trim() !== "") {
    return err.message;
  }
  return t("actionFailed");
}

import { Channel, invoke } from "@tauri-apps/api/core";
import type { HostEntry } from "./hosts.ts";
import { keyedServerId } from "./key-import.js";

export type SessionEvent =
  | { kind: "data"; bytes: number[] }
  | { kind: "exit"; code: number | null };

export interface SshInvokeTarget {
  host: string;
  user: string | null;
  port: number | null;
  /** Manual server whose imported key the back end should use. */
  manualId: string | null;
}

/**
 * Tailscale 行不传用户名。手动行和合并行仅在填写了用户名时传递。
 * 端口沿用列表里的值；没有端口时不传。
 * 导入过密钥的手动行传服务器 id，由后端查出密钥；页面不接触密钥路径。
 */
export function sshTargetOf(host: HostEntry): SshInvokeTarget {
  return {
    host: host.connectTarget,
    user: host.source === "tailscale" ? null : host.user,
    port: host.port,
    manualId: keyedServerId(host),
  };
}

export function openSession(
  target: SshInvokeTarget,
  onEvent: (event: SessionEvent) => void,
): Promise<{ id: string }> {
  const onEventChannel = new Channel<SessionEvent>();
  onEventChannel.onmessage = onEvent;
  return invoke<{ id: string }>("open_session", {
    host: target.host,
    user: target.user,
    port: target.port,
    manualId: target.manualId,
    onEvent: onEventChannel,
  });
}

export function writeSession(id: string, data: string): Promise<void> {
  return invoke("write_session", { id, data });
}

export function resizeSession(id: string, cols: number, rows: number): Promise<void> {
  return invoke("resize_session", { id, cols, rows });
}

export function closeSession(id: string): Promise<void> {
  return invoke("close_session", { id });
}

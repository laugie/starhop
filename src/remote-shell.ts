// 远端 Shell 美化：连接成功后自动执行一次，设置里可手动美化或恢复备份。
// 真正的改动由后端经 ssh 执行固定脚本，这里只决定何时执行以及怎么提示。

import { t } from "./locales/shell.js";

export type ShellMode = "auto" | "apply" | "restore";

export type ShellTarget =
  | { kind: "device"; deviceName: string; connectionName?: string }
  | { kind: "host"; host: string; user: string | null; port: number | null; manualId?: string | null };

export interface ShellReport {
  outcome: "applied" | "unchanged" | "skipped" | "unsupported" | "restored" | "nothing" | "failed";
  files: string[];
  backups: string[];
  notes: string[];
}

export function targetKey(target: ShellTarget): string {
  if (target.kind === "device") {
    return JSON.stringify(["device", target.deviceName, target.connectionName ?? ""]);
  }
  return JSON.stringify(["host", target.host, target.user ?? "", target.port ?? ""]);
}

export function reportMessage(report: ShellReport, label: string): string {
  const files = report.files.join(t("listSep"));
  const joinedNotes = report.notes.join(t("noteSep"));
  const notes = report.notes.length > 0 ? ` ${joinedNotes}` : "";
  switch (report.outcome) {
    case "applied": {
      const backups =
        report.backups.length > 0 ? t("backups", { list: report.backups.join(t("listSep")) }) : "";
      return t("applied", { label, files, backups, notes }).trim();
    }
    case "unchanged":
      return t("unchanged", { label, notes }).trim();
    case "skipped":
      return t("skipped", { label });
    case "unsupported":
      return t("unsupported", { label, reason: joinedNotes || t("onlyBashZsh") });
    case "restored":
      return t("restored", { label, files, notes }).trim();
    case "nothing":
      return t("nothing", { label });
    case "failed":
      return t("failed", { label, reason: joinedNotes || t("unknownReason") });
  }
}

/**
 * Runs the auto mode once per target per app run. A failure is reported and
 * not retried until the next launch; the settings buttons always run.
 */
export class AutoBeautify {
  private readonly started = new Map<string, Promise<void>>();

  constructor(
    private readonly deps: {
      run(target: ShellTarget, mode: ShellMode): Promise<ShellReport>;
      enabled(): boolean;
      onReport(label: string, result: ShellReport | Error, mode: ShellMode): void;
    },
  ) {}

  connected(target: ShellTarget, label: string): Promise<void> {
    if (!this.deps.enabled()) {
      return Promise.resolve();
    }
    const key = targetKey(target);
    const existing = this.started.get(key);
    if (existing) {
      return existing;
    }
    const pending = this.run(target, label, "auto");
    this.started.set(key, pending);
    return pending;
  }

  async run(target: ShellTarget, label: string, mode: ShellMode): Promise<void> {
    if (mode !== "auto") {
      const key = targetKey(target);
      // Two runs at once could both append a block; let a running one finish.
      const running = this.started.get(key);
      // After a manual run this launch has nothing left for auto to do.
      this.started.set(key, Promise.resolve());
      if (running) {
        await running;
      }
    }
    let result: ShellReport | Error;
    try {
      result = await this.deps.run(target, mode);
    } catch (err) {
      result = err instanceof Error ? err : new Error(String(err));
    }
    this.deps.onReport(label, result, mode);
  }

  /** Auto runs only speak up when they changed a file. */
  static notable(result: ShellReport | Error, mode: ShellMode): boolean {
    if (mode !== "auto") {
      return true;
    }
    return !(result instanceof Error) && result.outcome === "applied";
  }
}

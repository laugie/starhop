import { defineMessages } from "../i18n.js";

export const t = defineMessages(
  {
    listSep: ", ",
    noteSep: "; ",
    backups: ", original files backed up to {list}",
    applied:
      "Turned on remote shell colours for {label}: changed {files}{backups}. Reconnect to see them.{notes}",
    unchanged: "The remote shell on {label} was already beautified; its colour settings are updated.{notes}",
    skipped:
      "A backup was restored on {label}, so it is no longer beautified automatically. Click “Beautify now” when you want it.",
    unsupported: "{label} was not beautified: {reason}",
    onlyBashZsh: "only bash and zsh are supported",
    restored: "Restored {files} on {label}; it will no longer be beautified automatically.{notes}",
    nothing: "{label} has no changes to restore.",
    failed: "Beautifying the remote shell on {label} failed: {reason}",
    unknownReason: "unknown reason",
  },
  {
    listSep: "、",
    noteSep: "；",
    backups: "，原文件已备份到 {list}",
    applied: "已为 {label} 开启远端 Shell 颜色：改了 {files}{backups}。重新连接后生效。{notes}",
    unchanged: "{label} 的远端 Shell 已经美化过，颜色设置已更新。{notes}",
    skipped: "{label} 恢复过备份，不再自动美化。需要时点「立即美化」。",
    unsupported: "{label} 没有美化：{reason}",
    onlyBashZsh: "只支持 bash 和 zsh",
    restored: "已恢复 {label} 的 {files}，之后不再自动美化。{notes}",
    nothing: "{label} 没有需要恢复的改动。",
    failed: "{label} 的远端 Shell 美化失败：{reason}",
    unknownReason: "未知原因",
  },
);

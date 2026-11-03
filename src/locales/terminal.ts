import { defineMessages } from "../i18n.js";

export const t = defineMessages(
  {
    sessionCancelled: "Session cancelled",
    sessionEnded: "[Session ended, exit code {code}]",
    exitUnknown: "unknown",
    pasteMessage: (p: { n: number }) => `Paste ${p.n} lines? Each line break runs a command right away.`,
    pasteMore: (p: { n: number }) => (p.n === 1 ? "…1 more line" : `…${p.n} more lines`),
    paste: "Paste",
  },
  {
    sessionCancelled: "会话已取消",
    sessionEnded: "[会话已结束，退出码 {code}]",
    exitUnknown: "未知",
    pasteMessage: (p: { n: number }) => `要粘贴 ${p.n} 行内容吗？换行会让命令立即执行。`,
    pasteMore: (p: { n: number }) => `…另有 ${p.n} 行`,
    paste: "粘贴",
  },
);

import { defineMessages } from "../i18n.js";

export const t = defineMessages(
  {
    endSessionQuestion: "End this session?",
    endSession: "End session",
    cancel: "Cancel",
    quitMessage: (p: { n: number }) =>
      p.n === 1
        ? "Quit Starhop? 1 session will be disconnected."
        : `Quit Starhop? ${p.n} sessions will be disconnected.`,
  },
  {
    endSessionQuestion: "结束该会话？",
    endSession: "结束会话",
    cancel: "取消",
    quitMessage: (p: { n: number }) => `退出 Starhop？${p.n} 个会话会断开。`,
  },
);

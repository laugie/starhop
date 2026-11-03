import { defineMessages } from "../i18n.js";

export const t = defineMessages(
  {
    empty: "Paste an ssh command, or write user@host:port",
    unsafe: "Contains characters that are not supported (such as ; | & $ or quotes)",
    oneOnly: "Add one server at a time",
    missingPort: "-p needs a port after it",
    missingUser: "-l needs a user name after it",
    badPort: "The port must be a number from 1 to 65535",
    configOnly: '{flag} has to go in ~/.ssh/config; then add the host with "Import from ~/.ssh/config"',
    unsupported: "Option {flag} is not supported",
    remoteCommand: "Remote commands are not allowed; stop at the host",
    noHost: "Host is missing",
    noUserBeforeAt: "User name is missing before @",
    badHost: "Host is missing or not valid",
    badUser: "User name is not valid",
  },
  {
    empty: "粘贴一条 ssh 命令，或写成 用户@主机:端口",
    unsafe: "包含不支持的字符（例如 ; | & $ 引号）",
    oneOnly: "一次只能添加一台服务器",
    missingPort: "-p 后面缺少端口",
    missingUser: "-l 后面缺少用户名",
    badPort: "端口必须是 1 到 65535 的数字",
    configOnly: "{flag} 需要写进 ~/.ssh/config，再用「从 ~/.ssh/config 导入」添加",
    unsupported: "不支持选项 {flag}",
    remoteCommand: "不能带远端命令，只写到主机为止",
    noHost: "缺少主机",
    noUserBeforeAt: "@ 前面缺少用户名",
    badHost: "缺少主机，或主机格式不对",
    badUser: "用户名格式不对",
  },
);

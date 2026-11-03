import { defineMessages } from "../i18n.js";

export const t = defineMessages(
  {
    title: "Welcome to Starhop",
    intro: "Your devices appear on the home screen; click one to connect. Start in any of these ways:",
    addServer: "Add a server",
    addServerHint: "You can paste an ssh command, for example ssh -p 2222 me@192.0.2.10",
    importConfig: "Import from ~/.ssh/config",
    importConfigHint: "Lists the hosts in your ssh config; the ones you tick are added. Connections still use your ssh config.",
    topologyHint:
      "To draw your own network (regions, jump hosts, relays): copy topology.example.json from the repository to {path}, edit it, then click Reload.",
    tailscaleOk:
      "Tailscale is connected, but there are no other devices in your tailnet yet. Devices that log in to the same Tailscale account appear here.",
    tailscaleNeedsLogin:
      "Tailscale is not logged in. Log in with the Tailscale app, then click Reload; your tailnet devices will appear.",
    tailscaleNotRunning: "Tailscale is not running. Start Tailscale, then click Reload.",
    tailscaleNotInstalled:
      "Tailscale was not found. If you use Tailscale, install it and log in; your tailnet devices will appear here.",
    tailscaleError: "Could not read Tailscale: {message}",
    tailscaleErrorPlain: "Could not read Tailscale.",
  },
  {
    title: "欢迎使用 Starhop",
    intro: "首页会显示你的设备，点一下就能连接。用下面任一种方式开始：",
    addServer: "添加服务器",
    addServerHint: "可以直接粘贴一条 ssh 命令，例如 ssh -p 2222 me@192.0.2.10",
    importConfig: "从 ~/.ssh/config 导入",
    importConfigHint: "列出 ssh 配置里的主机，勾选后加入首页；连接时仍按 ssh 配置走",
    topologyHint:
      "想画自己的网络拓扑（区域、跳板、中转）：把仓库里的 topology.example.json 复制为 {path}，改好后点「重新加载」。",
    tailscaleOk:
      "Tailscale 已连接，但 tailnet 里还没有其他设备。其他设备登录同一个 Tailscale 账号后会自动出现在这里。",
    tailscaleNeedsLogin: "Tailscale 还没有登录。先在 Tailscale 客户端里登录，再点「重新加载」，tailnet 里的设备会自动出现。",
    tailscaleNotRunning: "Tailscale 没有运行。打开 Tailscale 后点「重新加载」。",
    tailscaleNotInstalled: "没有找到 Tailscale。如果你用 Tailscale，装好并登录后，tailnet 里的设备会自动出现在这里。",
    tailscaleError: "读取 Tailscale 失败：{message}",
    tailscaleErrorPlain: "读取 Tailscale 失败。",
  },
);

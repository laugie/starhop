# AGENTS.md

Guide for coding agents and contributors working on Starhop (formerly my-terminal), and for agents helping a user set the app up.

## What the app is

A lightweight SSH client for macOS and Windows built with Tauri 2 (Rust back end) and xterm.js (TypeScript front end). It runs the system `ssh` in a PTY, so `~/.ssh/config`, keys, ssh-agent and Tailscale SSH all work as they do in a normal terminal. The app stores no SSH passwords.

Main features: a topology home screen (3D planets or a 2D diagram) built from the user's `topology.json`, multiple session tabs, ProxyJump and relay-command connections, Tailscale device discovery and online status, SFTP file transfer, colour themes and fonts, UI zoom, and an optional login lock.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | Front end (TypeScript, no framework). Tests are `*.test.ts` next to the code |
| `src-tauri/src/` | Rust back end: `session` (PTY + ssh), `topology` (parse, validate, ssh args, relays), `hosts` (Tailscale CLI, manual hosts), `sftp`, `config`, `auth` (login lock), `presence`, `remote_shell` (beautify add-on) |
| `src-tauri/tests/` | Rust integration and contract tests |
| `src-tauri/fixtures/` | Synthetic Tailscale status JSON |
| `topology.example.json` | Example topology with placeholder addresses only |
| `scripts/repo_checks.sh` | Repository hygiene checks run in CI |

## Build and test

```sh
npm ci
npm run tauri dev                                   # run the app
npm run test:frontend                               # front-end tests
cargo test --manifest-path src-tauri/Cargo.toml     # Rust tests
bash scripts/repo_checks.sh                         # hygiene checks
```

CI (`.github/workflows/build.yml`) runs all of these on macOS and Windows and builds the installers.

## Rules for changes

- Never commit real hostnames, IP addresses, usernames, keys or a `topology.json`. Use `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `example.com` and `example.ts.net` in examples, tests and screenshots.
- Topology devices are opened by name: the front end sends only a device name (and a connection name), and the back end builds every ssh argument from `topology.json`. Tailscale peers and manual servers are opened by host, user and port, which the back end validates before building the ssh arguments. Never pass commands, jump hosts or key paths from the UI.
- The app never writes `topology.json`. The home screen adds Tailscale peers and manual servers as extra regions (`src/home-devices.ts`).
- `scripts/repo_checks.sh` checks that `topology.json` is not committed, that `topology.example.json` uses placeholder addresses only, and that `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock` carry the same `MAJOR.MINOR.PATCH` version. CI also runs gitleaks (`.github/workflows/secret-scan.yml`).
- Add a test with each behaviour change. Config changes must keep older config files loading.

## UI text and languages

The UI is in English and Simplified Chinese. The language follows the system (any `zh*` locale is Chinese, anything else English) unless `settings.language` in `config.json` is `en` or `zh-CN`. It is chosen once at start in `src/boot.ts`, before any UI module loads.

- **Front end:** each UI area has `src/locales/<area>.ts`:

  ```ts
  import { defineMessages } from "../i18n.js";
  export const t = defineMessages(
    { saved: "Saved {name}", tabs: (p: { n: number }) => (p.n === 1 ? "1 tab" : `${p.n} tabs`) },
    { saved: "已保存 {name}", tabs: (p: { n: number }) => `${p.n} 个标签` },
  );
  ```

  Use `t("saved", { name })` instead of a string literal. The Chinese table must have exactly the English keys (TypeScript checks this). Front-end tests run in English (the default locale); call `setLocale("zh-CN")` inside a test to check Chinese, and set it back.
- **Back end:** every message returned to the page is written in both languages where it is produced: `tr!("名称不能为空", "Name is required")`, `tr!("端口 {port} 无效", "Port {port} is invalid")`, `tr!("缺少 {}", "Missing {}", field)`. It returns a `String` and takes `format!` arguments; both versions must use every argument. Build messages when they are returned, not once at startup. The process language starts as Chinese, so Rust tests that compare Chinese text keep passing; use `i18n::with_lang(Lang::En, || ...)` to check English in a test.
- Device-type guessing (`src/diagram.ts`) matches both English and Chinese words on purpose; it is not UI text.

## Helping a user configure the app

Config files live in one directory:

- macOS: `~/Library/Application Support/starhop/`
- Windows: `%APPDATA%\starhop\`

Builds up to 1.0.8 used a `my-terminal` folder; the app copies it to `starhop` on first start if `starhop` does not exist.

### `topology.json` (the home screen)

Copy `topology.example.json` there and edit it, then click "重新加载" (Reload). Shape:

```json
{"regions": [{"name": "Office", "devices": [
  {"name": "nas", "host": "192.0.2.5", "user": "admin", "type": "nas"},
  {"name": "app", "host": "app.example.com", "user": "me", "jump": "nas",
   "connections": [{"name": "via nas", "via": "nas", "command": "nc %h %p"}]}
]}]}
```

Device fields: `name`, `host`, `user` (required); `port` (default 22), `identityFile`, `jump` (another device's name, used as ProxyJump), `type` (`server`, `mac`, `windows`, `router`, `nas`, `cloud`), `mobile`, `tailscaleAddress` (for online status), `connections` (relay commands run on another device; templates must contain `%h` and `%p`, and may set their own `host` and `port`). The README section "拓扑首页" has the full rules.

### Devices without a config file

The home screen also shows, as extra regions: Tailscale peers (when the Tailscale CLI is installed and logged in) and manual servers (added on the "手动服务器" page, saved in `config.json` under `manualHosts` with `name`, `host`, optional `user`, `port`, `identityFile`). A new user can connect without writing `topology.json`. A manual server without `port` lets ssh choose it (22, or `Port` from `~/.ssh/config`).

The add form can import a private key file (for example a cloud provider's `.pem`). The page sends the file's text, never a path. The back end checks it (`src-tauri/src/hosts/key.rs`) and writes a copy to `keys/<server id>.pem` in the config directory, readable only by the user. `identityFile` holds only that file name. Connections look the key up by server id and pass `-i <path> -o IdentitiesOnly=yes`. Removing the server deletes the copy. Passphrase-protected keys prompt in the terminal; SFTP and remote shell beautify use `BatchMode=yes`, so they need an unencrypted key or ssh-agent.

On an empty home screen a welcome card offers "添加服务器" (the add form also accepts a pasted `ssh` command, parsed by `src/ssh-paste.ts`) and "从 ~/.ssh/config 导入" (the back end lists `Host` aliases from `~/.ssh/config` and its `Include`s, see `src-tauri/src/hosts/ssh_config.rs`; each chosen alias is added as a manual server with only `name` and `host`, so ssh applies the rest of the config).

### `config.json` (app settings)

Written by the app. Keys under `settings`, all optional:

| Key | Values | Default |
| --- | --- | --- |
| `loginLockEnabled` | `true` / `false` | `false` |
| `uiZoom` | 50 to 200 (browser zoom steps) | 100 |
| `terminalTheme` | `midnight`, `deep-sea`, `one-dark`, `dracula`, `tokyo-night`, `nord`, `solarized-dark`, `paper` | `midnight` |
| `terminalFont` | `jetbrains-mono`, `system`, `sf-mono`, `menlo`, `cascadia-mono`, `consolas`, `fira-code`, `meslo-nerd` | `jetbrains-mono` |
| `topologyMode` | `3d` / `2d` | `3d` |
| `autoBeautify` | `true` / `false` | `false` (see add-ons) |

Prefer the Settings dialog (gear icon). If you edit the file, do it while the app is closed.

## Optional add-ons (off by default)

### Login lock

Asks for a username and password each time the app starts. Off by default: the app opens straight to the home screen and nobody has to log in.

- Turn on: Settings → "启动时需要登录（可选，默认关闭）". The first time, it asks to set a username and a password (at least 8 characters). It takes effect from the next start.
- Storage: only an argon2id hash, in the system keychain (macOS Keychain, Windows Credential Manager) under service `starhop`. Never in config files.
- Forgotten password: delete the `starhop` entry (and any old `my-terminal` entry) from the keychain; the app then asks to set a new one.
- It keeps casual users out of the app. It is not encryption and does not protect against someone with access to the user account.

### Remote shell beautify

Adds colours to a remote server's shell: `ls` colours, a coloured prompt, and zsh syntax highlighting. It is off by default because it changes files on the server.

- Turn on: Settings → "连接后自动美化远端 Shell（附加功能，默认关闭）", or `"autoBeautify": true` in `config.json`. When on, it runs once per host per app launch, about 4 seconds after a tab connects. "立即美化" (Apply now) runs it once for the current tab's host even when the switch is off.
- What it changes on the server: backs up `~/.bashrc` / `~/.zshrc` to `~/.my-terminal/backups/`, appends a marked block (`# >>> my-terminal shell colors >>>`; the remote names keep the old app name for now) that loads `~/.my-terminal/colors.bash` or `colors.zsh`, and, if zsh-syntax-highlighting is not installed, clones version 0.8.0 from GitHub into `~/.my-terminal/` using the server's `git`. An existing coloured prompt or a prompt framework (oh-my-zsh, starship, and others) is left alone.
- Undo: Settings → "恢复备份" (Restore backup) for the current tab's host. It also writes `~/.my-terminal/opt-out`, so automatic runs skip that host.
- Requirements: bash or zsh on the server, and non-interactive login (key, ssh-agent or Tailscale SSH), because it uses `BatchMode=yes`.
- Source: `src-tauri/src/remote_shell/beautify.sh` (fixed script, nothing from config or UI is inserted).

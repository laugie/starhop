# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting: the repository's **Security** tab > **Report a vulnerability**. Include what you found, how to reproduce it, and the version or commit.

You should get a reply within a week. Fixes go into `main`; there are no maintained release branches.

## Scope

Starhop runs the system `ssh` and `sftp` and keeps its settings in local files. The interesting parts are:

- how ssh arguments, jump hosts and relay commands are built from `topology.json`, manual servers and `~/.ssh/config` aliases (`src-tauri/src/topology/`, `src-tauri/src/session/`, `src-tauri/src/hosts/`),
- the IPC commands and their permissions (`src-tauri/capabilities/`, `src-tauri/permissions/`),
- SFTP path handling (`src-tauri/src/sftp/`),
- the optional remote shell beautify script (`src-tauri/src/remote_shell/beautify.sh`),
- the optional login lock (`src-tauri/src/auth/`).

Out of scope: problems in OpenSSH, Tailscale or the operating system itself, and anything that needs someone who already controls your user account. The login lock only keeps casual users out of the app; it is not encryption.

## What the app does on the network

- SSH and SFTP connections you start, through the system `ssh`.
- Online status: for `topology.json` hosts that Tailscale does not already report on, a TCP connection to the SSH port (it reads the version line and closes, no login), every 150 seconds while the home screen is visible.
- `tailscale status --json` through the local Tailscale CLI, if installed.
- Only when the remote shell beautify add-on is on: the remote server may `git clone` zsh-syntax-highlighting from GitHub.

There is no telemetry, no account and no update check.

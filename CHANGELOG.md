# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

## [1.1.1] - 2026-11-04

### Added

- Import a private key file (for example a cloud provider's `.pem`) when adding a manual server. Terminal, file transfer and remote shell beautify all use it. Starhop keeps its own unencrypted copy in the `keys` folder of its config directory (on macOS, readable only by you) and removes it with the server. For that server, ssh offers only this key, not ssh-agent keys. Passphrase-protected keys work in the terminal; file transfer and remote shell beautify need a key without a passphrase or ssh-agent. PuTTY `.ppk` files need exporting to OpenSSH format first.

## [1.1.0] - 2026-11-02

First public release. Unsigned installers for Apple Silicon Macs and 64-bit Windows are on the Releases page; see the README to install or build it.

### Added

- Home screen that shows your devices as planets on orbits (3D) or as a diagram (2D): devices from `topology.json`, Tailscale peers found through the local Tailscale CLI, and manual servers.
- First-run welcome screen: Tailscale status, add a server, import from `~/.ssh/config`.
- Add a server by pasting an `ssh` command, an `ssh://` URL or `user@host:port`.
- Import host aliases from `~/.ssh/config` and its `Include` files; ssh still applies the rest of the config.
- `topology.json`: regions, device types, jump hosts (ProxyJump) and relay commands (`connections`, ProxyCommand-style) with per-route target host and port.
- Online status worked out locally: open sessions, Tailscale state, or a TCP check of the SSH port.
- Up to 8 session tabs with keyboard shortcuts, close and quit confirmation.
- SFTP file transfer inside a session tab: two panes, drag and drop, progress, retry and cancel, overwrite confirmation.
- Copy and paste: whole-selection copy, confirmation for multi-line paste, bracketed paste, OSC 52 copies from tmux and vim.
- Eight colour themes, 256 colours and true colour, bundled JetBrains Mono, UI zoom.
- English and Simplified Chinese UI, following the system language or chosen in Settings.
- Optional add-ons, off by default: remote shell beautify (with backup and restore) and a login lock (argon2id hash in the system keychain).
- Upgrade path from the earlier private builds named my-terminal: the config folder and the login-lock keychain entry are copied to the new names on first start.

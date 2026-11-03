# Roadmap

Starhop is a small, source-only project: there are no official installers. Build it yourself ([README](README.md#build-from-source)). Community packages (a Homebrew tap, winget, Scoop) are welcome but not maintained here.

## Ideas, roughly in order

- **Linux support.** Tauri runs there; the PTY, keychain and clipboard parts need checking, plus CI.
- **Home screen options:** a switch to hide Tailscale devices, and grouping or search for long lists.
- **`topology.json` without `user` or `port`,** so hand-written devices can lean on `~/.ssh/config` like imported aliases do.
- **Port forwarding** (`-L`, `-R`, `-D`) per device.
- **Terminal:** local shell tabs, scrollback search, split panes, theme import.
- **More UI languages.** Add a table to each `src/locales/<area>.ts` and a branch in `tr!` (see [AGENTS.md](AGENTS.md#ui-text-and-languages)).
- **Remote shell beautify:** move its server-side names from `~/.my-terminal` to `~/.starhop`, with migration for servers that already have them.

## Not planned

- Storing SSH passwords, or an SSH implementation of our own. Starhop uses the system `ssh`, keys, ssh-agent and Tailscale SSH.
- Telemetry, accounts or cloud sync run by the project.

Open an issue or a discussion if you want to work on one of these.

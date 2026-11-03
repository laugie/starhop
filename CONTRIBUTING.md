# Contributing to Starhop

Thanks for helping. Bug reports, fixes, translations and documentation are all welcome.

## Before you start

- For a bug, open an issue with the bug report form. For a larger change or a new feature, open an issue first so we can agree on the approach.
- Never put real hostnames, IP addresses, usernames, keys or your own `topology.json` in issues, commits, tests or screenshots. Use `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `example.com` and `example.ts.net`.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Set up

| | macOS 11+ | Windows 10/11 |
| --- | --- | --- |
| Build tools | Xcode Command Line Tools (`xcode-select --install`) | Microsoft C++ Build Tools, workload "Desktop development with C++" |
| Web view | built in | WebView2 Runtime (built into Windows 11 and current Windows 10) |
| Node.js | 22 | 22 |
| Rust | stable, via [rustup](https://rustup.rs) | stable MSVC toolchain, via rustup |
| ssh | built in | OpenSSH Client (Settings > Optional features) |

Linux is not supported yet. Tauri runs on Linux, so a port is welcome; see [ROADMAP.md](ROADMAP.md).

```sh
npm ci
npm run tauri dev      # run the app with hot reload
```

## Tests and checks

Run these before you open a pull request. CI runs them on macOS and Windows.

```sh
npm run test:frontend                                   # front-end tests (node:test)
npx tsc --noEmit -p tsconfig.json                       # type check
cargo test --manifest-path src-tauri/Cargo.toml         # Rust tests
bash scripts/repo_checks.sh                             # placeholder data and version checks
```

`cargo test --manifest-path src-tauri/Cargo.toml --test relay_sshd -- --ignored` runs an integration test against a local `sshd` (CI runs it on macOS with `MT_SSHD_IT=1`).

## Making changes

- Keep each pull request to one topic, with a test for the behaviour it changes. Config changes must keep older config files loading.
- Rust: `cargo fmt`. TypeScript: the strict settings in `tsconfig.json`. No new dependencies without discussing them in the issue first.
- Every piece of UI text is bilingual. Front end: add the message to `src/locales/<area>.ts` in both the English and the Chinese table and use `t("key")`. Back end: `tr!("中文", "English")`. Details are in [AGENTS.md](AGENTS.md#ui-text-and-languages). If you do not write Chinese, put the English text in both tables and say so in the pull request; a maintainer will translate it.
- The front end never sends ssh commands, jump hosts or key paths to the back end. Topology devices are opened by name; the back end builds every ssh argument and validates it. Keep it that way.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org) in English, for example `fix: keep the local file when a download fails`.
- Add a line to `CHANGELOG.md` under `[Unreleased]` for user-visible changes.

## AI-assisted contributions

Using AI coding tools is fine. You are responsible for every line you submit: you have read it, you can explain it, and it passes the checks above. Say in the pull request that a tool helped. `AGENTS.md` describes the project for coding agents.

## Licence

Starhop is licensed under MIT OR Apache-2.0. Unless you say otherwise, any contribution you submit is licensed the same way, without extra terms (Apache-2.0, section 5).

//! Host aliases from the user's `~/.ssh/config`, for "import from ssh config".
//!
//! Only names are read. Connecting to an alias runs `ssh <alias>`, so ssh
//! itself still applies `HostName`, `User`, `Port`, keys and jump hosts from
//! the file. Nothing here is executed and nothing is written.
//!
//! Rules:
//! - `Host` lines give aliases. Patterns with `*`, `?` or a leading `!` are
//!   skipped, since they are not one machine.
//! - `Match` blocks are skipped.
//! - `Include` is followed (relative paths are under `~/.ssh`, `~` is the home
//!   folder, and `*` / `?` in the last path part match file names), at most
//!   [`MAX_DEPTH`] levels and [`MAX_FILES`] files.
//! - Std only, no Tauri, so it can be tested on its own.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_DEPTH: usize = 4;
pub const MAX_FILES: usize = 32;
/// Larger files are skipped.
pub const MAX_FILE_BYTES: u64 = 1024 * 1024;

/// Aliases from `<home>/.ssh/config` and its includes, in file order, each once.
pub fn aliases_in_home(home: &Path) -> Vec<String> {
    let ssh_dir = home.join(".ssh");
    let mut reader = Reader {
        home: home.to_path_buf(),
        ssh_dir: ssh_dir.clone(),
        seen_files: HashSet::new(),
        seen_aliases: HashSet::new(),
        aliases: Vec::new(),
    };
    reader.read_file(&ssh_dir.join("config"), 0);
    reader.aliases
}

/// Aliases in one config text, ignoring `Include`.
pub fn aliases_in_text(text: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for line in text.lines() {
        if let Some(Line::Host(patterns)) = parse_line(line) {
            push_aliases(&patterns, &mut seen, &mut out);
        }
    }
    out
}

struct Reader {
    home: PathBuf,
    ssh_dir: PathBuf,
    seen_files: HashSet<PathBuf>,
    seen_aliases: HashSet<String>,
    aliases: Vec<String>,
}

impl Reader {
    fn read_file(&mut self, path: &Path, depth: usize) {
        if depth > MAX_DEPTH || self.seen_files.len() >= MAX_FILES {
            return;
        }
        let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if !self.seen_files.insert(key) {
            return;
        }
        let Ok(meta) = fs::metadata(path) else {
            return;
        };
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            return;
        }
        let Ok(text) = fs::read_to_string(path) else {
            return;
        };
        for line in text.lines() {
            match parse_line(line) {
                Some(Line::Host(patterns)) => {
                    push_aliases(&patterns, &mut self.seen_aliases, &mut self.aliases);
                }
                Some(Line::Include(targets)) => {
                    for target in targets {
                        for file in self.expand(&target) {
                            self.read_file(&file, depth + 1);
                        }
                    }
                }
                None => {}
            }
        }
    }

    /// Files an `Include` argument names.
    fn expand(&self, target: &str) -> Vec<PathBuf> {
        let path = if let Some(rest) = target.strip_prefix("~/") {
            self.home.join(rest)
        } else if Path::new(target).is_absolute() {
            PathBuf::from(target)
        } else {
            self.ssh_dir.join(target)
        };
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            return Vec::new();
        };
        if !name.contains(['*', '?']) {
            return vec![path];
        }
        let Some(dir) = path.parent() else {
            return Vec::new();
        };
        let Ok(entries) = fs::read_dir(dir) else {
            return Vec::new();
        };
        let mut files: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .is_some_and(|candidate| wildcard_match(name, candidate))
            })
            .map(|entry| entry.path())
            .collect();
        files.sort();
        files
    }
}

enum Line {
    Host(Vec<String>),
    Include(Vec<String>),
}

fn parse_line(line: &str) -> Option<Line> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    // `Keyword value` or `Keyword=value`.
    let split = line.find(|ch: char| ch.is_whitespace() || ch == '=')?;
    let (keyword, rest) = line.split_at(split);
    let rest = rest.trim_start_matches(|ch: char| ch.is_whitespace() || ch == '=');
    let args = split_args(rest);
    if keyword.eq_ignore_ascii_case("host") {
        Some(Line::Host(args))
    } else if keyword.eq_ignore_ascii_case("include") {
        Some(Line::Include(args))
    } else {
        None
    }
}

/// Space-separated arguments. Double quotes group words; a `#` starts a comment.
fn split_args(text: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut has_arg = false;
    for ch in text.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                has_arg = true;
            }
            '#' if !quoted => break,
            ch if ch.is_whitespace() && !quoted => {
                if has_arg {
                    args.push(std::mem::take(&mut current));
                    has_arg = false;
                }
            }
            ch => {
                current.push(ch);
                has_arg = true;
            }
        }
    }
    if has_arg {
        args.push(current);
    }
    args
}

fn push_aliases(patterns: &[String], seen: &mut HashSet<String>, out: &mut Vec<String>) {
    for pattern in patterns {
        if !is_plain_alias(pattern) {
            continue;
        }
        if seen.insert(pattern.clone()) {
            out.push(pattern.clone());
        }
    }
}

/// One concrete name: no wildcard or negation, no spaces or control characters,
/// and not something ssh would read as an option.
fn is_plain_alias(pattern: &str) -> bool {
    !pattern.is_empty()
        && !pattern.starts_with('-')
        && !pattern.starts_with('!')
        && !pattern.chars().any(|ch| {
            ch == '*' || ch == '?' || ch == ',' || ch.is_whitespace() || ch.is_control()
        })
}

/// `*` and `?` only, matched against the whole name.
fn wildcard_match(pattern: &str, name: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let n: Vec<char> = name.chars().collect();
    let (mut pi, mut ni) = (0, 0);
    let (mut star, mut mark) = (None, 0);
    while ni < n.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == n[ni]) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ni;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ni = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct TempHome(PathBuf);

    impl TempHome {
        fn new(label: &str) -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let n = NEXT.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "starhop-sshcfg-{label}-{}-{n}",
                std::process::id()
            ));
            fs::create_dir_all(path.join(".ssh")).unwrap();
            Self(path)
        }

        fn write(&self, rel: &str, text: &str) {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn host_lines_give_plain_aliases_in_order() {
        let text = "\
# comment
Host work web-1  # trailing comment
  HostName 192.0.2.10
  User me
host=db
Host *.example.com !bad gw? \"quoted name\" -oops
Match host foo
  User other
Host work
";
        assert_eq!(aliases_in_text(text), vec!["work", "web-1", "db"]);
    }

    #[test]
    fn includes_are_followed_with_relative_home_and_glob_paths() {
        let home = TempHome::new("include");
        home.write(
            ".ssh/config",
            "Host main\nInclude conf.d/*.conf\nInclude ~/extra/ssh_config\nInclude missing\n",
        );
        home.write(".ssh/conf.d/b.conf", "Host bee\n");
        home.write(".ssh/conf.d/a.conf", "Host ay\nHost main\n");
        home.write(".ssh/conf.d/skip.txt", "Host nope\n");
        home.write("extra/ssh_config", "Host extra\n");
        assert_eq!(aliases_in_home(&home.0), vec!["main", "ay", "bee", "extra"]);
    }

    #[test]
    fn include_loops_and_depth_are_bounded() {
        let home = TempHome::new("loop");
        home.write(".ssh/config", "Host top\nInclude config\nInclude one\n");
        home.write(".ssh/one", "Host one\nInclude two\n");
        home.write(".ssh/two", "Host two\nInclude three\n");
        home.write(".ssh/three", "Host three\nInclude four\n");
        home.write(".ssh/four", "Host four\nInclude five\n");
        home.write(".ssh/five", "Host five\n");
        assert_eq!(aliases_in_home(&home.0), vec!["top", "one", "two", "three", "four"]);
    }

    #[test]
    fn no_config_file_means_no_aliases() {
        let home = TempHome::new("none");
        assert!(aliases_in_home(&home.0).is_empty());
    }

    #[test]
    fn wildcard_matching() {
        assert!(wildcard_match("*.conf", "a.conf"));
        assert!(wildcard_match("h?st", "host"));
        assert!(wildcard_match("*", "anything"));
        assert!(!wildcard_match("*.conf", "a.txt"));
        assert!(!wildcard_match("a*b", "a-c"));
    }
}

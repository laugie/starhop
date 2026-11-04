//! Private keys imported for manual servers.
//!
//! The page sends the text of the key file the user picked, never a path.
//! The text is checked here and written to `<config dir>/keys/<server id>.pem`
//! (mode 0600 on macOS), and `config.json` stores only that file name. When a
//! session starts, the file name is checked again and joined under `keys/`, so
//! an edited `config.json` cannot point `-i` anywhere else.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Folder under the config directory that holds imported keys.
pub const KEYS_DIR: &str = "keys";
/// Generous limit: an RSA 4096 key is about 3.3 KB.
pub const KEY_MAX_BYTES: usize = 64 * 1024;

/// Check the text of a picked key file and return it with LF line endings and
/// a final newline, which OpenSSH needs to read the newer key format.
pub fn validate_key_text(text: &str) -> Result<String, String> {
    if text.len() > KEY_MAX_BYTES {
        return Err(tr!(
            "密钥文件超过 64 KB，不像是私钥",
            "The key file is larger than 64 KB; it does not look like a private key"
        ));
    }
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return Err(tr!("密钥文件是空的", "The key file is empty"));
    }
    if trimmed.starts_with("PuTTY-User-Key-File") {
        return Err(tr!(
            "这是 PuTTY 格式（.ppk）的密钥，请先用 PuTTYgen 导出为 OpenSSH 格式",
            "This is a PuTTY (.ppk) key. Export it in OpenSSH format with PuTTYgen first"
        ));
    }
    let first = trimmed.lines().next().unwrap_or("").trim();
    if first.starts_with("ssh-")
        || first.starts_with("ecdsa-")
        || first.starts_with("sk-")
        || first.contains("PUBLIC KEY")
    {
        return Err(tr!(
            "这是公钥，请选择对应的私钥文件",
            "This is a public key. Choose the matching private key file"
        ));
    }
    let Some(kind) = first
        .strip_prefix("-----BEGIN ")
        .and_then(|rest| rest.strip_suffix("-----"))
        .filter(|kind| kind.ends_with("PRIVATE KEY"))
    else {
        return Err(tr!(
            "不是可识别的私钥文件（应以 -----BEGIN … PRIVATE KEY----- 开头）",
            "This is not a private key file (it should start with -----BEGIN … PRIVATE KEY-----)"
        ));
    };
    let end = format!("-----END {kind}-----");
    if trimmed.lines().last().map(str::trim) != Some(end.as_str()) {
        return Err(tr!(
            "私钥文件不完整（缺少结尾的 END 行）",
            "The private key file is incomplete (the END line is missing)"
        ));
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_control() && ch != '\n' && ch != '\t')
    {
        return Err(tr!(
            "私钥文件包含无效字符",
            "The private key file contains invalid characters"
        ));
    }
    Ok(format!("{trimmed}\n"))
}

/// File name used for the key of one manual server.
pub fn key_file_name(id: &str) -> String {
    format!("{id}.pem")
}

/// A stored key name must be a plain file name made by [`key_file_name`].
fn check_file_name(name: &str) -> Result<(), String> {
    let plain = !name.is_empty()
        && !name.starts_with('.')
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
        && !name.contains("..");
    if plain {
        Ok(())
    } else {
        Err(tr!(
            "配置里的密钥文件名无效",
            "The key file name in the config is not valid"
        ))
    }
}

/// Full path of a stored key, after checking the stored name again.
pub fn key_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    check_file_name(name)?;
    Ok(dir.join(KEYS_DIR).join(name))
}

/// Write the key so only the current user can read it. Replaces any old file
/// with the same name. The text should come from [`validate_key_text`].
pub fn write_key(dir: &Path, name: &str, text: &str) -> Result<(), String> {
    let path = key_path(dir, name)?;
    let failed = |_| tr!("无法保存密钥文件", "Could not save the key file");
    let keys = dir.join(KEYS_DIR);
    create_private_dir(&keys).map_err(failed)?;
    let temp = keys.join(format!(".{name}.tmp"));
    let _ = fs::remove_file(&temp);
    let written = (|| {
        let mut file = private_file(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, &path)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written.map_err(failed)
}

/// Delete a stored key. A missing file is not an error.
pub fn remove_key(dir: &Path, name: &str) {
    if let Ok(path) = key_path(dir, name) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(unix)]
fn create_private_dir(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(path)?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn create_private_dir(path: &Path) -> std::io::Result<()> {
    // %APPDATA% is readable by the user (and SYSTEM / Administrators) only,
    // which is what Windows OpenSSH accepts for a private key.
    fs::create_dir_all(path)
}

#[cfg(unix)]
fn private_file(path: &Path) -> std::io::Result<fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
}

#[cfg(not(unix))]
fn private_file(path: &Path) -> std::io::Result<fs::File> {
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Key-shaped text built at run time so no key block sits in the source.
    pub(crate) fn fake_key(kind: &str) -> String {
        let dashes = "-".repeat(5);
        format!(
            "{dashes}BEGIN {kind}PRIVATE KEY{dashes}\nAAAAexampleonlyAAAA\n{dashes}END {kind}PRIVATE KEY{dashes}\n"
        )
    }

    #[test]
    fn accepts_pem_and_openssh_keys_and_normalizes_line_endings() {
        for kind in ["", "RSA ", "EC ", "OPENSSH ", "ENCRYPTED "] {
            let key = fake_key(kind);
            assert_eq!(validate_key_text(&key).unwrap(), key, "kind {kind:?}");
        }
        let crlf = fake_key("RSA ").replace('\n', "\r\n");
        assert_eq!(validate_key_text(&crlf).unwrap(), fake_key("RSA "));
        let no_newline = fake_key("OPENSSH ").trim_end().to_string();
        assert_eq!(
            validate_key_text(&no_newline).unwrap(),
            fake_key("OPENSSH ")
        );
        let padded = format!("\u{feff}\n\n{}\n\n", fake_key(""));
        assert_eq!(validate_key_text(&padded).unwrap(), fake_key(""));
    }

    #[test]
    fn rejects_public_putty_truncated_empty_and_large_files() {
        assert_eq!(validate_key_text("  \n").unwrap_err(), "密钥文件是空的");
        assert_eq!(
            validate_key_text("ssh-ed25519 AAAAexample me@example.com").unwrap_err(),
            "这是公钥，请选择对应的私钥文件"
        );
        let dashes = "-".repeat(5);
        let public =
            format!("{dashes}BEGIN PUBLIC KEY{dashes}\nAAAA\n{dashes}END PUBLIC KEY{dashes}");
        assert_eq!(
            validate_key_text(&public).unwrap_err(),
            "这是公钥，请选择对应的私钥文件"
        );
        assert!(validate_key_text("PuTTY-User-Key-File-3: ssh-ed25519\n")
            .unwrap_err()
            .contains("PuTTYgen"));
        assert!(validate_key_text("hello world")
            .unwrap_err()
            .contains("不是可识别的私钥"));
        let cert =
            format!("{dashes}BEGIN CERTIFICATE{dashes}\nAAAA\n{dashes}END CERTIFICATE{dashes}");
        assert!(validate_key_text(&cert)
            .unwrap_err()
            .contains("不是可识别的私钥"));
        let cut = fake_key("RSA ")
            .lines()
            .take(2)
            .collect::<Vec<_>>()
            .join("\n");
        assert!(validate_key_text(&cut).unwrap_err().contains("不完整"));
        let mismatched = fake_key("RSA ").replace("END RSA", "END EC");
        assert!(validate_key_text(&mismatched)
            .unwrap_err()
            .contains("不完整"));
        let control = fake_key("").replace("example", "exa\u{7}mple");
        assert!(validate_key_text(&control)
            .unwrap_err()
            .contains("无效字符"));
        let large = format!("{}{}", fake_key(""), "A".repeat(KEY_MAX_BYTES));
        assert!(validate_key_text(&large).unwrap_err().contains("64 KB"));
    }

    #[test]
    fn messages_in_english() {
        crate::i18n::with_lang(crate::i18n::Lang::En, || {
            assert_eq!(validate_key_text("").unwrap_err(), "The key file is empty");
            assert_eq!(
                validate_key_text("ssh-rsa AAAA").unwrap_err(),
                "This is a public key. Choose the matching private key file"
            );
            assert_eq!(
                key_path(Path::new("/x"), "../id_rsa").unwrap_err(),
                "The key file name in the config is not valid"
            );
        });
    }

    #[test]
    fn stored_names_cannot_leave_the_keys_folder() {
        let dir = Path::new("/config");
        assert_eq!(
            key_path(dir, "manual-3.pem").unwrap(),
            dir.join("keys").join("manual-3.pem")
        );
        for bad in [
            "", "../x.pem", "a/b.pem", "a\\b.pem", ".hidden", "/etc/x", "C:x", "a..pem", "a b.pem",
        ] {
            assert!(key_path(dir, bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn write_and_remove_key_file() {
        let dir = std::env::temp_dir().join(format!("starhop-key-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let key = fake_key("OPENSSH ");
        write_key(&dir, "manual-1.pem", &key).unwrap();
        let path = dir.join("keys").join("manual-1.pem");
        assert_eq!(fs::read_to_string(&path).unwrap(), key);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
            let dir_mode = fs::metadata(dir.join("keys")).unwrap().permissions().mode() & 0o777;
            assert_eq!(dir_mode, 0o700);
        }
        // Replacing keeps one file and no temp file.
        write_key(&dir, "manual-1.pem", &fake_key("RSA ")).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), fake_key("RSA "));
        let names: Vec<_> = fs::read_dir(dir.join("keys"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from("manual-1.pem")]);
        remove_key(&dir, "manual-1.pem");
        assert!(!path.exists());
        remove_key(&dir, "manual-1.pem");
        assert!(write_key(&dir, "../escape.pem", &key).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}

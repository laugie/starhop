use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use starhop_lib::config::{load_config, save_config, Config, ConfigNotice, JsonHostStore};
use starhop_lib::i18n::{with_lang, Lang};
use starhop_lib::hosts::NewManualHost;

fn temp_dir(label: &str) -> PathBuf {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "starhop-config-{label}-{}-{n}",
        std::process::id()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}

struct TempDir(PathBuf);

impl TempDir {
    fn new(label: &str) -> Self {
        Self(temp_dir(label))
    }
}

impl std::ops::Deref for TempDir {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.0
    }
}

impl AsRef<Path> for TempDir {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn sample(name: &str, host: &str, port: u16) -> NewManualHost {
    NewManualHost {
        name: name.to_string(),
        host: host.to_string(),
        user: Some("user".to_string()),
        port: Some(port),
        key: None,
    }
}

fn corrupt_backups(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for entry in fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name();
        if name.to_string_lossy().starts_with("config.json.corrupt-") {
            found.push(entry.path());
        }
    }
    found.sort();
    found
}

#[test]
fn missing_file_gives_defaults() {
    let dir = TempDir::new("missing");
    let loaded = load_config(&dir).unwrap();
    assert_eq!(loaded, Config::default());
    assert!(!dir.join("config.json").exists());
}

#[test]
fn manual_hosts_survive_restart() {
    let dir = TempDir::new("restart");
    {
        let mut store = JsonHostStore::open(&dir);
        store.add(sample("lab", "host-a.example", 2222)).unwrap();
    }
    let store = JsonHostStore::open(&dir);
    let list = store.list();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "lab");
    assert_eq!(list[0].host, "host-a.example");
    assert_eq!(list[0].user.as_deref(), Some("user"));
    assert_eq!(list[0].port, Some(2222));
}

#[test]
fn ids_stay_unique_after_restart() {
    let dir = TempDir::new("ids");
    let first = {
        let mut store = JsonHostStore::open(&dir);
        store.add(sample("lab", "host-a.example", 2222)).unwrap()
    };
    assert_eq!(first.id, "manual-1");

    let mut store = JsonHostStore::open(&dir);
    let second = store.add(sample("other", "host-a.example", 22)).unwrap();
    assert_eq!(second.id, "manual-2");
    let ids: Vec<_> = store
        .list()
        .into_iter()
        .map(|host| host.id)
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["manual-1".to_string(), "manual-2".to_string()]);
    assert_ne!(ids[0], ids[1]);

    let seeded = TempDir::new("ids-max");
    fs::write(
        seeded.join("config.json"),
        r#"{"version":1,"manualHosts":[{"id":"manual-7","name":"lab","host":"host-a.example","user":"user","port":2222}],"settings":{}}"#,
    )
    .unwrap();
    let mut store = JsonHostStore::open(&seeded);
    let next = store.add(sample("other", "host-a.example", 22)).unwrap();
    assert_eq!(next.id, "manual-8");
    let ids: Vec<_> = store
        .list()
        .into_iter()
        .map(|host| host.id)
        .collect::<Vec<_>>();
    assert_eq!(ids.len(), 2);
    assert_eq!(ids[0], "manual-7");
    assert_eq!(ids[1], "manual-8");
}

#[test]
fn corrupt_file_is_backed_up_and_defaults_used() {
    let dir = TempDir::new("corrupt");
    fs::write(dir.join("config.json"), "{ not json").unwrap();
    let loaded = load_config(&dir).unwrap();
    assert_eq!(loaded.version, Config::default().version);
    assert_eq!(loaded.manual_hosts, Config::default().manual_hosts);
    assert_eq!(loaded.settings, Config::default().settings);
    assert_eq!(loaded.notice.map(ConfigNotice::message), Some("配置文件损坏，已备份并重置"));

    let backups = corrupt_backups(&dir);
    assert_eq!(backups.len(), 1);
    let name = backups[0].file_name().unwrap().to_string_lossy();
    let stamp = name.strip_prefix("config.json.corrupt-").unwrap();
    assert_eq!(stamp.len(), 16);
    assert!(stamp.as_bytes()[8] == b'T' && stamp.ends_with('Z'));
    assert!(stamp.as_bytes()[..8].iter().all(u8::is_ascii_digit));
    assert!(stamp.as_bytes()[9..15].iter().all(u8::is_ascii_digit));
    assert_eq!(fs::read(&backups[0]).unwrap(), b"{ not json");
}

#[test]
fn saved_json_has_version_and_no_secret_fields() {
    let dir = TempDir::new("secrets");
    let mut store = JsonHostStore::open(&dir);
    store.add(sample("lab", "host-a.example", 2222)).unwrap();
    let text = fs::read_to_string(dir.join("config.json")).unwrap();
    assert!(text.contains("\"version\""));
    let lower = text.to_lowercase();
    for word in [
        "password",
        "passphrase",
        "private_key",
        "privatekey",
        "secret",
        "token",
        "identity",
    ] {
        assert!(!lower.contains(word), "{word} appeared in {text}");
    }
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(value["version"], 1);
    assert_eq!(value["settings"], serde_json::json!({}));
    assert!(value.get("manual_hosts").is_none());
    assert_eq!(value["manualHosts"][0]["host"], "host-a.example");
    assert_eq!(value["manualHosts"][0]["port"], 2222);
    assert!(text.contains("\n  \"version\": 1"));
}

#[test]
fn unknown_fields_and_newer_version_do_not_crash() {
    let dir = TempDir::new("newer");
    let original = r#"{
  "version": 99,
  "extra": true,
  "manualHosts": [
    {
      "id": "manual-4",
      "name": "lab",
      "host": "host-a.example",
      "user": "user",
      "port": 2222,
      "futureField": "later"
    }
  ],
  "settings": { "theme": "later" },
  "future": { "keep": true }
}
"#;
    fs::write(dir.join("config.json"), original).unwrap();
    let before = fs::read(dir.join("config.json")).unwrap();

    let loaded = load_config(&dir).unwrap();
    assert_eq!(loaded.manual_hosts.len(), 1);
    assert_eq!(loaded.manual_hosts[0].host, "host-a.example");
    assert_eq!(loaded.manual_hosts[0].port, Some(2222));
    assert_eq!(loaded.notice.map(ConfigNotice::message), Some("配置来自更新版本"));
    assert!(loaded.read_only);
    assert_eq!(fs::read(dir.join("config.json")).unwrap(), before);

    let mut store = JsonHostStore::open(&dir);
    assert_eq!(store.list().len(), 1);
    let add_err = store
        .add(sample("other", "host-a.example", 22))
        .unwrap_err();
    assert_eq!(add_err, "配置来自更新版本，无法保存修改");
    let remove_err = store.remove("manual-4").unwrap_err();
    assert_eq!(remove_err, "配置来自更新版本，无法保存修改");
    assert_eq!(store.notice(), Some("配置来自更新版本"));
    with_lang(Lang::En, || {
        assert_eq!(store.notice(), Some("The config is from a newer version of Starhop"));
        assert_eq!(
            store.remove("manual-4").unwrap_err(),
            "The config is from a newer version of Starhop; changes cannot be saved"
        );
        let view = store.appearance_view();
        assert_eq!(
            view.message.as_deref(),
            Some("The config is from a newer version of Starhop; changes cannot be saved")
        );
    });
    assert_eq!(store.list().len(), 1);
    assert_eq!(store.list()[0].id, "manual-4");
    assert_eq!(fs::read(dir.join("config.json")).unwrap(), before);
}

#[test]
fn write_is_atomic_no_tmp_left() {
    let dir = TempDir::new("atomic");
    save_config(&dir, &Config::default()).unwrap();
    let mut names = Vec::new();
    for entry in fs::read_dir(&dir).unwrap() {
        names.push(entry.unwrap().file_name().to_string_lossy().into_owned());
    }
    names.sort();
    assert_eq!(names, vec!["config.json".to_string()]);
}

#[test]
fn add_and_remove_fail_when_write_fails() {
    let dir = TempDir::new("unwritable");
    let mut store = JsonHostStore::open(&dir);
    store.set_save_hook(|_, _| Err("无法保存配置".to_string()));
    let err = store
        .add(sample("lab", "host-a.example", 2222))
        .unwrap_err();
    assert_eq!(err, "无法保存配置");
    assert!(store.list().is_empty());
    assert!(!dir.join("config.json").exists());

    drop(store);
    let mut store = JsonHostStore::open(&dir);
    store.add(sample("lab", "host-a.example", 2222)).unwrap();
    let written = fs::read(dir.join("config.json")).unwrap();
    store.set_save_hook(|_, _| Err("无法保存配置".to_string()));
    let err = store.remove("manual-1").unwrap_err();
    assert_eq!(err, "无法保存配置");
    assert_eq!(store.list().len(), 1);
    assert_eq!(fs::read(dir.join("config.json")).unwrap(), written);
}

#[test]
fn failed_atomic_write_keeps_the_previous_file() {
    let dir = TempDir::new("keep");
    let mut config = Config::default();
    config
        .manual_hosts
        .push(starhop_lib::hosts::ManualHost {
            id: "manual-1".to_string(),
            name: "lab".to_string(),
            host: "host-a.example".to_string(),
            user: Some("user".to_string()),
            port: Some(2222),
            identity_file: None,
        });
    save_config(&dir, &config).unwrap();
    let original = fs::read(dir.join("config.json")).unwrap();
    fs::create_dir(dir.join("config.json.tmp")).unwrap();

    let mut updated = config.clone();
    updated.manual_hosts.clear();
    let err = save_config(&dir, &updated).unwrap_err();
    assert_eq!(err.user_message(), "无法保存配置");
    assert_eq!(fs::read(dir.join("config.json")).unwrap(), original);
}

#[test]
fn corrupt_backups_keep_the_newest_five() {
    let dir = TempDir::new("prune");
    for i in 0..7 {
        fs::write(
            dir.join(format!("config.json.corrupt-20200101T00000{i}Z")),
            format!("old-{i}"),
        )
        .unwrap();
    }
    fs::write(dir.join("config.json"), b"{ not json").unwrap();
    let loaded = load_config(&dir).unwrap();
    assert_eq!(loaded.notice.map(ConfigNotice::message), Some("配置文件损坏，已备份并重置"));

    let backups = corrupt_backups(&dir);
    assert_eq!(backups.len(), 5);
    let contents: Vec<String> = backups
        .iter()
        .map(|path| fs::read_to_string(path).unwrap())
        .collect();
    assert!(contents.iter().any(|text| text == "{ not json"));
    assert!(contents.iter().any(|text| text == "old-6"));
    assert!(contents
        .iter()
        .all(|text| text != "old-0" && text != "old-1"));
}

// Rename to Starhop: the old `my-terminal` config directory is copied once.
mod legacy_dir {
    use super::*;
    use starhop_lib::config::{migrate_legacy_config_dir, LEGACY_CONFIG_DIR_NAME};

    fn legacy_with_files(base: &Path) -> PathBuf {
        let legacy = base.join(LEGACY_CONFIG_DIR_NAME);
        fs::create_dir_all(legacy.join("sub")).unwrap();
        fs::write(legacy.join("config.json"), r#"{"version":1,"manualHosts":[],"settings":{}}"#).unwrap();
        fs::write(legacy.join("topology.json"), "{\"regions\":[]}").unwrap();
        fs::write(legacy.join("sub").join("note.txt"), "x").unwrap();
        legacy
    }

    #[test]
    fn copies_the_legacy_directory_and_keeps_it() {
        let base = TempDir::new("legacy-copy");
        let legacy = legacy_with_files(&base);
        assert!(migrate_legacy_config_dir(&base).unwrap());
        let current = base.join("starhop");
        assert_eq!(
            fs::read_to_string(current.join("topology.json")).unwrap(),
            "{\"regions\":[]}"
        );
        assert_eq!(fs::read_to_string(current.join("sub").join("note.txt")).unwrap(), "x");
        assert!(legacy.join("config.json").exists(), "old folder left in place");
        let leftovers: Vec<_> = fs::read_dir(&*base)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.contains("migrating"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    #[test]
    fn runs_only_once() {
        let base = TempDir::new("legacy-once");
        legacy_with_files(&base);
        assert!(migrate_legacy_config_dir(&base).unwrap());
        let current = base.join("starhop");
        fs::write(current.join("topology.json"), "changed").unwrap();
        assert!(!migrate_legacy_config_dir(&base).unwrap());
        assert_eq!(fs::read_to_string(current.join("topology.json")).unwrap(), "changed");
    }

    #[test]
    fn existing_current_directory_is_never_touched() {
        let base = TempDir::new("legacy-existing");
        legacy_with_files(&base);
        fs::create_dir_all(base.join("starhop")).unwrap();
        assert!(!migrate_legacy_config_dir(&base).unwrap());
        assert!(!base.join("starhop").join("config.json").exists());
    }

    #[test]
    fn nothing_to_do_without_a_legacy_directory() {
        let base = TempDir::new("legacy-none");
        assert!(!migrate_legacy_config_dir(&base).unwrap());
        assert!(!base.join("starhop").exists());
    }
}

// A manual server without a port (for example an ~/.ssh/config alias) lets ssh
// choose the port, and the file does not gain a "port" field.
#[test]
fn manual_host_without_port_round_trips_without_a_port_field() {
    let dir = TempDir::new("no-port");
    let mut store = JsonHostStore::open(&dir);
    let added = store
        .add(NewManualHost {
            name: "work".to_string(),
            host: "work".to_string(),
            user: None,
            port: None,
            key: None,
        })
        .unwrap();
    assert_eq!(added.port, None);
    let text = fs::read_to_string(dir.join("config.json")).unwrap();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert!(value["manualHosts"][0].get("port").is_none(), "{text}");
    assert_eq!(JsonHostStore::open(&dir).list()[0].port, None);
}

// UI language: missing means "follow the system", only en / zh-CN are kept.
#[test]
fn language_setting_round_trips_and_unknown_values_mean_auto() {
    let dir = TempDir::new("language");
    let mut store = JsonHostStore::open(&dir);
    assert_eq!(store.language_setting(), (None, false));
    store.set_language(Some("en")).unwrap();
    assert!(fs::read_to_string(dir.join("config.json")).unwrap().contains("\"language\": \"en\""));
    assert_eq!(JsonHostStore::open(&dir).language_setting().0.as_deref(), Some("en"));
    assert!(store.set_language(Some("fr")).is_err());
    store.set_language(None).unwrap();
    assert!(!fs::read_to_string(dir.join("config.json")).unwrap().contains("language"));

    fs::write(
        dir.join("config.json"),
        r#"{"version":1,"manualHosts":[],"settings":{"language":"klingon"}}"#,
    )
    .unwrap();
    let config = load_config(&dir).unwrap();
    assert_eq!(config.notice, None, "unknown language is not a corrupt file");
    assert_eq!(JsonHostStore::open(&dir).language_setting().0, None);
}

// Notices are stored as a kind at load time and worded when read, so a page
// that sets English after start-up still gets English.
#[test]
fn notices_and_errors_follow_the_language_when_read() {
    let dir = TempDir::new("english");
    fs::write(dir.join("config.json"), "{ not json").unwrap();
    let store = JsonHostStore::open(&dir);
    assert_eq!(store.notice(), Some("配置文件损坏，已备份并重置"));
    with_lang(Lang::En, || {
        assert_eq!(
            store.notice(),
            Some("The config file was damaged; it was backed up and reset")
        );
        assert_eq!(store.login_lock_view().message.as_deref(), store.notice());
    });

    let mut store = JsonHostStore::open(&dir);
    with_lang(Lang::En, || {
        assert_eq!(store.set_language(Some("fr")).unwrap_err(), "Unknown language");
        assert_eq!(store.set_ui_zoom(7).unwrap_err(), "Invalid zoom level");
        assert_eq!(store.set_appearance(Some("nope"), None).unwrap_err(), "Unknown color theme");
        assert_eq!(store.set_appearance(None, Some("nope")).unwrap_err(), "Unknown font");
        assert_eq!(store.set_topology_mode("4d").unwrap_err(), "Unknown topology view");
        assert_eq!(store.remove("manual-404").unwrap_err(), "Server not found");
    });
    assert_eq!(store.remove("manual-404").unwrap_err(), "未找到该服务器");
}

/// Key-shaped text built at run time so no key block sits in the repository.
fn fake_key() -> String {
    let dashes = "-".repeat(5);
    format!("{dashes}BEGIN OPENSSH PRIVATE KEY{dashes}\r\nAAAAexampleonlyAAAA\r\n{dashes}END OPENSSH PRIVATE KEY{dashes}")
}

fn with_key(name: &str, host: &str) -> NewManualHost {
    NewManualHost {
        key: Some(starhop_lib::hosts::key::validate_key_text(&fake_key()).unwrap()),
        ..sample(name, host, 22)
    }
}

#[test]
fn imported_key_is_copied_and_only_its_file_name_is_saved() {
    let dir = TempDir::new("key-import");
    let mut store = JsonHostStore::open(&dir);
    let plain = store.add(sample("plain", "host-a.example", 22)).unwrap();
    assert_eq!(plain.identity_file, None);
    assert_eq!(store.identity_path(&plain.id).unwrap(), None);
    assert!(!dir.join("keys").exists(), "no key, no keys folder");

    let added = store.add(with_key("aws", "host-b.example")).unwrap();
    assert_eq!(added.identity_file.as_deref(), Some("manual-2.pem"));
    let key_file = dir.join("keys").join("manual-2.pem");
    let saved = fs::read_to_string(&key_file).unwrap();
    assert!(saved.ends_with("END OPENSSH PRIVATE KEY-----\n"));
    assert!(!saved.contains('\r'), "line endings are normalized");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(&key_file).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "ssh refuses keys other users can read");
    }

    let text = fs::read_to_string(dir.join("config.json")).unwrap();
    assert!(!text.contains("PRIVATE KEY"), "the key text stays out of config.json");
    assert!(!text.contains("AAAAexampleonly"));
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(value["manualHosts"][1]["identityFile"], "manual-2.pem");
    assert!(value["manualHosts"][0].get("identityFile").is_none());

    drop(store);
    let mut store = JsonHostStore::open(&dir);
    assert_eq!(store.identity_path("manual-2").unwrap(), Some(key_file.clone()));
    store.remove("manual-2").unwrap();
    assert!(!key_file.exists(), "removing the server deletes its key");
    assert_eq!(store.identity_path("manual-2").unwrap_err(), "未找到该服务器");
}

#[test]
fn key_file_is_removed_when_the_config_cannot_be_saved() {
    let dir = TempDir::new("key-unwritable");
    let mut store = JsonHostStore::open(&dir);
    store.set_save_hook(|_, _| Err("无法保存配置".to_string()));
    assert_eq!(store.add(with_key("aws", "host-b.example")).unwrap_err(), "无法保存配置");
    assert!(!dir.join("keys").join("manual-1.pem").exists());
    assert!(store.list().is_empty());
}

#[test]
fn edited_or_missing_key_file_names_are_refused() {
    let dir = TempDir::new("key-edited");
    fs::write(
        dir.join("config.json"),
        r#"{"version":1,"manualHosts":[
            {"id":"manual-1","name":"a","host":"host-a.example","identityFile":"../config.json"},
            {"id":"manual-2","name":"b","host":"host-b.example","identityFile":"manual-2.pem"}
        ],"settings":{}}"#,
    )
    .unwrap();
    let store = JsonHostStore::open(&dir);
    assert_eq!(store.notice(), None, "identityFile loads without a notice");
    assert_eq!(store.list()[1].identity_file.as_deref(), Some("manual-2.pem"));
    assert_eq!(store.identity_path("manual-1").unwrap_err(), "配置里的密钥文件名无效");
    with_lang(Lang::En, || {
        assert_eq!(
            store.identity_path("manual-2").unwrap_err(),
            "The key file for this server is missing. Remove the server and add it again"
        );
    });
}

/// A server the user added by hand.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualHost {
    pub id: String,
    pub name: String,
    pub host: String,
    #[serde(default)]
    pub user: Option<String>,
    /// None lets ssh choose: 22, or the `Port` in `~/.ssh/config` for an alias.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    /// File name of an imported private key under `<config dir>/keys/`.
    /// Never a path; see [`crate::hosts::key::key_path`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity_file: Option<String>,
}

/// Validated fields before the store assigns an id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewManualHost {
    pub name: String,
    pub host: String,
    pub user: Option<String>,
    pub port: Option<u16>,
    /// Text of an imported private key, already checked by
    /// [`crate::hosts::key::validate_key_text`].
    pub key: Option<String>,
}

/// Storage boundary for manual servers.
pub trait HostStore {
    fn list(&self) -> Vec<ManualHost>;
    fn add(&mut self, host: NewManualHost) -> Result<ManualHost, String>;
    fn remove(&mut self, id: &str) -> Result<(), String>;
}

/// Process-local store. Dropping it drops every manual server.
#[derive(Debug, Default)]
pub struct MemoryHostStore {
    next_id: u64,
    hosts: Vec<ManualHost>,
}

impl MemoryHostStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl HostStore for MemoryHostStore {
    fn list(&self) -> Vec<ManualHost> {
        self.hosts.clone()
    }

    fn add(&mut self, host: NewManualHost) -> Result<ManualHost, String> {
        self.next_id += 1;
        let id = format!("manual-{}", self.next_id);
        let stored = ManualHost {
            identity_file: host.key.as_ref().map(|_| super::key::key_file_name(&id)),
            id,
            name: host.name,
            host: host.host,
            user: host.user,
            port: host.port,
        };
        self.hosts.push(stored.clone());
        Ok(stored)
    }

    fn remove(&mut self, id: &str) -> Result<(), String> {
        let before = self.hosts.len();
        self.hosts.retain(|host| host.id != id);
        if self.hosts.len() == before {
            Err(tr!("未找到该服务器", "Server not found"))
        } else {
            Ok(())
        }
    }
}

const NAME_MAX_CHARS: usize = 64;

pub fn validate_manual_input(
    name: &str,
    host: &str,
    user: Option<&str>,
    port: Option<u32>,
) -> Result<NewManualHost, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(tr!("名称不能为空", "Name is required"));
    }
    if name.chars().count() > NAME_MAX_CHARS {
        return Err(tr!(
            "名称不能超过 64 个字符",
            "Name cannot exceed 64 characters"
        ));
    }

    let host = host.trim();
    if host.is_empty() {
        return Err(tr!("主机不能为空", "Host is required"));
    }
    if host.starts_with('-') {
        return Err(tr!("主机不能以 - 开头", "Host cannot start with -"));
    }
    if host.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(tr!("主机不能包含空格", "Host cannot contain spaces"));
    }

    let user = match user {
        None => None,
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.starts_with('-') {
                return Err(tr!("用户名不能以 - 开头", "User name cannot start with -"));
            } else if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
                return Err(tr!("用户名不能包含空格", "User name cannot contain spaces"));
            } else {
                Some(trimmed.to_string())
            }
        }
    };

    let port = match port {
        None => None,
        Some(value) if (1..=65535).contains(&value) => Some(value as u16),
        Some(_) => {
            return Err(tr!(
                "端口必须在 1 到 65535 之间",
                "Port must be between 1 and 65535"
            ))
        }
    };

    Ok(NewManualHost {
        name: name.to_string(),
        host: host.to_string(),
        user,
        port,
        key: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_is_required_and_limited_to_64_chars() {
        let err = validate_manual_input("   ", "host-a", None, None).unwrap_err();
        assert_eq!(err, "名称不能为空");

        let long = "名".repeat(65);
        let err = validate_manual_input(&long, "host-a", None, None).unwrap_err();
        assert_eq!(err, "名称不能超过 64 个字符");

        let ok = validate_manual_input(&"名".repeat(64), "  host-a  ", None, None).unwrap();
        assert_eq!(ok.name.chars().count(), 64);
        assert_eq!(ok.host, "host-a");
        assert_eq!(ok.port, None, "empty port lets ssh choose");
        assert_eq!(ok.user, None);
    }

    #[test]
    fn host_rejects_blank_whitespace_and_leading_dash() {
        assert_eq!(
            validate_manual_input("lab", "   ", None, None).unwrap_err(),
            "主机不能为空"
        );
        assert_eq!(
            validate_manual_input("lab", "host a", None, None).unwrap_err(),
            "主机不能包含空格"
        );
        assert_eq!(
            validate_manual_input("lab", "host\ta", None, None).unwrap_err(),
            "主机不能包含空格"
        );
        assert_eq!(
            validate_manual_input("lab", "-host-a", None, None).unwrap_err(),
            "主机不能以 - 开头"
        );
        let ok = validate_manual_input("lab", "host-a", None, Some(22)).unwrap();
        assert_eq!(ok.host, "host-a");
    }

    #[test]
    fn port_is_optional_and_rejects_out_of_range() {
        assert_eq!(
            validate_manual_input("lab", "host-a", None, None)
                .unwrap()
                .port,
            None
        );
        assert_eq!(
            validate_manual_input("lab", "host-a", None, Some(1))
                .unwrap()
                .port,
            Some(1)
        );
        assert_eq!(
            validate_manual_input("lab", "host-a", None, Some(65535))
                .unwrap()
                .port,
            Some(65535)
        );
        assert_eq!(
            validate_manual_input("lab", "host-a", None, Some(0)).unwrap_err(),
            "端口必须在 1 到 65535 之间"
        );
        assert_eq!(
            validate_manual_input("lab", "host-a", None, Some(65536)).unwrap_err(),
            "端口必须在 1 到 65535 之间"
        );
    }

    #[test]
    fn user_is_optional_and_rejects_unsafe_values() {
        let omitted = validate_manual_input("lab", "host-a", None, None).unwrap();
        assert_eq!(omitted.user, None);
        let blank = validate_manual_input("lab", "host-a", Some("  "), None).unwrap();
        assert_eq!(blank.user, None);
        let kept = validate_manual_input("lab", "host-a", Some(" user "), None).unwrap();
        assert_eq!(kept.user.as_deref(), Some("user"));
        assert_eq!(
            validate_manual_input("lab", "host-a", Some("us er"), None).unwrap_err(),
            "用户名不能包含空格"
        );
        assert_eq!(
            validate_manual_input("lab", "host-a", Some("-user"), None).unwrap_err(),
            "用户名不能以 - 开头"
        );
    }

    #[test]
    fn memory_store_adds_and_removes_without_sharing_state() {
        let mut store = MemoryHostStore::new();
        let store_ref: &mut dyn HostStore = &mut store;
        let added = store_ref
            .add(validate_manual_input("lab", "host-a", Some("user"), Some(2222)).unwrap())
            .unwrap();
        assert_eq!(added.id, "manual-1");
        assert_eq!(added.port, Some(2222));
        assert_eq!(store_ref.list().len(), 1);

        let second = store_ref
            .add(validate_manual_input("other", "host-b", None, None).unwrap())
            .unwrap();
        assert_eq!(second.id, "manual-2");
        store_ref.remove("manual-1").unwrap();
        let left = store_ref.list();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].id, "manual-2");
        assert_eq!(store_ref.remove("manual-1").unwrap_err(), "未找到该服务器");

        let fresh = MemoryHostStore::new();
        assert!(fresh.list().is_empty());
    }

    #[test]
    fn validation_messages_in_english() {
        crate::i18n::with_lang(crate::i18n::Lang::En, || {
            assert_eq!(
                validate_manual_input("   ", "host-a", None, None).unwrap_err(),
                "Name is required"
            );
            assert_eq!(
                validate_manual_input("lab", "-host-a", None, None).unwrap_err(),
                "Host cannot start with -"
            );
            assert_eq!(
                validate_manual_input("lab", "host-a", Some("a b"), None).unwrap_err(),
                "User name cannot contain spaces"
            );
            assert_eq!(
                validate_manual_input("lab", "host-a", None, Some(0)).unwrap_err(),
                "Port must be between 1 and 65535"
            );
        });
    }
}

//! Credential store. Production uses one keyring entry. Tests use memory.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// `keyring` service name. One entry holds the whole JSON record.
pub const KEYRING_SERVICE: &str = "starhop";

/// Service name used before the app was renamed to Starhop. Its entry is moved
/// to [`KEYRING_SERVICE`] the first time the lock reads the store.
pub const LEGACY_KEYRING_SERVICE: &str = "my-terminal";

/// Entry account name. This is not a username and not a secret.
const KEYRING_ACCOUNT: &str = "auth";

/// The store could not be read or written. Callers must fail closed.
#[derive(Debug)]
pub struct StoreError;

/// Object-safe credential store. The running app uses [`KeyringStore`].
pub trait SecretStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, StoreError>;
    fn save(&self, value: &str) -> Result<(), StoreError>;
    /// Remove the entry. Only the rename migration uses it.
    fn clear(&self) -> Result<(), StoreError> {
        Err(StoreError)
    }
}

/// JSON saved in the single keyring entry. The secret itself is never stored.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct Record {
    pub username: String,
    pub phc: String,
    pub failures: u32,
    pub not_before_ms: i64,
    pub last_seen_ms: i64,
}

/// In-memory store for tests. It never touches the real keychain.
#[derive(Debug, Default)]
pub struct MemoryStore {
    inner: Mutex<MemoryState>,
}

#[derive(Debug, Default)]
struct MemoryState {
    value: Option<String>,
    unavailable: bool,
}

impl MemoryStore {
    pub fn dump_all(&self) -> String {
        let guard = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        guard.value.clone().unwrap_or_default()
    }

    pub fn hash_entry(&self) -> String {
        let raw = self.dump_all();
        serde_json::from_str::<Record>(&raw)
            .map(|record| record.phc)
            .unwrap_or_default()
    }

    pub fn set_unavailable(&self, unavailable: bool) {
        let mut guard = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        guard.unavailable = unavailable;
    }
}

impl SecretStore for MemoryStore {
    fn load(&self) -> Result<Option<String>, StoreError> {
        let guard = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        if guard.unavailable {
            return Err(StoreError);
        }
        Ok(guard.value.clone())
    }

    fn save(&self, value: &str) -> Result<(), StoreError> {
        let mut guard = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        if guard.unavailable {
            return Err(StoreError);
        }
        guard.value = Some(value.to_string());
        Ok(())
    }

    fn clear(&self) -> Result<(), StoreError> {
        let mut guard = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        if guard.unavailable {
            return Err(StoreError);
        }
        guard.value = None;
        Ok(())
    }
}

/// The current store plus the entry an older build wrote under another name.
///
/// `load` reads the current entry. Only when it does not exist does it read the
/// legacy one; a legacy record is copied to the current entry and then removed,
/// so deleting the current entry later still resets the lock. A legacy entry
/// that cannot be read is an error, never "no credentials" (fail closed).
pub struct RenamedStore<S, L> {
    current: S,
    legacy: L,
}

impl<S: SecretStore, L: SecretStore> RenamedStore<S, L> {
    pub fn new(current: S, legacy: L) -> Self {
        Self { current, legacy }
    }
}

impl<S: SecretStore, L: SecretStore> SecretStore for RenamedStore<S, L> {
    fn load(&self) -> Result<Option<String>, StoreError> {
        if let Some(value) = self.current.load()? {
            return Ok(Some(value));
        }
        let Some(value) = self.legacy.load()? else {
            return Ok(None);
        };
        // If the copy fails the legacy entry stays and the next load retries.
        if self.current.save(&value).is_ok() {
            let _ = self.legacy.clear();
        }
        Ok(Some(value))
    }

    fn save(&self, value: &str) -> Result<(), StoreError> {
        self.current.save(value)
    }

    fn clear(&self) -> Result<(), StoreError> {
        self.current.clear()
    }
}

/// One JSON blob in the system keychain (macOS) or credential manager (Windows).
pub struct KeyringStore {
    entry: Option<keyring::Entry>,
}

impl KeyringStore {
    pub fn open() -> Self {
        Self::for_service(KEYRING_SERVICE)
    }

    pub fn for_service(service: &str) -> Self {
        let entry = keyring::Entry::new(service, KEYRING_ACCOUNT).ok();
        Self { entry }
    }

    /// The running app's store: the current entry, migrating the legacy one.
    pub fn open_with_legacy() -> RenamedStore<KeyringStore, KeyringStore> {
        RenamedStore::new(Self::open(), Self::for_service(LEGACY_KEYRING_SERVICE))
    }
}

impl SecretStore for KeyringStore {
    fn load(&self) -> Result<Option<String>, StoreError> {
        let Some(entry) = &self.entry else {
            return Err(StoreError);
        };
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(StoreError),
        }
    }

    fn save(&self, value: &str) -> Result<(), StoreError> {
        let Some(entry) = &self.entry else {
            return Err(StoreError);
        };
        entry.set_password(value).map_err(|_| StoreError)
    }

    fn clear(&self) -> Result<(), StoreError> {
        let Some(entry) = &self.entry else {
            return Err(StoreError);
        };
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(StoreError),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stores(current: Option<&str>, legacy: Option<&str>) -> RenamedStore<MemoryStore, MemoryStore> {
        let (now, old) = (MemoryStore::default(), MemoryStore::default());
        if let Some(value) = current {
            now.save(value).unwrap();
        }
        if let Some(value) = legacy {
            old.save(value).unwrap();
        }
        RenamedStore::new(now, old)
    }

    #[test]
    fn current_entry_wins_and_legacy_is_left_alone() {
        let store = stores(Some("new"), Some("old"));
        assert_eq!(store.load().unwrap().as_deref(), Some("new"));
        assert_eq!(store.legacy.dump_all(), "old");
    }

    #[test]
    fn legacy_entry_moves_to_the_current_name_once() {
        let store = stores(None, Some("old"));
        assert_eq!(store.load().unwrap().as_deref(), Some("old"));
        assert_eq!(store.current.dump_all(), "old");
        assert_eq!(store.legacy.load().unwrap(), None, "legacy removed after the copy");
        // Deleting the current entry resets the lock; nothing comes back.
        store.current.clear().unwrap();
        assert_eq!(store.load().unwrap(), None);
    }

    #[test]
    fn unreadable_current_entry_fails_closed() {
        let store = stores(None, Some("old"));
        store.current.set_unavailable(true);
        assert!(store.load().is_err());
        assert_eq!(store.legacy.dump_all(), "old");
    }

    #[test]
    fn a_failed_copy_keeps_the_legacy_entry() {
        let store = RenamedStore::new(FailingSave, MemoryStore::default());
        store.legacy.save("old").unwrap();
        assert_eq!(store.load().unwrap().as_deref(), Some("old"));
        assert_eq!(store.legacy.dump_all(), "old");
    }

    #[test]
    fn unreadable_legacy_entry_fails_closed() {
        let store = stores(None, None);
        store.legacy.set_unavailable(true);
        assert!(store.load().is_err());
    }

    #[test]
    fn writes_go_to_the_current_entry_only() {
        let store = stores(None, None);
        store.save("v").unwrap();
        assert_eq!(store.current.dump_all(), "v");
        assert_eq!(store.legacy.load().unwrap(), None);
    }

    struct FailingSave;

    impl SecretStore for FailingSave {
        fn load(&self) -> Result<Option<String>, StoreError> {
            Ok(None)
        }

        fn save(&self, _value: &str) -> Result<(), StoreError> {
            Err(StoreError)
        }
    }

    #[test]
    fn service_names() {
        assert_eq!(KEYRING_SERVICE, "starhop");
        assert_eq!(LEGACY_KEYRING_SERVICE, "my-terminal");
    }
}

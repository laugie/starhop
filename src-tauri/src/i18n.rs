//! UI language for messages the back end sends to the page.
//!
//! Every user-visible message is written in both languages at the call site:
//!
//! ```ignore
//! tr!("名称不能为空", "Name is required")
//! tr!("区域「{region}」缺少 {field}", "Region \"{region}\" is missing {field}")
//! tr!("端口 {} 无效", "Port {} is invalid", port)
//! ```
//!
//! `tr!` returns a `String`, with the same arguments as `format!`.
//! The language is process-wide. It starts as Chinese so the existing tests,
//! which compare Chinese messages, stay valid; the app sets it from the
//! saved setting and the system language when the page starts
//! ([`locale_sync`]).

use std::sync::atomic::{AtomicU8, Ordering};

use tauri::Manager;

use crate::hosts::HostState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Zh,
    En,
}

impl Lang {
    /// Tag used in config and by the page.
    pub fn tag(self) -> &'static str {
        match self {
            Lang::Zh => "zh-CN",
            Lang::En => "en",
        }
    }
}

/// Values the `language` setting may hold. Missing means "auto".
pub const LANGUAGES: [&str; 2] = ["en", "zh-CN"];

static CURRENT: AtomicU8 = AtomicU8::new(0);

thread_local! {
    /// Per-thread override for tests, so a test can check English messages
    /// without racing tests that check Chinese ones. See [`with_lang`].
    static OVERRIDE: std::cell::Cell<Option<Lang>> = const { std::cell::Cell::new(None) };
}

pub fn lang() -> Lang {
    if let Some(lang) = OVERRIDE.with(std::cell::Cell::get) {
        return lang;
    }
    if CURRENT.load(Ordering::Relaxed) == 1 {
        Lang::En
    } else {
        Lang::Zh
    }
}

/// Run `f` with messages in `lang` on this thread only. For tests.
pub fn with_lang<T>(lang: Lang, f: impl FnOnce() -> T) -> T {
    let before = OVERRIDE.with(|cell| cell.replace(Some(lang)));
    let result = f();
    OVERRIDE.with(|cell| cell.set(before));
    result
}

pub fn set_lang(lang: Lang) {
    CURRENT.store(u8::from(lang == Lang::En), Ordering::Relaxed);
}

/// The language to use: the saved setting, or the system language for
/// "auto". Chinese for any `zh*` tag, English otherwise.
pub fn resolve(setting: Option<&str>, system: &str) -> Lang {
    let tag = match setting {
        Some(saved) if LANGUAGES.contains(&saved) => saved,
        _ => system,
    };
    if tag.trim().to_ascii_lowercase().starts_with("zh") {
        Lang::Zh
    } else {
        Lang::En
    }
}

/// A message in both languages. See the module docs.
#[macro_export]
macro_rules! tr {
    ($zh:literal, $en:literal $(,)?) => {
        match $crate::i18n::lang() {
            $crate::i18n::Lang::Zh => format!($zh),
            $crate::i18n::Lang::En => format!($en),
        }
    };
    ($zh:literal, $en:literal, $($arg:tt)+) => {
        match $crate::i18n::lang() {
            $crate::i18n::Lang::Zh => format!($zh, $($arg)+),
            $crate::i18n::Lang::En => format!($en, $($arg)+),
        }
    };
}

/// The saved setting (`auto`, `en` or `zh-CN`) and the language in use.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleView {
    pub setting: String,
    pub effective: String,
    pub read_only: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// First call from the page. Reads the saved setting, picks the language with
/// the page's `navigator.language`, and uses it for back-end messages.
/// Not behind the login lock: the login screen needs its language too.
#[tauri::command]
pub async fn locale_sync(app: tauri::AppHandle, system: String) -> Result<LocaleView, String> {
    let state = app.state::<HostState>();
    let (setting, read_only) = state.language_setting()?;
    let lang = resolve(setting.as_deref(), &system);
    set_lang(lang);
    Ok(LocaleView {
        setting: setting.unwrap_or_else(|| "auto".to_string()),
        effective: lang.tag().to_string(),
        read_only,
        message: None,
    })
}

/// Save `auto`, `en` or `zh-CN`. The page applies it on the next start;
/// back-end messages switch at once.
#[tauri::command]
pub async fn locale_set(
    app: tauri::AppHandle,
    setting: String,
    system: String,
) -> Result<LocaleView, String> {
    let chosen = (setting != "auto").then_some(setting);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<HostState>();
        let saved = state.set_language(chosen.as_deref());
        let (setting, read_only) = state.language_setting()?;
        let lang = resolve(setting.as_deref(), &system);
        set_lang(lang);
        Ok(LocaleView {
            setting: setting.unwrap_or_else(|| "auto".to_string()),
            effective: lang.tag().to_string(),
            read_only,
            message: saved.err(),
        })
    })
    .await
    .map_err(|_| tr!("无法保存设置", "Could not save the setting"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setting_wins_over_the_system_language() {
        assert_eq!(resolve(Some("en"), "zh-CN"), Lang::En);
        assert_eq!(resolve(Some("zh-CN"), "en-US"), Lang::Zh);
    }

    #[test]
    fn auto_follows_the_system_language() {
        assert_eq!(resolve(None, "zh-CN"), Lang::Zh);
        assert_eq!(resolve(None, "zh-Hant-TW"), Lang::Zh);
        assert_eq!(resolve(None, "en-GB"), Lang::En);
        assert_eq!(resolve(None, "de-DE"), Lang::En);
        assert_eq!(resolve(None, ""), Lang::En);
        assert_eq!(resolve(Some("fr"), "zh-CN"), Lang::Zh, "unknown setting is auto");
    }

    #[test]
    fn with_lang_overrides_this_thread_only() {
        assert_eq!(lang(), Lang::Zh);
        let inner = with_lang(Lang::En, || (lang(), crate::tr!("中 {}", "En {}", 1)));
        assert_eq!(inner, (Lang::En, "En 1".to_string()));
        assert_eq!(lang(), Lang::Zh);
        assert_eq!(crate::tr!("中 {}", "En {}", 2), "中 2");
    }

    #[test]
    fn tags() {
        assert_eq!(Lang::Zh.tag(), "zh-CN");
        assert_eq!(Lang::En.tag(), "en");
    }
}

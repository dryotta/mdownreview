//! CLI shim install/status/remove. Delegates to a platform sub-module.

use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CliShimStatus {
    Done,
    Missing,
    Broken,
    Unsupported,
}

/// Structured error for CLI-shim install/remove. Serializes to a tagged
/// payload (`{"kind":"...", ...}`) so the FE can branch on `kind` without
/// string matching. Manual `Display` impl avoids pulling in `thiserror`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CliShimError {
    PermissionDenied { path: String },
    Io { message: String },
}

impl fmt::Display for CliShimError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PermissionDenied { path } => write!(f, "permission denied: {path}"),
            Self::Io { message } => write!(f, "io error: {message}"),
        }
    }
}

impl std::error::Error for CliShimError {}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as imp;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as imp;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod unsupported;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use unsupported as imp;

#[tauri::command]
pub fn cli_shim_status(app: tauri::AppHandle) -> CliShimStatus {
    imp::status(&app)
}

#[tauri::command]
pub fn install_cli_shim(app: tauri::AppHandle) -> Result<(), CliShimError> {
    imp::install(&app)
}

#[tauri::command]
pub fn remove_cli_shim(app: tauri::AppHandle) -> Result<(), CliShimError> {
    imp::remove(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_shim_error_serialises_with_tag() {
        let s = serde_json::to_string(&CliShimError::PermissionDenied {
            path: "/x".into(),
        })
        .unwrap();
        assert_eq!(s, r#"{"kind":"permission_denied","path":"/x"}"#);

        let s = serde_json::to_string(&CliShimError::Io {
            message: "boom".into(),
        })
        .unwrap();
        assert_eq!(s, r#"{"kind":"io","message":"boom"}"#);
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LaunchArgs {
    pub files: Vec<String>,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MrsfComment {
    pub id: String,
    pub author: String,
    pub timestamp: String,
    pub text: String,
    pub resolved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchored_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub comment_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrsfSidecar {
    pub mrsf_version: String,
    pub document: String,
    pub comments: Vec<MrsfComment>,
}

/// Mutations that can be applied to a comment via patch_comment.
pub enum CommentMutation {
    SetResolved(bool),
    AddResponse {
        author: String,
        text: String,
        timestamp: String,
    },
}

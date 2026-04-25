//! MRSF v1.1 public types. Wire-format serde lives in [`wire`].

use serde::{Deserialize, Serialize};

mod wire;

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

// ── MRSF v1.1 anchor enum ──────────────────────────────────────────────────
//
// Tagged anchor type. Wire format is hand-rolled in `serde.rs`: the v1.0
// `Line` shape stays flat (no `anchor_kind`), while every other variant is
// emitted as `anchor_kind` + matching payload object.
//
// Intentionally NOT `Default` — every construction site must pick a variant
// explicitly. Use [`MrsfComment::new_legacy_line`] for legacy line callers.
#[derive(Debug, Clone, PartialEq)]
pub enum Anchor {
    Line {
        line: u32,
        end_line: Option<u32>,
        start_column: Option<u32>,
        end_column: Option<u32>,
        selected_text: Option<String>,
        selected_text_hash: Option<String>,
    },
    File,
    ImageRect(ImageRectAnchor),
    CsvCell(CsvCellAnchor),
    JsonPath(JsonPathAnchor),
    HtmlRange(HtmlRangeAnchor),
    HtmlElement(HtmlElementAnchor),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImageRectAnchor {
    pub x_pct: f32,
    pub y_pct: f32,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub w_pct: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub h_pct: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CsvCellAnchor {
    pub row_idx: u32,
    pub col_idx: u32,
    pub col_header: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub primary_key_col: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub primary_key_value: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct JsonPathAnchor {
    pub json_path: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub scalar_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HtmlRangeAnchor {
    pub selector_path: String,
    pub start_offset: u32,
    pub end_offset: u32,
    pub selected_text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HtmlElementAnchor {
    pub selector_path: String,
    pub tag: String,
    pub text_preview: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Reaction {
    pub user: String,
    pub kind: String,
    pub ts: String,
}

// ── Comment ────────────────────────────────────────────────────────────────

/// In-memory MRSF comment. Wire serde lives in [`wire::MrsfCommentRepr`].
///
/// `anchor` is the canonical anchor source. Legacy flat line fields
/// (`line`, `end_line`, `start_column`, `end_column`, `selected_text`,
/// `selected_text_hash`, `anchored_text`) are kept on the struct because
/// existing matchers/exporters/threads still read them; for `Anchor::Line`
/// they MUST stay in sync with the variant payload (the serde repr enforces
/// this on round-trip).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "wire::MrsfCommentRepr", into = "wire::MrsfCommentRepr")]
pub struct MrsfComment {
    pub id: String,
    pub author: String,
    pub timestamp: String,
    pub text: String,
    pub resolved: bool,
    pub line: Option<u32>,
    pub end_line: Option<u32>,
    pub start_column: Option<u32>,
    pub end_column: Option<u32>,
    pub selected_text: Option<String>,
    pub anchored_text: Option<String>,
    pub selected_text_hash: Option<String>,
    pub commit: Option<String>,
    pub comment_type: Option<String>,
    pub severity: Option<String>,
    pub reply_to: Option<String>,
    pub anchor: Anchor,
    pub anchor_history: Option<Vec<Anchor>>,
    pub reactions: Option<Vec<Reaction>>,
}

impl Default for MrsfComment {
    fn default() -> Self {
        Self {
            id: String::new(),
            author: String::new(),
            timestamp: String::new(),
            text: String::new(),
            resolved: false,
            line: None,
            end_line: None,
            start_column: None,
            end_column: None,
            selected_text: None,
            anchored_text: None,
            selected_text_hash: None,
            commit: None,
            comment_type: None,
            severity: None,
            reply_to: None,
            anchor: Anchor::Line {
                line: 0,
                end_line: None,
                start_column: None,
                end_column: None,
                selected_text: None,
                selected_text_hash: None,
            },
            anchor_history: None,
            reactions: None,
        }
    }
}

impl MrsfComment {
    /// FIFO-clamp anchor history to 3 entries. Pushes `prev` to the back,
    /// dropping the oldest if full. The cap is intentional: anchor history
    /// is bounded to keep sidecars small (advisory: bounded mutation).
    pub fn push_anchor_history(&mut self, prev: Anchor) {
        const CAP: usize = 3;
        match self.anchor_history {
            Some(ref mut h) => {
                if h.len() == CAP {
                    h.remove(0);
                }
                h.push(prev);
            }
            None => self.anchor_history = Some(vec![prev]),
        }
    }

    /// Construct a v1.0-shaped legacy line comment. Both the flat line
    /// fields and `anchor` are populated identically so downstream readers
    /// (which still consume the flat fields) and the serde wire format
    /// stay coherent.
    #[allow(clippy::too_many_arguments)]
    pub fn new_legacy_line(
        id: String,
        author: String,
        timestamp: String,
        text: String,
        resolved: bool,
        line: Option<u32>,
        end_line: Option<u32>,
        start_column: Option<u32>,
        end_column: Option<u32>,
        selected_text: Option<String>,
        selected_text_hash: Option<String>,
    ) -> Self {
        Self {
            id,
            author,
            timestamp,
            text,
            resolved,
            line,
            end_line,
            start_column,
            end_column,
            selected_text: selected_text.clone(),
            anchored_text: None,
            selected_text_hash: selected_text_hash.clone(),
            commit: None,
            comment_type: None,
            severity: None,
            reply_to: None,
            anchor: Anchor::Line {
                line: line.unwrap_or(0),
                end_line,
                start_column,
                end_column,
                selected_text,
                selected_text_hash,
            },
            anchor_history: None,
            reactions: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrsfSidecar {
    pub mrsf_version: String,
    pub document: String,
    pub comments: Vec<MrsfComment>,
}

/// Anchor specification for creating new comments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentAnchor {
    pub line: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedComment {
    #[serde(flatten)]
    pub comment: MrsfComment,
    pub matched_line_number: u32,
    pub is_orphaned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchored_text: Option<String>,
}

/// A thread: root comment with replies sorted by timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub root: MatchedComment,
    pub replies: Vec<MatchedComment>,
}

/// Mutations applied via `patch_comment`.
pub enum CommentMutation {
    SetResolved(bool),
    AddResponse {
        author: String,
        text: String,
        timestamp: String,
    },
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;

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
mod tests {
    use super::*;

    /// Regression sentinel — DO NOT MODIFY. v1.0 sidecars must round-trip
    /// without any v1.1 wire-field leaking into the output.
    #[test]
    fn v1_0_sidecar_round_trips_without_new_fields() {
        let json = r#"{
            "mrsf_version": "1.0",
            "document": "test.md",
            "comments": [{
                "id": "c1",
                "author": "alice",
                "timestamp": "2025-01-01T00:00:00Z",
                "text": "hello",
                "resolved": false,
                "line": 5
            }]
        }"#;
        let sidecar: MrsfSidecar = serde_json::from_str(json).unwrap();
        assert_eq!(sidecar.mrsf_version, "1.0");
        assert_eq!(sidecar.comments.len(), 1);

        let re = serde_json::to_string(&sidecar).unwrap();
        for forbidden in [
            "anchor_kind",
            "image_rect",
            "csv_cell",
            "json_path",
            "html_range",
            "html_element",
            "reactions",
            "anchor_history",
        ] {
            assert!(
                !re.contains(forbidden),
                "v1.0 round-trip leaked v1.1 field `{forbidden}`: {re}"
            );
        }
    }

    fn parse_one(json: &str) -> MrsfComment {
        let sidecar: MrsfSidecar = serde_json::from_str(json).unwrap();
        sidecar.comments.into_iter().next().unwrap()
    }

    fn wrap_comment(comment_body: &str) -> String {
        format!(
            r#"{{"mrsf_version":"1.1","document":"t.md","comments":[{}]}}"#,
            comment_body
        )
    }

    #[test]
    fn v1_1_image_rect_round_trip_uses_tagged_layout() {
        let body = r#"{"id":"c1","author":"a","timestamp":"2025-01-01T00:00:00Z","text":"x","resolved":false,"anchor_kind":"image_rect","image_rect":{"x_pct":10.5,"y_pct":20.5,"w_pct":30.0,"h_pct":40.0}}"#;
        let c = parse_one(&wrap_comment(body));
        assert!(matches!(c.anchor, Anchor::ImageRect(_)));
        let re = serde_json::to_string(&c).unwrap();
        assert!(re.contains(r#""anchor_kind":"image_rect""#));
        assert!(re.contains(r#""image_rect""#));
        assert!(!re.contains(r#""line""#));
    }

    #[test]
    fn v1_1_csv_cell_round_trip() {
        let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"csv_cell","csv_cell":{"row_idx":3,"col_idx":2,"col_header":"name"}}"#;
        let c = parse_one(&wrap_comment(body));
        assert!(matches!(c.anchor, Anchor::CsvCell(_)));
        let re = serde_json::to_string(&c).unwrap();
        assert!(re.contains(r#""anchor_kind":"csv_cell""#));
        assert!(re.contains(r#""csv_cell""#));
    }

    #[test]
    fn v1_1_json_path_round_trip() {
        let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"json_path","json_path":{"json_path":"$.a","scalar_text":"v"}}"#;
        let c = parse_one(&wrap_comment(body));
        assert!(matches!(c.anchor, Anchor::JsonPath(_)));
        let re = serde_json::to_string(&c).unwrap();
        assert!(re.contains(r#""anchor_kind":"json_path""#));
    }

    #[test]
    fn v1_1_html_range_round_trip() {
        let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"html_range","html_range":{"selector_path":"p","start_offset":0,"end_offset":5,"selected_text":"hello"}}"#;
        let c = parse_one(&wrap_comment(body));
        assert!(matches!(c.anchor, Anchor::HtmlRange(_)));
        let re = serde_json::to_string(&c).unwrap();
        assert!(re.contains(r#""anchor_kind":"html_range""#));
    }

    #[test]
    fn v1_1_html_element_round_trip() {
        let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"html_element","html_element":{"selector_path":"div","tag":"div","text_preview":"hi"}}"#;
        let c = parse_one(&wrap_comment(body));
        assert!(matches!(c.anchor, Anchor::HtmlElement(_)));
        let re = serde_json::to_string(&c).unwrap();
        assert!(re.contains(r#""anchor_kind":"html_element""#));
    }

    #[test]
    fn discriminator_payload_mismatch_is_rejected() {
        let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"image_rect"}"#;
        let res: Result<MrsfSidecar, _> = serde_json::from_str(&wrap_comment(body));
        assert!(res.is_err(), "expected mismatch error, got {:?}", res);
        let err = res.unwrap_err().to_string();
        assert!(
            err.contains("anchor_kind/payload mismatch"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn anchor_history_caps_at_three_fifo() {
        let mut c = MrsfComment::default();
        for i in 1..=4u32 {
            c.push_anchor_history(Anchor::Line {
                line: i,
                end_line: None,
                start_column: None,
                end_column: None,
                selected_text: None,
                selected_text_hash: None,
            });
        }
        let h = c.anchor_history.as_ref().unwrap();
        assert_eq!(h.len(), 3);
        // Oldest (line 1) dropped; remaining are 2, 3, 4 in FIFO order.
        let lines: Vec<u32> = h
            .iter()
            .map(|a| match a {
                Anchor::Line { line, .. } => *line,
                _ => panic!("expected Line"),
            })
            .collect();
        assert_eq!(lines, vec![2, 3, 4]);
    }

    #[test]
    fn v1_0_byte_identity_fixture() {
        let raw = include_str!("../../../tests/fixtures/mrsf/v1.0/byte_identity.yaml");
        // Normalise CRLF in the on-disk fixture (Windows checkout) before
        // comparison — serde_yaml_ng emits LF unconditionally.
        let input = raw.replace("\r\n", "\n");
        let sidecar: MrsfSidecar = serde_yaml_ng::from_str(&input).unwrap();
        let re = serde_yaml_ng::to_string(&sidecar).unwrap();
        assert_eq!(input, re, "v1.0 fixture must round-trip byte-identically");
    }

    #[test]
    fn legacy_line_constructor_keeps_flat_and_anchor_in_sync() {
        let c = MrsfComment::new_legacy_line(
            "c1".into(),
            "a".into(),
            "t".into(),
            "x".into(),
            false,
            Some(7),
            Some(9),
            None,
            None,
            None,
            None,
        );
        assert_eq!(c.line, Some(7));
        match &c.anchor {
            Anchor::Line { line, end_line, .. } => {
                assert_eq!(*line, 7);
                assert_eq!(*end_line, Some(9));
            }
            _ => panic!("expected Line"),
        }
    }
}

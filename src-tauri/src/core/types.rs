use serde::{Deserialize, Serialize};

/// MRSF schema version emitted when WRITING new sidecars that DON'T use any
/// v1.1-only fields. Use [`mrsf_version_for`] to pick the correct version
/// per-sidecar so v1.0-pure sidecars don't leak a `1.1` declaration.
pub const MRSF_VERSION_DEFAULT: &str = "1.0";

/// MRSF schema version emitted when a sidecar carries any v1.1-only field
/// (variant anchor, reactions, anchor_history, …).
pub const MRSF_VERSION_V1_1: &str = "1.1";

/// Backwards-compat alias retained for code paths that haven't been migrated
/// to [`mrsf_version_for`]. Defaults to v1.1 since that's what the previous
/// constant value was — emitting v1.0 unconditionally for legacy callers
/// would risk truncating already-emitted v1.1 fields.
#[deprecated(note = "use `mrsf_version_for(&comments)` to pick per-sidecar")]
pub const MRSF_VERSION_WRITE: &str = MRSF_VERSION_V1_1;

/// Pick the MRSF schema version to write for a given set of comments.
/// Returns "1.0" when every comment is purely v1.0-shaped (no anchor_kind,
/// no variant anchor payload, no reactions); "1.1" otherwise. Prevents
/// pristine v1.0 sidecars from being rewritten with a `mrsf_version: "1.1"`
/// declaration just because the writer constant moved on (advisory #5).
pub fn mrsf_version_for(comments: &[MrsfComment]) -> &'static str {
    let any_v1_1 = comments.iter().any(|c| {
        c.anchor_kind.is_some()
            || c.image_rect.is_some()
            || c.csv_cell.is_some()
            || c.json_path.is_some()
            || c.html_range.is_some()
            || c.html_element.is_some()
            || c.reactions.as_ref().is_some_and(|r| !r.is_empty())
    });
    if any_v1_1 {
        MRSF_VERSION_V1_1
    } else {
        MRSF_VERSION_DEFAULT
    }
}

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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

    // ── MRSF v1.1 additive fields ──────────────────────────────────────────
    // All optional, omitted on serialise when None so v1.0 sidecars round-trip
    // unchanged. The Anchor enum and `anchor_history` field are deferred to
    // Group B; this struct will gain `pub anchor_history: Option<Vec<Anchor>>`
    // there.
    // TODO(group-b): add `anchor_history: Option<Vec<Anchor>>` once the
    // Anchor enum lands.
    /// Discriminator: "line" | "file" | "image-rect" | "csv-cell" |
    /// "json-path" | "html-range" | "html-element". Absent = legacy line anchor.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub anchor_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub image_rect: Option<ImageRectAnchor>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub csv_cell: Option<CsvCellAnchor>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub json_path: Option<JsonPathAnchor>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub html_range: Option<HtmlRangeAnchor>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub html_element: Option<HtmlElementAnchor>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reactions: Option<Vec<Reaction>>,
}

// ── MRSF v1.1 anchor payloads ──────────────────────────────────────────────

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrsfSidecar {
    pub mrsf_version: String,
    pub document: String,
    pub comments: Vec<MrsfComment>,
}

/// Anchor specification for creating new comments
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

/// A thread: root comment with its replies sorted by timestamp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub root: MatchedComment,
    pub replies: Vec<MatchedComment>,
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

#[cfg(test)]
mod mrsf_v1_1_tests {
    use super::*;

    /// A v1.0 sidecar JSON (only legacy fields) deserialises and re-serialises
    /// without leaking any of the new optional v1.1 fields.
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
        let c = &sidecar.comments[0];
        assert!(c.anchor_kind.is_none());
        assert!(c.image_rect.is_none());
        assert!(c.csv_cell.is_none());
        assert!(c.json_path.is_none());
        assert!(c.html_range.is_none());
        assert!(c.html_element.is_none());
        assert!(c.reactions.is_none());

        let re = serde_json::to_string(&sidecar).unwrap();
        for forbidden in [
            "anchor_kind",
            "image_rect",
            "csv_cell",
            "json_path",
            "html_range",
            "html_element",
            "reactions",
        ] {
            assert!(
                !re.contains(forbidden),
                "v1.0 round-trip leaked v1.1 field `{forbidden}`: {re}"
            );
        }
    }

    /// A v1.1 sidecar carrying every new field round-trips losslessly.
    #[test]
    fn v1_1_sidecar_round_trips_all_new_fields() {
        let json = r#"{
            "mrsf_version": "1.1",
            "document": "test.md",
            "comments": [{
                "id": "c1",
                "author": "alice",
                "timestamp": "2025-01-01T00:00:00Z",
                "text": "hello",
                "resolved": false,
                "anchor_kind": "image-rect",
                "image_rect": { "x_pct": 10.5, "y_pct": 20.5, "w_pct": 30.0, "h_pct": 40.0 },
                "csv_cell": {
                    "row_idx": 3,
                    "col_idx": 2,
                    "col_header": "name",
                    "primary_key_col": "id",
                    "primary_key_value": "42"
                },
                "json_path": { "json_path": "$.users[0].name", "scalar_text": "Alice" },
                "html_range": {
                    "selector_path": "body > div:nth-of-type(1) > p",
                    "start_offset": 0,
                    "end_offset": 5,
                    "selected_text": "Hello"
                },
                "html_element": {
                    "selector_path": "body > div",
                    "tag": "div",
                    "text_preview": "Hello world"
                },
                "reactions": [
                    { "user": "bob", "kind": "thumbs_up", "ts": "2025-01-02T00:00:00Z" }
                ]
            }]
        }"#;
        let sidecar: MrsfSidecar = serde_json::from_str(json).unwrap();
        let c = &sidecar.comments[0];
        assert_eq!(c.anchor_kind.as_deref(), Some("image-rect"));
        assert_eq!(
            c.image_rect,
            Some(ImageRectAnchor {
                x_pct: 10.5,
                y_pct: 20.5,
                w_pct: Some(30.0),
                h_pct: Some(40.0),
            })
        );
        assert_eq!(
            c.csv_cell,
            Some(CsvCellAnchor {
                row_idx: 3,
                col_idx: 2,
                col_header: "name".to_string(),
                primary_key_col: Some("id".to_string()),
                primary_key_value: Some("42".to_string()),
            })
        );
        assert_eq!(
            c.json_path,
            Some(JsonPathAnchor {
                json_path: "$.users[0].name".to_string(),
                scalar_text: Some("Alice".to_string()),
            })
        );
        assert_eq!(
            c.html_range,
            Some(HtmlRangeAnchor {
                selector_path: "body > div:nth-of-type(1) > p".to_string(),
                start_offset: 0,
                end_offset: 5,
                selected_text: "Hello".to_string(),
            })
        );
        assert_eq!(
            c.html_element,
            Some(HtmlElementAnchor {
                selector_path: "body > div".to_string(),
                tag: "div".to_string(),
                text_preview: "Hello world".to_string(),
            })
        );
        assert_eq!(
            c.reactions,
            Some(vec![Reaction {
                user: "bob".to_string(),
                kind: "thumbs_up".to_string(),
                ts: "2025-01-02T00:00:00Z".to_string(),
            }])
        );

        // Re-serialise and re-deserialise to confirm full lossless round-trip.
        let re = serde_json::to_string(&sidecar).unwrap();
        let sidecar2: MrsfSidecar = serde_json::from_str(&re).unwrap();
        assert_eq!(sidecar.comments, sidecar2.comments);
    }

    #[test]
    fn write_constant_is_v1_1() {
        // Legacy callers still see v1.1; new callers should use mrsf_version_for.
        #[allow(deprecated)]
        {
            assert_eq!(MRSF_VERSION_WRITE, "1.1");
        }
    }

    #[test]
    fn version_selector_prefers_v1_0_for_pure_legacy_comments() {
        let json = r#"{
            "mrsf_version": "1.0",
            "document": "test.md",
            "comments": [{
                "id": "c1","author":"a","timestamp":"2025-01-01T00:00:00Z",
                "text":"x","resolved":false,"line":1
            }]
        }"#;
        let s: MrsfSidecar = serde_json::from_str(json).unwrap();
        assert_eq!(mrsf_version_for(&s.comments), "1.0");
    }

    #[test]
    fn version_selector_promotes_to_v1_1_when_variant_anchor_present() {
        let mut c = MrsfComment::default();
        c.anchor_kind = Some("image-rect".into());
        c.image_rect = Some(ImageRectAnchor {
            x_pct: 1.0,
            y_pct: 2.0,
            w_pct: None,
            h_pct: None,
        });
        assert_eq!(mrsf_version_for(&[c]), "1.1");
    }

    #[test]
    fn version_selector_promotes_to_v1_1_when_reactions_present() {
        let mut c = MrsfComment::default();
        c.reactions = Some(vec![Reaction {
            user: "u".into(),
            kind: "thumbs_up".into(),
            ts: "2025-01-01T00:00:00Z".into(),
        }]);
        assert_eq!(mrsf_version_for(&[c]), "1.1");
    }

    #[test]
    fn version_selector_treats_empty_reactions_as_v1_0() {
        let mut c = MrsfComment::default();
        c.reactions = Some(vec![]);
        assert_eq!(mrsf_version_for(&[c]), "1.0");
    }
}

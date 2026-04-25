//! Wire-format serde repr for [`MrsfComment`] and [`Anchor`].
//!
//! `MrsfCommentRepr` mirrors the MRSF on-disk JSON/YAML schema (flat line
//! fields + optional `anchor_kind` discriminator + per-variant payload
//! object). `From`/`Into` conversions move between the public ergonomic
//! `MrsfComment` (with tagged `anchor: Anchor`) and the wire repr while
//! enforcing two invariants:
//!
//!   1. v1.0 sidecars (no `anchor_kind`, only flat `line`/`end_line`/…)
//!      round-trip byte-identically — `Anchor::Line` with no v1.1 markers
//!      serialises with NO `anchor_kind` field.
//!   2. `anchor_kind` discriminator and payload field MUST agree on read
//!      (e.g. `anchor_kind: "image_rect"` requires `image_rect: {...}`).

use serde::{Deserialize, Serialize};

use super::{
    Anchor, CsvCellAnchor, HtmlElementAnchor, HtmlRangeAnchor, ImageRectAnchor, JsonPathAnchor,
    MrsfComment, Reaction,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct MrsfCommentRepr {
    pub id: String,
    pub author: String,
    pub timestamp: String,
    pub text: String,
    pub resolved: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub end_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub start_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub end_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub anchored_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub selected_text_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub commit: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none", default)]
    pub comment_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reply_to: Option<String>,
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
    pub anchor_history: Option<Vec<AnchorRepr>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reactions: Option<Vec<Reaction>>,
}

/// Wire form for an Anchor inside `anchor_history`. Tagged via
/// `anchor_kind` + `anchor_data` payload — simpler than the flat layout
/// the top-level comment uses, since history entries don't share the
/// comment's flat line fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "anchor_kind", content = "anchor_data", rename_all = "snake_case")]
pub(super) enum AnchorRepr {
    Line(LineAnchorPayload),
    File,
    ImageRect(ImageRectAnchor),
    CsvCell(CsvCellAnchor),
    JsonPath(JsonPathAnchor),
    HtmlRange(HtmlRangeAnchor),
    HtmlElement(HtmlElementAnchor),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub(super) struct LineAnchorPayload {
    pub line: u32,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub end_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub start_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub end_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub selected_text_hash: Option<String>,
}

impl From<Anchor> for AnchorRepr {
    fn from(a: Anchor) -> Self {
        match a {
            Anchor::Line {
                line,
                end_line,
                start_column,
                end_column,
                selected_text,
                selected_text_hash,
            } => AnchorRepr::Line(LineAnchorPayload {
                line,
                end_line,
                start_column,
                end_column,
                selected_text,
                selected_text_hash,
            }),
            Anchor::File => AnchorRepr::File,
            Anchor::ImageRect(p) => AnchorRepr::ImageRect(p),
            Anchor::CsvCell(p) => AnchorRepr::CsvCell(p),
            Anchor::JsonPath(p) => AnchorRepr::JsonPath(p),
            Anchor::HtmlRange(p) => AnchorRepr::HtmlRange(p),
            Anchor::HtmlElement(p) => AnchorRepr::HtmlElement(p),
        }
    }
}

impl From<AnchorRepr> for Anchor {
    fn from(r: AnchorRepr) -> Self {
        match r {
            AnchorRepr::Line(p) => Anchor::Line {
                line: p.line,
                end_line: p.end_line,
                start_column: p.start_column,
                end_column: p.end_column,
                selected_text: p.selected_text,
                selected_text_hash: p.selected_text_hash,
            },
            AnchorRepr::File => Anchor::File,
            AnchorRepr::ImageRect(p) => Anchor::ImageRect(p),
            AnchorRepr::CsvCell(p) => Anchor::CsvCell(p),
            AnchorRepr::JsonPath(p) => Anchor::JsonPath(p),
            AnchorRepr::HtmlRange(p) => Anchor::HtmlRange(p),
            AnchorRepr::HtmlElement(p) => Anchor::HtmlElement(p),
        }
    }
}

/// Deserialise: pick the Anchor variant from the wire repr. Validates that
/// the discriminator and payload match. Returns a typed serde error on
/// mismatch so `serde_json::from_str` propagates it as a parse failure.
impl TryFrom<&MrsfCommentRepr> for Anchor {
    type Error = String;

    fn try_from(r: &MrsfCommentRepr) -> Result<Self, Self::Error> {
        // Helper: count how many payload sibling fields are populated.
        let payload_count = [
            r.image_rect.is_some(),
            r.csv_cell.is_some(),
            r.json_path.is_some(),
            r.html_range.is_some(),
            r.html_element.is_some(),
        ]
        .iter()
        .filter(|x| **x)
        .count();

        match r.anchor_kind.as_deref() {
            // No discriminator → legacy v1.0 line anchor (bytes unchanged).
            // Stray payload siblings without a matching discriminator are
            // a schema violation.
            None => {
                if payload_count > 0 {
                    return Err("anchor_kind/payload mismatch: payload \
                        present without anchor_kind"
                        .into());
                }
                Ok(Anchor::Line {
                    line: r.line.unwrap_or(0),
                    end_line: r.end_line,
                    start_column: r.start_column,
                    end_column: r.end_column,
                    selected_text: r.selected_text.clone(),
                    selected_text_hash: r.selected_text_hash.clone(),
                })
            }
            Some("line") => {
                if payload_count > 0 {
                    return Err("anchor_kind/payload mismatch: \
                        anchor_kind=line with payload sibling"
                        .into());
                }
                Ok(Anchor::Line {
                    line: r.line.unwrap_or(0),
                    end_line: r.end_line,
                    start_column: r.start_column,
                    end_column: r.end_column,
                    selected_text: r.selected_text.clone(),
                    selected_text_hash: r.selected_text_hash.clone(),
                })
            }
            Some("file") => {
                if payload_count > 0 {
                    return Err("anchor_kind/payload mismatch: \
                        anchor_kind=file with payload sibling"
                        .into());
                }
                Ok(Anchor::File)
            }
            Some("image_rect") => r
                .image_rect
                .clone()
                .map(Anchor::ImageRect)
                .ok_or_else(|| {
                    "anchor_kind/payload mismatch: anchor_kind=image_rect \
                     but image_rect field missing"
                        .into()
                }),
            Some("csv_cell") => r.csv_cell.clone().map(Anchor::CsvCell).ok_or_else(|| {
                "anchor_kind/payload mismatch: anchor_kind=csv_cell but \
                 csv_cell field missing"
                    .into()
            }),
            Some("json_path") => r.json_path.clone().map(Anchor::JsonPath).ok_or_else(|| {
                "anchor_kind/payload mismatch: anchor_kind=json_path but \
                 json_path field missing"
                    .into()
            }),
            Some("html_range") => r
                .html_range
                .clone()
                .map(Anchor::HtmlRange)
                .ok_or_else(|| {
                    "anchor_kind/payload mismatch: anchor_kind=html_range \
                     but html_range field missing"
                        .into()
                }),
            Some("html_element") => r
                .html_element
                .clone()
                .map(Anchor::HtmlElement)
                .ok_or_else(|| {
                    "anchor_kind/payload mismatch: anchor_kind=html_element \
                     but html_element field missing"
                        .into()
                }),
            Some(other) => Err(format!(
                "anchor_kind/payload mismatch: unknown anchor_kind `{other}`"
            )),
        }
    }
}

impl TryFrom<MrsfCommentRepr> for MrsfComment {
    type Error = String;

    fn try_from(r: MrsfCommentRepr) -> Result<Self, Self::Error> {
        let anchor: Anchor = (&r).try_into()?;
        Ok(MrsfComment {
            id: r.id,
            author: r.author,
            timestamp: r.timestamp,
            text: r.text,
            resolved: r.resolved,
            line: r.line,
            end_line: r.end_line,
            start_column: r.start_column,
            end_column: r.end_column,
            selected_text: r.selected_text,
            anchored_text: r.anchored_text,
            selected_text_hash: r.selected_text_hash,
            commit: r.commit,
            comment_type: r.comment_type,
            severity: r.severity,
            reply_to: r.reply_to,
            anchor,
            anchor_history: r
                .anchor_history
                .map(|v| v.into_iter().map(Into::into).collect()),
            reactions: r.reactions,
        })
    }
}

impl From<MrsfComment> for MrsfCommentRepr {
    fn from(c: MrsfComment) -> Self {
        // Decide wire shape from the anchor variant.
        let has_v1_1_markers = c.anchor_history.as_ref().is_some_and(|h| !h.is_empty())
            || c.reactions.is_some();

        // For `Anchor::Line` we authoritatively use the flat in-memory
        // fields (`c.line`, `c.end_line`, …) — this preserves caller
        // mutations to those fields and keeps backwards-compatibility with
        // iter-1 construction patterns. For every other variant the flat
        // line fields are dropped from the wire form (the variant payload
        // is the only source of truth).
        let (
            anchor_kind,
            line,
            end_line,
            start_column,
            end_column,
            selected_text,
            selected_text_hash,
            image_rect,
            csv_cell,
            json_path,
            html_range,
            html_element,
        ) = match c.anchor {
            Anchor::Line { .. } => {
                // v1.0 byte-identity path: omit `anchor_kind` entirely when
                // no v1.1 markers are present.
                let kind = if has_v1_1_markers {
                    Some("line".to_string())
                } else {
                    None
                };
                (
                    kind,
                    c.line,
                    c.end_line,
                    c.start_column,
                    c.end_column,
                    c.selected_text.clone(),
                    c.selected_text_hash.clone(),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
            }
            Anchor::File => (
                Some("file".into()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
            Anchor::ImageRect(p) => (
                Some("image_rect".into()),
                None,
                None,
                None,
                None,
                None,
                None,
                Some(p),
                None,
                None,
                None,
                None,
            ),
            Anchor::CsvCell(p) => (
                Some("csv_cell".into()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(p),
                None,
                None,
                None,
            ),
            Anchor::JsonPath(p) => (
                Some("json_path".into()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(p),
                None,
                None,
            ),
            Anchor::HtmlRange(p) => (
                Some("html_range".into()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(p),
                None,
            ),
            Anchor::HtmlElement(p) => (
                Some("html_element".into()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(p),
            ),
        };

        MrsfCommentRepr {
            id: c.id,
            author: c.author,
            timestamp: c.timestamp,
            text: c.text,
            resolved: c.resolved,
            line,
            end_line,
            start_column,
            end_column,
            selected_text,
            anchored_text: c.anchored_text,
            selected_text_hash,
            commit: c.commit,
            comment_type: c.comment_type,
            severity: c.severity,
            reply_to: c.reply_to,
            anchor_kind,
            image_rect,
            csv_cell,
            json_path,
            html_range,
            html_element,
            anchor_history: c
                .anchor_history
                .map(|v| v.into_iter().map(Into::into).collect()),
            reactions: c.reactions,
        }
    }
}

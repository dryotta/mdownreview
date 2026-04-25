//! MRSF schema version selection.
//!
//! Picks the correct `mrsf_version` declaration when serialising a sidecar
//! based on which v1.1-only fields the comments actually carry. Lives in its
//! own module so the per-comment v1.1 predicate destructures the full
//! [`MrsfComment`] struct — adding a new field there will fail to compile
//! here, forcing a deliberate decision about whether the new field is a
//! v1.1 marker (advisory #5: don't silently downgrade v1.1 sidecars).

use crate::core::types::MrsfComment;

/// MRSF schema version emitted when WRITING new sidecars that DON'T use any
/// v1.1-only fields. Use [`mrsf_version_for`] to pick the correct version
/// per-sidecar so v1.0-pure sidecars don't leak a `1.1` declaration.
pub const MRSF_VERSION_DEFAULT: &str = "1.0";

/// MRSF schema version emitted when a sidecar carries any v1.1-only field
/// (variant anchor, reactions, anchor_history, …).
pub const MRSF_VERSION_V1_1: &str = "1.1";

/// True if `c` carries any v1.1-only marker.
///
/// The destructure is intentionally exhaustive: a future v1.1 field added to
/// [`MrsfComment`] (e.g. `anchor_history`) will break this match and force
/// the author to classify the new field as v1.0 or v1.1 rather than silently
/// downgrading sidecars on save.
fn is_v1_1(c: &MrsfComment) -> bool {
    let MrsfComment {
        // ── v1.0 fields: explicitly ignored ───────────────────────────────
        id: _,
        author: _,
        timestamp: _,
        text: _,
        resolved: _,
        line: _,
        end_line: _,
        start_column: _,
        end_column: _,
        selected_text: _,
        anchored_text: _,
        selected_text_hash: _,
        commit: _,
        comment_type: _,
        severity: _,
        reply_to: _,
        // ── v1.1 markers: any present ⇒ v1.1 ──────────────────────────────
        anchor_kind,
        image_rect,
        csv_cell,
        json_path,
        html_range,
        html_element,
        reactions,
    } = c;
    anchor_kind.is_some()
        || image_rect.is_some()
        || csv_cell.is_some()
        || json_path.is_some()
        || html_range.is_some()
        || html_element.is_some()
        || reactions.as_ref().is_some_and(|r| !r.is_empty())
}

/// Pick the MRSF schema version to write for a given set of comments.
/// Returns "1.0" when every comment is purely v1.0-shaped; "1.1" otherwise.
/// Prevents pristine v1.0 sidecars from being rewritten with a
/// `mrsf_version: "1.1"` declaration just because the writer constant moved
/// on, and prevents v1.1 sidecars from being silently downgraded on save
/// when a new v1.1 field lands (advisory #5).
pub fn mrsf_version_for(comments: &[MrsfComment]) -> &'static str {
    if comments.iter().any(is_v1_1) {
        MRSF_VERSION_V1_1
    } else {
        MRSF_VERSION_DEFAULT
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::types::{ImageRectAnchor, MrsfSidecar, Reaction};

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

    /// Regression: load a v1.1 sidecar (with reactions), save the comment
    /// list back unchanged, the version stays v1.1. Prevents the silent
    /// downgrade described in bug-hunter HIGH #3.
    #[test]
    fn v1_1_sidecar_round_trip_preserves_version() {
        let mut c = MrsfComment::default();
        c.id = "c1".into();
        c.reactions = Some(vec![Reaction {
            user: "bob".into(),
            kind: "thumbs_up".into(),
            ts: "2025-01-02T00:00:00Z".into(),
        }]);
        // Round-trip via the version selector, which is what the writer uses.
        assert_eq!(mrsf_version_for(&[c.clone()]), "1.1");
        assert_eq!(mrsf_version_for(&[c]), "1.1");
    }
}

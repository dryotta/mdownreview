//! Round-trip and schema-discriminator tests for [`super::MrsfComment`] and
//! [`super::Anchor`]. Extracted from `mod.rs` to keep that file under the
//! 400-LOC budget (rule 23 in `docs/architecture.md`).

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

/// B7: per-variant declared-kind-but-wrong-payload (missing matching payload)
/// — every typed variant must reject its discriminator without payload.
#[test]
fn discriminator_missing_payload_rejected_for_all_typed_variants() {
    for kind in ["image_rect", "csv_cell", "json_path", "html_range", "html_element"] {
        let body = format!(
            r#"{{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"{kind}"}}"#
        );
        let res: Result<MrsfSidecar, _> = serde_json::from_str(&wrap_comment(&body));
        assert!(res.is_err(), "kind={kind} should reject without payload");
    }
}

/// B7 inverse: payload sibling present without `anchor_kind` declaration is
/// rejected (closes the silently-ignored-payload class).
#[test]
fn payload_present_without_anchor_kind_rejected() {
    let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"image_rect":{"x_pct":1.0,"y_pct":2.0}}"#;
    let res: Result<MrsfSidecar, _> = serde_json::from_str(&wrap_comment(body));
    assert!(res.is_err(), "payload without anchor_kind must be rejected");
}

/// B9: declared `anchor_kind` with a stray sibling payload (mixed payloads)
/// is rejected, even when the matching payload is also present.
#[test]
fn mixed_payloads_with_typed_anchor_kind_rejected() {
    let body = r#"{"id":"c1","author":"a","timestamp":"t","text":"x","resolved":false,"anchor_kind":"image_rect","image_rect":{"x_pct":1.0,"y_pct":2.0},"csv_cell":{"row_idx":0,"col_idx":0,"col_header":"h"}}"#;
    let res: Result<MrsfSidecar, _> = serde_json::from_str(&wrap_comment(body));
    assert!(
        res.is_err(),
        "stray sibling payload alongside declared kind must be rejected"
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

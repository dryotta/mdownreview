use crate::core::types::MrsfComment;

/// Filter to only unresolved comments.
pub fn filter_unresolved(comments: &[MrsfComment]) -> Vec<&MrsfComment> {
    comments.iter().filter(|c| !c.resolved).collect()
}

/// Derive the source filename from a sidecar path.
/// Strips .review.yaml or .review.json suffix.
pub fn source_file_for(review_path: &str) -> String {
    if let Some(stripped) = review_path.strip_suffix(".review.yaml") {
        return std::path::Path::new(stripped)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| stripped.to_string());
    }
    if let Some(stripped) = review_path.strip_suffix(".review.json") {
        return std::path::Path::new(stripped)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| stripped.to_string());
    }
    review_path.to_string()
}

/// Return current UTC time as ISO-8601 string with Z suffix.
pub fn iso_now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::types::MrsfComment;

    fn make_comment(id: &str, resolved: bool) -> MrsfComment {
        MrsfComment {
            id: id.to_string(),
            author: "test".to_string(),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            text: "text".to_string(),
            resolved,
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
        }
    }

    #[test]
    fn filter_unresolved_works() {
        let comments = vec![
            make_comment("c1", false),
            make_comment("c2", true),
            make_comment("c3", false),
        ];
        let unresolved = filter_unresolved(&comments);
        assert_eq!(unresolved.len(), 2);
        assert_eq!(unresolved[0].id, "c1");
        assert_eq!(unresolved[1].id, "c3");
    }

    #[test]
    fn filter_unresolved_empty() {
        let comments: Vec<MrsfComment> = vec![];
        let unresolved = filter_unresolved(&comments);
        assert!(unresolved.is_empty());
    }

    #[test]
    fn source_file_for_yaml() {
        assert_eq!(
            source_file_for("/path/to/file.md.review.yaml"),
            "file.md"
        );
    }

    #[test]
    fn source_file_for_json() {
        assert_eq!(
            source_file_for("/path/to/file.md.review.json"),
            "file.md"
        );
    }

    #[test]
    fn source_file_for_no_suffix() {
        assert_eq!(source_file_for("some_file"), "some_file");
    }

    #[test]
    fn iso_now_format() {
        let now = iso_now();
        assert!(now.ends_with('Z'));
        assert!(now.contains('T'));
        assert!(now.len() >= 20);
    }
}

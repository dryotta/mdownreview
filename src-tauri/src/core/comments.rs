use crate::core::types::{CommentAnchor, MrsfComment};

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

/// Generate a new UUIDv4 comment ID.
pub fn generate_comment_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Create a new comment with generated ID and current timestamp.
pub fn create_comment(
    author: &str,
    text: &str,
    anchor: Option<CommentAnchor>,
    comment_type: Option<&str>,
    severity: Option<&str>,
) -> MrsfComment {
    let anchor = anchor.unwrap_or(CommentAnchor {
        line: 1,
        end_line: None,
        start_column: None,
        end_column: None,
        selected_text: None,
        selected_text_hash: None,
    });
    MrsfComment {
        id: generate_comment_id(),
        author: if author.is_empty() { "Anonymous".to_string() } else { author.to_string() },
        timestamp: iso_now(),
        text: text.to_string(),
        resolved: false,
        line: Some(anchor.line),
        end_line: anchor.end_line,
        start_column: anchor.start_column,
        end_column: anchor.end_column,
        selected_text: anchor.selected_text,
        anchored_text: None,
        selected_text_hash: anchor.selected_text_hash,
        commit: None,
        comment_type: comment_type.map(|s| s.to_string()),
        severity: severity.map(|s| s.to_string()),
        reply_to: None,
    }
}

/// Create a reply to an existing comment.
pub fn create_reply(
    author: &str,
    text: &str,
    parent: &MrsfComment,
) -> MrsfComment {
    MrsfComment {
        id: generate_comment_id(),
        author: if author.is_empty() { "Anonymous".to_string() } else { author.to_string() },
        timestamp: iso_now(),
        text: text.to_string(),
        resolved: false,
        line: parent.line,
        end_line: None,
        start_column: None,
        end_column: None,
        selected_text: None,
        anchored_text: None,
        selected_text_hash: None,
        commit: None,
        comment_type: None,
        severity: None,
        reply_to: Some(parent.id.clone()),
    }
}

/// Delete a comment from a list, promoting its direct replies per MRSF §9.1.
/// Returns the modified comment list without the deleted comment.
pub fn delete_comment(comments: &[MrsfComment], id: &str) -> Vec<MrsfComment> {
    let parent = match comments.iter().find(|c| c.id == id) {
        Some(p) => p.clone(),
        None => return comments.to_vec(),
    };

    comments
        .iter()
        .filter(|c| c.id != id)
        .map(|c| {
            if c.reply_to.as_deref() != Some(id) {
                return c.clone();
            }
            let mut updated = c.clone();
            // Inherit targeting fields from parent if reply omits them
            if updated.line.is_none() && parent.line.is_some() {
                updated.line = parent.line;
            }
            if updated.end_line.is_none() && parent.end_line.is_some() {
                updated.end_line = parent.end_line;
            }
            if updated.start_column.is_none() && parent.start_column.is_some() {
                updated.start_column = parent.start_column;
            }
            if updated.end_column.is_none() && parent.end_column.is_some() {
                updated.end_column = parent.end_column;
            }
            if updated.selected_text.is_none() && parent.selected_text.is_some() {
                updated.selected_text = parent.selected_text.clone();
                if parent.selected_text_hash.is_some() {
                    updated.selected_text_hash = parent.selected_text_hash.clone();
                }
            }
            // Reparent to grandparent (or remove reply_to if parent was root)
            updated.reply_to = parent.reply_to.clone();
            updated
        })
        .collect()
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

    fn make_comment_with_line(id: &str, line: u32, reply_to: Option<&str>) -> MrsfComment {
        MrsfComment {
            id: id.to_string(),
            author: "test".to_string(),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            text: format!("Comment {}", id),
            resolved: false,
            line: Some(line),
            end_line: Some(line),
            start_column: Some(0),
            end_column: Some(10),
            selected_text: Some("selected".to_string()),
            anchored_text: None,
            selected_text_hash: Some("hash123".to_string()),
            commit: None,
            comment_type: None,
            severity: None,
            reply_to: reply_to.map(|s| s.to_string()),
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

    #[test]
    fn generate_comment_id_is_uuid() {
        let id = generate_comment_id();
        assert_eq!(id.len(), 36); // UUID format: 8-4-4-4-12
        assert_eq!(id.chars().filter(|c| *c == '-').count(), 4);
    }

    #[test]
    fn generate_comment_id_unique() {
        let id1 = generate_comment_id();
        let id2 = generate_comment_id();
        assert_ne!(id1, id2);
    }

    #[test]
    fn create_comment_basic() {
        let c = create_comment("Alice", "Hello", None, None, None);
        assert_eq!(c.author, "Alice");
        assert_eq!(c.text, "Hello");
        assert!(!c.resolved);
        assert!(c.reply_to.is_none());
        assert!(c.timestamp.contains('T'));
    }

    #[test]
    fn create_comment_empty_author_becomes_anonymous() {
        let c = create_comment("", "text", None, None, None);
        assert_eq!(c.author, "Anonymous");
    }

    #[test]
    fn create_comment_with_anchor() {
        let anchor = CommentAnchor {
            line: 10,
            end_line: Some(12),
            start_column: Some(5),
            end_column: Some(20),
            selected_text: Some("hello".to_string()),
            selected_text_hash: Some("abc".to_string()),
        };
        let c = create_comment("Bob", "Note", Some(anchor), Some("suggestion"), Some("high"));
        assert_eq!(c.line, Some(10));
        assert_eq!(c.end_line, Some(12));
        assert_eq!(c.selected_text, Some("hello".to_string()));
        assert_eq!(c.comment_type, Some("suggestion".to_string()));
        assert_eq!(c.severity, Some("high".to_string()));
    }

    #[test]
    fn create_reply_basic() {
        let parent = make_comment_with_line("p1", 5, None);
        let reply = create_reply("Alice", "Reply text", &parent);
        assert_eq!(reply.reply_to, Some("p1".to_string()));
        assert_eq!(reply.line, Some(5)); // Inherits parent line
        assert_eq!(reply.text, "Reply text");
    }

    #[test]
    fn delete_comment_reparents_replies() {
        let parent = make_comment_with_line("p1", 5, None);
        let reply = MrsfComment {
            id: "r1".to_string(),
            reply_to: Some("p1".to_string()),
            line: None,
            end_line: None,
            start_column: None,
            end_column: None,
            selected_text: None,
            selected_text_hash: None,
            ..make_comment("r1", false)
        };
        let comments = vec![parent, reply];
        let result = delete_comment(&comments, "p1");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "r1");
        // Reply inherited parent's targeting fields
        assert_eq!(result[0].line, Some(5));
        assert_eq!(result[0].end_line, Some(5));
        assert_eq!(result[0].selected_text, Some("selected".to_string()));
        assert_eq!(result[0].selected_text_hash, Some("hash123".to_string()));
        // Reparented to root (parent had no reply_to)
        assert!(result[0].reply_to.is_none());
    }

    #[test]
    fn delete_comment_reparents_to_grandparent() {
        let grandparent = make_comment_with_line("gp", 1, None);
        let parent = make_comment_with_line("p1", 5, Some("gp"));
        let child = MrsfComment {
            id: "c1".to_string(),
            reply_to: Some("p1".to_string()),
            line: None,
            end_line: None,
            start_column: None,
            end_column: None,
            selected_text: None,
            selected_text_hash: None,
            ..make_comment("c1", false)
        };
        let comments = vec![grandparent, parent, child];
        let result = delete_comment(&comments, "p1");
        assert_eq!(result.len(), 2);
        let child_result = result.iter().find(|c| c.id == "c1").unwrap();
        assert_eq!(child_result.reply_to, Some("gp".to_string()));
    }

    #[test]
    fn delete_leaf_no_reparenting() {
        let parent = make_comment_with_line("p1", 5, None);
        let leaf = make_comment_with_line("leaf", 10, Some("p1"));
        let comments = vec![parent.clone(), leaf];
        let result = delete_comment(&comments, "leaf");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "p1");
    }

    #[test]
    fn delete_nonexistent_returns_unchanged() {
        let comments = vec![make_comment("c1", false)];
        let result = delete_comment(&comments, "nonexistent");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "c1");
    }
}

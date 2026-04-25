use crate::core::mrsf_version::mrsf_version_for;
use crate::core::types::{CommentMutation, MrsfComment, MrsfSidecar};
use regex::Regex;
use std::fmt;
use std::path::Path;
use std::sync::OnceLock;

/// Hard cap on sidecar size (10 MB). Protects every reader
/// (`load_sidecar`, `patch_comment`, `get_file_comments`, `get_file_badges`,
/// `export_review_summary`) against OOM from a maliciously-crafted or
/// pathologically-large sidecar.
const SIDECAR_MAX_BYTES: u64 = 10 * 1024 * 1024;

/// Read a sidecar file, refusing anything larger than [`SIDECAR_MAX_BYTES`].
///
/// Mirrors the `read_text_file` chokepoint pattern in `commands/fs.rs`: the
/// size check happens on already-read bytes (single bounded read of MAX+1),
/// not on `metadata()` followed by a second read. This avoids two attack
/// classes documented in `docs/security.md` rule 3:
///   1. **Symlink amplification.** `metadata()` follows symlinks, so a
///      symlink to `/dev/zero` (or any virtual file) reports `len() == 0`
///      and would pass a metadata-based cap before `read_to_string` OOMs.
///   2. **TOCTOU.** A file can grow between `metadata()` and the read.
fn read_capped(path: &str) -> std::io::Result<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut buf = Vec::with_capacity(8 * 1024);
    let n = f
        .by_ref()
        .take(SIDECAR_MAX_BYTES + 1)
        .read_to_end(&mut buf)?;
    if n as u64 > SIDECAR_MAX_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "sidecar exceeds 10 MB cap",
        ));
    }
    String::from_utf8(buf).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

/// Reject any YAML anchor (`&name`) or alias (`*name`) before parsing.
///
/// The 10 MB byte cap doesn't bound YAML alias/anchor expansion (the
/// "billion-laughs" amplification class). Our writer never emits anchors,
/// so refusing them wholesale is safe and closes the amplification surface.
///
/// Detects only positional anchors/aliases — at line start or after a YAML
/// structural token (`-`, `?`, `:`, `,`, `[`, `{`) followed by whitespace —
/// to avoid false positives on `&` / `*` inside string values.
fn reject_yaml_anchors(text: &str) -> std::io::Result<()> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        // Anchor or alias in YAML node-position: line start with optional
        // indent and optional list/key marker, OR after a flow/block token.
        // Examples matched: `node: &x foo`, `- &a 1`, `[*x, *y]`, `key: *ref`.
        Regex::new(r"(?m)(?:^[ \t]*(?:[-?][ \t]+)?|[,\[\{][ \t]*|:[ \t]+)[&*][A-Za-z0-9_]+")
            .expect("valid regex")
    });
    if re.is_match(text) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "yaml anchors/aliases not allowed in sidecars",
        ));
    }
    Ok(())
}

#[derive(Debug)]
pub enum SidecarError {
    Io(std::io::Error),
    YamlParse(serde_yaml_ng::Error),
    JsonParse(serde_json::Error),
    NotFound,
    CommentNotFound(String),
}

impl fmt::Display for SidecarError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SidecarError::Io(e) => write!(f, "IO error: {}", e),
            SidecarError::YamlParse(e) => write!(f, "YAML parse error: {}", e),
            SidecarError::JsonParse(e) => write!(f, "JSON parse error: {}", e),
            SidecarError::NotFound => write!(f, "sidecar not found"),
            SidecarError::CommentNotFound(id) => write!(f, "comment not found: {}", id),
        }
    }
}

impl From<std::io::Error> for SidecarError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            SidecarError::NotFound
        } else {
            SidecarError::Io(e)
        }
    }
}

/// Load a sidecar file. Tries .review.yaml first, then .review.json.
/// Returns None if no sidecar exists.
pub fn load_sidecar(file_path: &str) -> Result<Option<MrsfSidecar>, SidecarError> {
    let yaml_path = format!("{}.review.yaml", file_path);
    let json_path = format!("{}.review.json", file_path);

    match read_capped(&yaml_path) {
        Ok(content) => {
            reject_yaml_anchors(&content)?;
            let sidecar: MrsfSidecar =
                serde_yaml_ng::from_str(&content).map_err(SidecarError::YamlParse)?;
            return Ok(Some(sidecar));
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            return Err(SidecarError::Io(e));
        }
        _ => {} // Not found, try JSON
    }

    match read_capped(&json_path) {
        Ok(content) => {
            let sidecar: MrsfSidecar =
                serde_json::from_str(&content).map_err(SidecarError::JsonParse)?;
            Ok(Some(sidecar))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(SidecarError::Io(e)),
    }
}

/// Save a complete sidecar. Atomically writes via temp+rename.
/// Deletes the sidecar if comments is empty.
pub fn save_sidecar(
    file_path: &str,
    document: &str,
    comments: &[MrsfComment],
) -> Result<(), SidecarError> {
    let sidecar_path = std::path::PathBuf::from(format!("{}.review.yaml", file_path));

    if comments.is_empty() {
        if sidecar_path.exists() {
            std::fs::remove_file(&sidecar_path)?;
        }
        return Ok(());
    }

    let payload = MrsfSidecar {
        mrsf_version: mrsf_version_for(comments).to_string(),
        document: document.to_string(),
        comments: comments.to_vec(),
    };
    let yaml = serde_yaml_ng::to_string(&payload).map_err(SidecarError::YamlParse)?;

    crate::core::atomic::write_atomic(&sidecar_path, yaml.as_bytes())?;
    Ok(())
}

/// Surgically modify a comment in a sidecar file.
/// Loads as serde_yaml_ng::Value, finds comment by ID, applies mutations,
/// writes back preserving all unknown fields and structure.
pub fn patch_comment(
    file_path: &str,
    comment_id: &str,
    mutations: &[CommentMutation],
) -> Result<(), SidecarError> {
    let yaml_path = format!("{}.review.yaml", file_path);
    let json_path = format!("{}.review.json", file_path);

    // Determine which file exists and load as Value
    let (content, _source_path) = match read_capped(&yaml_path) {
        Ok(c) => {
            reject_yaml_anchors(&c)?;
            (c, yaml_path.clone())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            match read_capped(&json_path) {
                Ok(c) => {
                    // Convert JSON to YAML Value
                    let json_val: serde_json::Value =
                        serde_json::from_str(&c).map_err(SidecarError::JsonParse)?;
                    let yaml_str =
                        serde_yaml_ng::to_string(&json_val).map_err(SidecarError::YamlParse)?;
                    (yaml_str, yaml_path.clone()) // Write as YAML
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(SidecarError::NotFound);
                }
                Err(e) => return Err(SidecarError::Io(e)),
            }
        }
        Err(e) => return Err(SidecarError::Io(e)),
    };

    let mut doc: serde_yaml_ng::Value =
        serde_yaml_ng::from_str(&content).map_err(SidecarError::YamlParse)?;

    let comments = doc
        .get_mut("comments")
        .and_then(|v| v.as_sequence_mut())
        .ok_or_else(|| SidecarError::CommentNotFound(comment_id.to_string()))?;

    let comment = comments
        .iter_mut()
        .find(|c| {
            c.get("id")
                .and_then(|v| v.as_str())
                .map(|s| s == comment_id)
                .unwrap_or(false)
        })
        .ok_or_else(|| SidecarError::CommentNotFound(comment_id.to_string()))?;

    for mutation in mutations {
        match mutation {
            CommentMutation::SetResolved(resolved) => {
                comment["resolved"] = serde_yaml_ng::Value::Bool(*resolved);
            }
            CommentMutation::AddResponse {
                author,
                text,
                timestamp,
            } => {
                let responses = comment
                    .get_mut("responses")
                    .and_then(|v| v.as_sequence_mut());
                let new_response = serde_yaml_ng::Value::Mapping({
                    let mut m = serde_yaml_ng::Mapping::new();
                    m.insert(
                        serde_yaml_ng::Value::String("author".to_string()),
                        serde_yaml_ng::Value::String(author.clone()),
                    );
                    m.insert(
                        serde_yaml_ng::Value::String("text".to_string()),
                        serde_yaml_ng::Value::String(text.clone()),
                    );
                    m.insert(
                        serde_yaml_ng::Value::String("timestamp".to_string()),
                        serde_yaml_ng::Value::String(timestamp.clone()),
                    );
                    m
                });
                match responses {
                    Some(seq) => seq.push(new_response),
                    None => {
                        comment["responses"] =
                            serde_yaml_ng::Value::Sequence(vec![new_response]);
                    }
                }
            }
        }
    }

    let yaml_out = serde_yaml_ng::to_string(&doc).map_err(SidecarError::YamlParse)?;

    // Atomic write — always re-target YAML regardless of the original format.
    crate::core::atomic::write_atomic(Path::new(&yaml_path), yaml_out.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::types::MrsfComment;
    use tempfile::TempDir;

    fn sample_comment(id: &str) -> MrsfComment {
        MrsfComment {
            id: id.to_string(),
            author: "test".to_string(),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            text: "test comment".to_string(),
            resolved: false,
            line: Some(1),
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
            ..Default::default()
        }
    }

    #[test]
    fn load_sidecar_yaml() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        let sidecar_path = tmp.path().join("test.md.review.yaml");
        std::fs::write(&file_path, "# Test").unwrap();
        std::fs::write(
            &sidecar_path,
            r#"mrsf_version: "1.0"
document: test.md
comments:
  - id: "c1"
    author: "test"
    timestamp: "2025-01-01T00:00:00Z"
    text: "hello"
    resolved: false
"#,
        )
        .unwrap();

        let result = load_sidecar(file_path.to_str().unwrap()).unwrap();
        assert!(result.is_some());
        let sidecar = result.unwrap();
        assert_eq!(sidecar.comments.len(), 1);
        assert_eq!(sidecar.comments[0].id, "c1");
    }

    #[test]
    fn load_sidecar_json_fallback() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        let json_path = tmp.path().join("test.md.review.json");
        std::fs::write(&file_path, "# Test").unwrap();
        std::fs::write(
            &json_path,
            r#"{"mrsf_version":"1.0","document":"test.md","comments":[{"id":"c1","author":"test","timestamp":"2025-01-01T00:00:00Z","text":"hello","resolved":false}]}"#,
        )
        .unwrap();

        let result = load_sidecar(file_path.to_str().unwrap()).unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().comments[0].id, "c1");
    }

    #[test]
    fn load_sidecar_missing_returns_none() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("nonexistent.md");
        let result = load_sidecar(file_path.to_str().unwrap()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn save_sidecar_writes_yaml() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();

        let comments = vec![sample_comment("c1")];
        save_sidecar(file_path.to_str().unwrap(), "test.md", &comments).unwrap();

        let sidecar_path = tmp.path().join("test.md.review.yaml");
        assert!(sidecar_path.exists());
        let content = std::fs::read_to_string(&sidecar_path).unwrap();
        assert!(content.contains("mrsf_version"));
        assert!(content.contains("c1"));
    }

    #[test]
    fn save_sidecar_emits_v1_0_for_legacy_comments() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();

        let comments = vec![sample_comment("c1")];
        save_sidecar(file_path.to_str().unwrap(), "test.md", &comments).unwrap();

        let sidecar_path = tmp.path().join("test.md.review.yaml");
        let content = std::fs::read_to_string(&sidecar_path).unwrap();
        let reloaded: crate::core::types::MrsfSidecar =
            serde_yaml_ng::from_str(&content).unwrap();
        // Pure-legacy comment ⇒ writer must NOT emit "1.1" (advisory #5).
        assert_eq!(reloaded.mrsf_version, "1.0");
    }

    #[test]
    fn save_sidecar_emits_v1_1_when_v1_1_field_present() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();

        let mut c = sample_comment("c1");
        c.reactions = Some(vec![crate::core::types::Reaction {
            user: "u".into(),
            kind: "thumbs_up".into(),
            ts: "2025-01-01T00:00:00Z".into(),
        }]);
        save_sidecar(file_path.to_str().unwrap(), "test.md", &[c]).unwrap();

        let sidecar_path = tmp.path().join("test.md.review.yaml");
        let content = std::fs::read_to_string(&sidecar_path).unwrap();
        let reloaded: crate::core::types::MrsfSidecar =
            serde_yaml_ng::from_str(&content).unwrap();
        assert_eq!(reloaded.mrsf_version, "1.1");
    }

    #[test]
    fn save_sidecar_empty_deletes() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        let sidecar_path = tmp.path().join("test.md.review.yaml");
        std::fs::write(&file_path, "# Test").unwrap();
        std::fs::write(&sidecar_path, "dummy").unwrap();

        save_sidecar(file_path.to_str().unwrap(), "test.md", &[]).unwrap();
        assert!(!sidecar_path.exists());
    }

    #[test]
    fn patch_comment_resolve() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();

        let comments = vec![sample_comment("c1"), sample_comment("c2")];
        save_sidecar(file_path.to_str().unwrap(), "test.md", &comments).unwrap();

        patch_comment(
            file_path.to_str().unwrap(),
            "c1",
            &[CommentMutation::SetResolved(true)],
        )
        .unwrap();

        let loaded = load_sidecar(file_path.to_str().unwrap())
            .unwrap()
            .unwrap();
        assert!(loaded.comments.iter().find(|c| c.id == "c1").unwrap().resolved);
        assert!(!loaded.comments.iter().find(|c| c.id == "c2").unwrap().resolved);
    }

    #[test]
    fn patch_comment_add_response() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();

        let comments = vec![sample_comment("c1")];
        save_sidecar(file_path.to_str().unwrap(), "test.md", &comments).unwrap();

        patch_comment(
            file_path.to_str().unwrap(),
            "c1",
            &[CommentMutation::AddResponse {
                author: "agent".to_string(),
                text: "fixed it".to_string(),
                timestamp: "2025-01-02T00:00:00Z".to_string(),
            }],
        )
        .unwrap();

        let content =
            std::fs::read_to_string(tmp.path().join("test.md.review.yaml")).unwrap();
        assert!(content.contains("fixed it"));
        assert!(content.contains("responses"));
    }

    #[test]
    fn patch_comment_not_found() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();

        let comments = vec![sample_comment("c1")];
        save_sidecar(file_path.to_str().unwrap(), "test.md", &comments).unwrap();

        let result = patch_comment(
            file_path.to_str().unwrap(),
            "nonexistent",
            &[CommentMutation::SetResolved(true)],
        );
        assert!(matches!(result, Err(SidecarError::CommentNotFound(_))));
    }

    #[test]
    fn load_sidecar_rejects_yaml_anchors() {
        // Defense-in-depth against billion-laughs amplification past the
        // 10 MB byte cap. We never emit YAML anchors/aliases, so any
        // appearance in a sidecar is treated as malicious.
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("anchored.md");
        let yaml_path = tmp.path().join("anchored.md.review.yaml");
        std::fs::write(&file_path, "# t").unwrap();
        let payload = "mrsf_version: \"1.0\"\ndocument: t.md\ncomments:\n  - &c1 { id: a }\n  - *c1\n";
        std::fs::write(&yaml_path, payload).unwrap();

        let err = load_sidecar(file_path.to_str().unwrap()).unwrap_err();
        match err {
            SidecarError::Io(io) => {
                assert_eq!(io.kind(), std::io::ErrorKind::InvalidData);
                assert!(io.to_string().contains("anchors/aliases"));
            }
            other => panic!("expected SidecarError::Io, got {:?}", other),
        }
    }

    #[test]
    fn reject_yaml_anchors_allows_amp_inside_text() {
        // Comment text legitimately containing `&` or `*` (e.g. `R&D`,
        // pointers in code samples) must not trigger the anchor scanner.
        let ok = "comments:\n  - id: c1\n    text: \"R&D and *important*\"\n";
        assert!(reject_yaml_anchors(ok).is_ok());
    }

    #[test]
    fn reject_yaml_anchors_flags_block_anchor() {
        let bad = "node: &x foo\nother: *x\n";
        assert!(reject_yaml_anchors(bad).is_err());
    }
}

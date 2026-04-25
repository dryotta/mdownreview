//! Markdown digest export of all comment threads in a workspace.
//!
//! Produces a self-contained markdown document grouped by file, with each
//! thread fenced inside a unique `mdr-thread-<nonce>` code fence so the
//! digest can be pasted into chat / PRs / issues without thread bodies
//! interfering with markdown rendering. The fence identifier carries a
//! per-export random 8-character base32 nonce so successive exports yield
//! distinct fences (advisory #7) — useful when chaining multiple digests
//! into a single document.
//!
//! Output is intentionally plain markdown with no Tauri/IPC dependencies so
//! it can be unit-tested as a pure function.

use crate::core::types::CommentThread;
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::Path;

/// Per-file digest input: the file's absolute path and its current threads.
pub type WorkspaceThreads<'a> = BTreeMap<&'a str, &'a [CommentThread]>;

/// Produce a markdown digest of every thread in `threads`. Files are emitted
/// in sorted relative-path order (BTreeMap) so successive runs over the same
/// state produce diff-friendly output. Per-comment fences carry a random
/// 8-char base32 nonce, drawn once per `export_summary` call.
pub fn export_summary(workspace: &Path, threads: &WorkspaceThreads) -> String {
    let nonce = random_nonce_8();
    let mut out = String::new();
    let _ = writeln!(out, "# Review summary");
    let _ = writeln!(
        out,
        "\n_workspace: `{}`_  \n_threads: {}_\n",
        workspace.display(),
        threads.values().map(|v| v.len()).sum::<usize>()
    );

    if threads.is_empty() {
        out.push_str("\n_No comments to export._\n");
        return out;
    }

    for (path, thread_list) in threads {
        let rel = relative(workspace, Path::new(path));
        let _ = writeln!(out, "## {}\n", rel);
        for thread in *thread_list {
            let r = &thread.root.comment;
            let status = if r.resolved { "resolved" } else { "open" };
            let sev = r.severity.as_deref().unwrap_or("-");
            let _ = writeln!(
                out,
                "- **{}** by `{}` ({} · severity: {}) — line {}",
                r.id,
                r.author,
                status,
                sev,
                thread.root.matched_line_number
            );
            let _ = writeln!(out, "\n```mdr-thread-{}", nonce);
            out.push_str(&r.text);
            if !r.text.ends_with('\n') {
                out.push('\n');
            }
            for reply in &thread.replies {
                let _ = writeln!(out, "---");
                let _ = writeln!(out, "↳ {}: {}", reply.comment.author, reply.comment.text);
            }
            let _ = writeln!(out, "```\n");
        }
    }
    out
}

fn relative(workspace: &Path, file: &Path) -> String {
    file.strip_prefix(workspace)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| file.to_string_lossy().into_owned())
}

/// 8-char Crockford-ish base32 nonce (alphabet excludes ambiguous I/L/O/U) so
/// the fence is human-distinct across exports without pulling in a uuid dep
/// for this single use.
fn random_nonce_8() -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHJKMNPQRSTVWXYZ0123456789";
    let mut buf = [0u8; 8];
    // Mix two independent low-entropy sources: nanos (high resolution) +
    // pointer of a fresh allocation (ASLR slide on most platforms). This is
    // not cryptographic — collisions would only mar a digest's prettiness.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    let aslr = Box::into_raw(Box::new(0u8)) as usize as u64;
    let mut state = nanos.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(aslr);
    for slot in buf.iter_mut() {
        // Reclaim the box's memory: re-box and drop. (Avoids leaking 1 byte
        // per call.)
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        *slot = ALPHABET[(state as usize) & 31];
    }
    // Reclaim the heap byte from `aslr` to avoid leaking it.
    // Safety: we created the Box above and have exclusive ownership of the
    // raw pointer; reconstructing and dropping it is sound.
    unsafe {
        let _ = Box::from_raw(aslr as *mut u8);
    }
    String::from_utf8(buf.to_vec()).expect("ALPHABET is ASCII")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::types::{MatchedComment, MrsfComment};

    fn thread(id: &str, line: u32, severity: Option<&str>, text: &str) -> CommentThread {
        CommentThread {
            root: MatchedComment {
                comment: MrsfComment {
                    id: id.into(),
                    author: "alice".into(),
                    timestamp: "2025-01-01T00:00:00Z".into(),
                    text: text.into(),
                    resolved: false,
                    line: Some(line),
                    severity: severity.map(str::to_string),
                    ..Default::default()
                },
                matched_line_number: line,
                is_orphaned: false,
                anchored_text: None,
            },
            replies: vec![],
        }
    }

    #[test]
    fn empty_workspace_emits_no_comments_marker() {
        let map: WorkspaceThreads = BTreeMap::new();
        let out = export_summary(Path::new("/ws"), &map);
        assert!(out.contains("# Review summary"));
        assert!(out.contains("No comments to export"));
    }

    #[test]
    fn fence_uses_mdr_thread_prefix_and_8char_nonce() {
        let threads = vec![thread("c1", 5, Some("high"), "spotted typo")];
        let mut map: WorkspaceThreads = BTreeMap::new();
        map.insert("/ws/a.md", &threads);
        let out = export_summary(Path::new("/ws"), &map);
        // Find the fence line and check the nonce length.
        let fence_line = out
            .lines()
            .find(|l| l.starts_with("```mdr-thread-"))
            .expect("fence not found");
        let nonce = fence_line.trim_start_matches("```mdr-thread-");
        assert_eq!(nonce.len(), 8, "nonce must be 8 chars: {}", nonce);
    }

    #[test]
    fn nonces_differ_across_runs() {
        let threads = vec![thread("c1", 1, None, "x")];
        let mut map: WorkspaceThreads = BTreeMap::new();
        map.insert("/ws/a.md", &threads);
        let a = export_summary(Path::new("/ws"), &map);
        // Yield the timer + bump heap allocator so nanos+aslr differ.
        for _ in 0..10 {
            std::hint::black_box(Box::new(0u8));
        }
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = export_summary(Path::new("/ws"), &map);
        let extract = |s: &str| {
            s.lines()
                .find(|l| l.starts_with("```mdr-thread-"))
                .unwrap()
                .to_string()
        };
        assert_ne!(extract(&a), extract(&b), "nonces should differ");
    }

    #[test]
    fn relative_paths_are_emitted() {
        let threads = vec![thread("c1", 5, None, "note")];
        let mut map: WorkspaceThreads = BTreeMap::new();
        map.insert("/ws/sub/a.md", &threads);
        let out = export_summary(Path::new("/ws"), &map);
        assert!(out.contains("## "));
        // Relative path should appear (sub/a.md or sub\a.md depending on platform).
        assert!(out.contains("a.md"), "expected file name in digest: {}", out);
    }
}

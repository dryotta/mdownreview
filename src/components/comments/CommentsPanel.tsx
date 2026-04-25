import { useState, useMemo, useCallback, useEffect } from "react";
import { useStore } from "@/store";
import { useComments } from "@/lib/vm/use-comments";
import { useCommentActions } from "@/lib/vm/use-comment-actions";
import { CommentThread } from "./CommentThread";
import { CommentInput } from "./CommentInput";
import type { MatchedComment } from "@/lib/tauri-commands";
import "@/styles/comments.css";

interface Props {
  filePath: string;
  onScrollToLine?: (lineNumber: number) => void;
}

export function CommentsPanel({ filePath, onScrollToLine }: Props) {
  const { threads } = useComments(filePath);
  const { addComment } = useCommentActions();
  const [showResolved, setShowResolved] = useState(false);
  const [showFileLevelInput, setShowFileLevelInput] = useState(false);

  // Iter 5 Group B — single-field selector (architecture rule 9). When this
  // matches our `filePath`, the toolbar's "Comment on file" button has
  // requested us to auto-open the inline file-level input. We mirror the
  // request into a local toggle so the input stays open after the flag
  // is cleared, then immediately clear the flag (via `useStore.getState()`,
  // not closure capture) so the request is consumed exactly once.
  const pendingFileLevelInputFor = useStore((s) => s.pendingFileLevelInputFor);
  useEffect(() => {
    if (pendingFileLevelInputFor && pendingFileLevelInputFor === filePath) {
      // Reacting to an external store flag (set by a sibling viewer's
      // toolbar) is the legitimate "subscribe for updates from some
      // external system" pattern — see react-hooks/set-state-in-effect docs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowFileLevelInput(true);
      useStore.getState().clearFileLevelInput();
    }
  }, [pendingFileLevelInputFor, filePath]);

  const { sorted, unresolved, resolved } = useMemo(() => {
    const sorted = [...threads].sort(
      (a, b) => (a.root.matchedLineNumber ?? a.root.line ?? 0) - (b.root.matchedLineNumber ?? b.root.line ?? 0)
    );

    const unresolved = sorted.filter(t => !t.root.resolved);
    const resolved = sorted.filter(t => t.root.resolved);
    return { sorted, unresolved, resolved };
  }, [threads]);

  const displayed = showResolved ? sorted : unresolved;

  const handleClick = useCallback((comment: MatchedComment) => {
    const line = comment.matchedLineNumber ?? comment.line ?? 1;
    onScrollToLine?.(line);
    window.dispatchEvent(new CustomEvent("scroll-to-line", { detail: { line } }));
  }, [onScrollToLine]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, comment: MatchedComment) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(comment);
    }
  }, [handleClick]);

  const handleSaveFileLevel = useCallback((text: string) => {
    // File-anchored comment — no line gutter, no selected text. We let the
    // VM hook chokepoint funnel the discriminated `{ kind: "file" }` anchor
    // through the existing `add_comment` IPC.
    addComment(filePath, text, { kind: "file" }).catch(() => {});
    setShowFileLevelInput(false);
  }, [addComment, filePath]);

  const canCommentOnFile = filePath.length > 0;

  return (
    <div className="comments-panel">
      <div className="comments-panel-header">
        <span className="comments-panel-title">Comments ({unresolved.length})</span>
        <button
          className="comment-btn comment-btn-add-file"
          onClick={() => setShowFileLevelInput(v => !v)}
          disabled={!canCommentOnFile}
          title="Comment on file"
          aria-label="Comment on file"
        >
          +
        </button>
        <button className="comment-btn" onClick={() => setShowResolved(v => !v)}>
          {showResolved ? "Hide resolved" : `Show resolved (${resolved.length})`}
        </button>
      </div>
      <div className="comments-panel-body">
        {showFileLevelInput && canCommentOnFile && (
          <div className="comment-panel-file-input">
            <CommentInput
              onSave={handleSaveFileLevel}
              onClose={() => setShowFileLevelInput(false)}
              placeholder="Comment on this file… (Ctrl+Enter to save, Escape to cancel)"
            />
          </div>
        )}
        {displayed.length === 0 ? (
          <div className="comments-empty">No comments yet</div>
        ) : (
          displayed.map(thread => (
            <div
              key={thread.root.id}
              className="comment-panel-item"
              role="button"
              tabIndex={0}
              onClick={() => handleClick(thread.root)}
              onKeyDown={(e) => handleKeyDown(e, thread.root)}
            >
              <div className="comment-panel-item-line">
                Line {thread.root.matchedLineNumber ?? thread.root.line ?? "?"}
                {thread.root.isOrphaned && <span className="comment-orphaned-icon" title="Orphaned">⚠</span>}
              </div>
              <CommentThread rootComment={thread.root} replies={thread.replies} filePath={filePath} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

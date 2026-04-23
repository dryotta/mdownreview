import { useState, useMemo, useCallback } from "react";
import { useComments } from "@/lib/vm/use-comments";
import { CommentThread } from "./CommentThread";
import type { MatchedComment } from "@/lib/tauri-commands";
import "@/styles/comments.css";

interface Props {
  filePath: string;
  onScrollToLine?: (lineNumber: number) => void;
}

export function CommentsPanel({ filePath, onScrollToLine }: Props) {
  const { threads } = useComments(filePath);
  const [showResolved, setShowResolved] = useState(false);

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

  return (
    <div className="comments-panel">
      <div className="comments-panel-header">
        <span className="comments-panel-title">Comments ({unresolved.length})</span>
        <button className="comment-btn" onClick={() => setShowResolved(v => !v)}>
          {showResolved ? "Hide resolved" : `Show resolved (${resolved.length})`}
        </button>
      </div>
      <div className="comments-panel-body">
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

import { useState } from "react";
import { useStore } from "@/store";
import { CommentThread } from "./CommentThread";
import "@/styles/comments.css";

interface Props {
  filePath: string;
  onScrollToBlock?: (blockHash: string) => void;
}

export function CommentsPanel({ filePath, onScrollToBlock }: Props) {
  const { commentsByFile } = useStore();
  const [showResolved, setShowResolved] = useState(false);

  const allComments = commentsByFile[filePath] ?? [];
  const unresolved = allComments.filter((c) => !c.resolved);
  const resolved = allComments.filter((c) => c.resolved);
  const displayed = showResolved ? allComments : unresolved;

  return (
    <div className="comments-panel">
      <div className="comments-panel-header">
        <span className="comments-panel-title">Comments ({unresolved.length})</span>
        <button
          className="comment-btn"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved ? "Hide resolved" : `Show resolved (${resolved.length})`}
        </button>
      </div>
      <div className="comments-panel-body">
        {displayed.length === 0 ? (
          <div className="comments-empty">No comments yet</div>
        ) : (
          displayed.map((comment) => (
            <div
              key={comment.id}
              className="comment-panel-item"
              onClick={() => onScrollToBlock?.(comment.blockHash)}
            >
              <CommentThread comment={comment} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

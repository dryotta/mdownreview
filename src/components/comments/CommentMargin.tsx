import { useState } from "react";
import { useStore } from "@/store";
import { CommentInput } from "./CommentInput";
import { CommentThread } from "./CommentThread";
import "@/styles/comments.css";

interface Anchor {
  blockHash: string;
  headingContext: string | null;
  fallbackLine: number;
}

interface Props {
  filePath: string;
  anchor: Anchor;
}

export function CommentMargin({ filePath, anchor }: Props) {
  const { commentsByFile, addComment } = useStore();
  const [showInput, setShowInput] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const comments = (commentsByFile[filePath] ?? []).filter(
    (c) => c.blockHash === anchor.blockHash
  );
  const unresolved = comments.filter((c) => !c.resolved);

  const handleSave = (text: string) => {
    addComment(filePath, { ...anchor }, text);
    setShowInput(false);
    setExpanded(true);
  };

  return (
    <>
      <div className="comment-margin-wrapper">
        <button
          className="comment-plus-btn"
          aria-label="Add comment"
          onClick={() => setShowInput((v) => !v)}
        >
          +
        </button>
        {unresolved.length > 0 && (
          <button
            className="comment-margin-indicator"
            aria-label={`${unresolved.length} comment(s)`}
            onClick={() => setExpanded((v) => !v)}
          />
        )}
        {comments.filter((c) => c.resolved).length > 0 && (
          <button
            className="comment-margin-indicator comment-margin-indicator-resolved"
            aria-label="Resolved comment"
            onClick={() => setExpanded((v) => !v)}
          />
        )}
      </div>
      {showInput && (
        <CommentInput anchor={anchor} onSave={handleSave} onClose={() => setShowInput(false)} />
      )}
      {expanded && comments.map((c) => <CommentThread key={c.id} comment={c} />)}
    </>
  );
}

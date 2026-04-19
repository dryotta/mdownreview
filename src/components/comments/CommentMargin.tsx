import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { CommentInput } from "./CommentInput";
import { CommentThread } from "./CommentThread";
import "@/styles/comments.css";

interface Anchor {
  blockHash: string;
  headingContext: string | null;
  fallbackLine: number;
  anchorType?: "block" | "line";
}

interface Props {
  filePath: string;
  anchor: Anchor;
  openTrigger?: number;
}

function CommentBubbleIcon({ resolved }: { resolved: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1 2a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H5L1 13V2z"
        fill={resolved ? "var(--color-muted)" : "var(--color-accent)"}
        opacity={resolved ? 0.5 : 1}
      />
    </svg>
  );
}

export function CommentMargin({ filePath, anchor, openTrigger }: Props) {
  const { commentsByFile, addComment } = useStore();
  const [showInput, setShowInput] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const comments = (commentsByFile[filePath] ?? []).filter(
    (c) => c.blockHash === anchor.blockHash
  );
  const unresolved = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  // Open input when triggered externally (context menu, keyboard shortcut)
  useEffect(() => {
    if ((openTrigger ?? 0) > 0) {
      setShowInput(true);
    }
  }, [openTrigger]);

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
          title="Add comment (Ctrl+Shift+M)"
          onClick={() => setShowInput((v) => !v)}
        >
          +
        </button>
        {unresolved.length > 0 && (
          <button
            className="comment-margin-indicator"
            aria-label={`${unresolved.length} comment(s)`}
            title={`${unresolved.length} comment(s) — click to expand`}
            onClick={() => setExpanded((v) => !v)}
          >
            <CommentBubbleIcon resolved={false} />
          </button>
        )}
        {resolved.length > 0 && (
          <button
            className="comment-margin-indicator comment-margin-indicator-resolved"
            aria-label="Resolved comment"
            title="Resolved comment — click to expand"
            onClick={() => setExpanded((v) => !v)}
          >
            <CommentBubbleIcon resolved={true} />
          </button>
        )}
      </div>
      {showInput && (
        <CommentInput anchor={anchor} onSave={handleSave} onClose={() => setShowInput(false)} />
      )}
      {expanded && comments.map((c) => <CommentThread key={c.id} comment={c} />)}
    </>
  );
}

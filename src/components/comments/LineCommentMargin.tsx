import { useState } from "react";
import { useStore } from "@/store";
import { CommentInput } from "./CommentInput";
import { CommentThread } from "./CommentThread";
import "@/styles/comments.css";

interface Props {
  filePath: string;
  lineNumber: number;
  lineHash: string;
  showInput?: boolean;
  onCloseInput?: () => void;
}

export function LineCommentMargin({ filePath, lineNumber, lineHash, showInput, onCloseInput }: Props) {
  const { commentsByFile, addComment } = useStore();
  const [expanded, setExpanded] = useState(false);

  const comments = (commentsByFile[filePath] ?? []).filter(
    (c) => c.anchorType === "line" &&
      (c.lineHash === lineHash || (c.lineHash && c.lineNumber === lineNumber))
  );
  const unresolved = comments.filter((c) => !c.resolved);

  const handleSave = (text: string) => {
    addComment(
      filePath,
      { anchorType: "line", lineHash, lineNumber },
      text
    );
    onCloseInput?.();
    setExpanded(true);
  };

  if (!showInput && comments.length === 0) return null;

  return (
    <div className="line-comment-section">
      {showInput && (
        <CommentInput
          anchor={{ blockHash: lineHash, headingContext: null, fallbackLine: lineNumber }}
          onSave={handleSave}
          onClose={() => onCloseInput?.()}
        />
      )}
      {expanded && comments.map((c) => <CommentThread key={c.id} comment={c} />)}
      {!expanded && unresolved.length > 0 && (
        <button className="line-comment-count" onClick={() => setExpanded(true)}>
          {unresolved.length} comment{unresolved.length > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

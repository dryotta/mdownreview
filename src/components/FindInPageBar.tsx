import { useEffect, useRef, type KeyboardEvent } from "react";

interface Props {
  open: boolean;
  query: string;
  matches: number;
  current: number;
  onChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/**
 * #65 G1 — in-app find bar shown at the top of the MarkdownViewer.
 * Class `.find-bar` is intentional: the print stylesheet hides it
 * via `.find-bar { display: none; }` (managed in parallel by the print
 * task).
 */
export function FindInPageBar({
  open,
  query,
  matches,
  current,
  onChange,
  onNext,
  onPrev,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select when the bar opens so a re-trigger of Ctrl+F lands
  // the cursor in the input ready for a new query.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // current is 0-indexed internally, surfaced as 1-indexed to humans.
  const counter = matches === 0
    ? "0 of 0"
    : `${current + 1} of ${matches}`;

  return (
    <div className="find-bar" role="search">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in page…"
        aria-label="Find in page"
      />
      <button
        type="button"
        onClick={onPrev}
        disabled={matches === 0}
        aria-label="Previous match"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={matches === 0}
        aria-label="Next match"
      >
        ↓
      </button>
      <span className="count" aria-live="polite">{counter}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close find bar"
      >
        ×
      </button>
    </div>
  );
}

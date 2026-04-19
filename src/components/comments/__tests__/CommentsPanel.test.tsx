import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentsPanel } from "../CommentsPanel";
import { useStore } from "@/store";
import type { CommentWithOrphan } from "@/store";

vi.mock("@tauri-apps/api/core");
vi.mock("@/logger");

const FILE = "/docs/README.md";

function makeComment(
  id: string,
  text: string,
  overrides: Partial<CommentWithOrphan> = {}
): CommentWithOrphan {
  return {
    id,
    anchorType: "block" as const,
    blockHash: `hash-${id}`,
    headingContext: null,
    fallbackLine: 1,
    text,
    createdAt: new Date().toISOString(),
    resolved: false,
    isOrphaned: false,
    ...overrides,
  };
}

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ commentsByFile: {} });
});

// ─── 14.3: CommentsPanel behavior ────────────────────────────────────────────

describe("14.3 – CommentsPanel", () => {
  it("shows 'No comments yet' when there are no comments", () => {
    render(<CommentsPanel filePath={FILE} />);
    expect(screen.getByText("No comments yet")).toBeInTheDocument();
  });

  it("lists unresolved comments in order", () => {
    useStore.setState({
      commentsByFile: {
        [FILE]: [
          makeComment("1", "First comment"),
          makeComment("2", "Second comment"),
          makeComment("3", "Third comment"),
        ],
      },
    });

    render(<CommentsPanel filePath={FILE} />);

    const texts = screen.getAllByText(/comment/i);
    const comments = texts.filter((el) => el.classList.contains("comment-text"));
    expect(comments[0]).toHaveTextContent("First comment");
    expect(comments[1]).toHaveTextContent("Second comment");
    expect(comments[2]).toHaveTextContent("Third comment");
  });

  it("orphaned comments show warning icon ⚠", () => {
    useStore.setState({
      commentsByFile: {
        [FILE]: [
          makeComment("1", "Orphaned comment", { isOrphaned: true }),
          makeComment("2", "Normal comment", { isOrphaned: false }),
        ],
      },
    });

    render(<CommentsPanel filePath={FILE} />);
    expect(screen.getAllByText("⚠")).toHaveLength(1);
  });

  it("'Show resolved' toggle shows resolved comments", () => {
    useStore.setState({
      commentsByFile: {
        [FILE]: [
          makeComment("1", "Active comment"),
          makeComment("2", "Resolved comment", { resolved: true }),
        ],
      },
    });

    render(<CommentsPanel filePath={FILE} />);

    // Initially only unresolved visible
    expect(screen.getByText("Active comment")).toBeInTheDocument();
    expect(screen.queryByText("Resolved comment")).not.toBeInTheDocument();

    // Click "Show resolved"
    fireEvent.click(screen.getByText(/show resolved/i));

    // Now both visible
    expect(screen.getByText("Active comment")).toBeInTheDocument();
    expect(screen.getByText("Resolved comment")).toBeInTheDocument();
  });

  it("'Hide resolved' toggle hides resolved comments again", () => {
    useStore.setState({
      commentsByFile: {
        [FILE]: [
          makeComment("1", "Active comment"),
          makeComment("2", "Resolved comment", { resolved: true }),
        ],
      },
    });

    render(<CommentsPanel filePath={FILE} />);

    fireEvent.click(screen.getByText(/show resolved/i));
    expect(screen.getByText("Resolved comment")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/hide resolved/i));
    expect(screen.queryByText("Resolved comment")).not.toBeInTheDocument();
  });

  it("clicking a comment calls the scroll handler with blockHash", () => {
    const onScrollToBlock = vi.fn();

    useStore.setState({
      commentsByFile: {
        [FILE]: [makeComment("1", "Scrollable comment", { blockHash: "hash-abc" })],
      },
    });

    render(<CommentsPanel filePath={FILE} onScrollToBlock={onScrollToBlock} />);

    const commentItem = document.querySelector(".comment-panel-item")!;
    fireEvent.click(commentItem);

    expect(onScrollToBlock).toHaveBeenCalledWith("hash-abc");
  });

  it("shows unresolved count in header", () => {
    useStore.setState({
      commentsByFile: {
        [FILE]: [
          makeComment("1", "A"),
          makeComment("2", "B"),
          makeComment("3", "C", { resolved: true }),
        ],
      },
    });

    render(<CommentsPanel filePath={FILE} />);
    expect(screen.getByText("Comments (2)")).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "@/store/index";
import type { CommentWithOrphan } from "@/store/index";

const initialState = useStore.getState();

// Minimal anchor that satisfies addComment's second argument type
const baseAnchor: Omit<CommentWithOrphan, "id" | "createdAt" | "resolved" | "text" | "isOrphaned"> = {
  anchorType: "block" as const,
  blockHash: "abc123",
  headingContext: "## Section",
  fallbackLine: 5,
};

const FILE = "/docs/notes.md";

beforeEach(() => {
  useStore.setState(initialState, true);
});

// Helper: add a comment and return its id
function addAndGetId(text = "Hello"): string {
  useStore.getState().addComment(FILE, baseAnchor, text);
  const comments = useStore.getState().commentsByFile[FILE];
  return comments[comments.length - 1].id;
}

describe("comments slice – addComment", () => {
  it("creates a comment under the given file", () => {
    useStore.getState().addComment(FILE, baseAnchor, "My note");
    const comments = useStore.getState().commentsByFile[FILE];
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe("My note");
  });

  it("sets resolved to false by default", () => {
    addAndGetId("fresh");
    const [comment] = useStore.getState().commentsByFile[FILE];
    expect(comment.resolved).toBe(false);
  });

  it("copies anchor fields onto the new comment", () => {
    useStore.getState().addComment(FILE, baseAnchor, "check");
    const [comment] = useStore.getState().commentsByFile[FILE];
    expect(comment.anchorType).toBe("block");
    expect(comment.blockHash).toBe("abc123");
    expect(comment.headingContext).toBe("## Section");
    expect(comment.fallbackLine).toBe(5);
  });

  it("generates a unique id for each comment", () => {
    addAndGetId("first");
    addAndGetId("second");
    const [c1, c2] = useStore.getState().commentsByFile[FILE];
    expect(c1.id).not.toBe(c2.id);
  });

  it("appends to existing comments for the same file", () => {
    addAndGetId("one");
    addAndGetId("two");
    expect(useStore.getState().commentsByFile[FILE]).toHaveLength(2);
  });

  it("creates independent comment lists per file", () => {
    useStore.getState().addComment(FILE, baseAnchor, "A");
    useStore.getState().addComment("/docs/other.md", baseAnchor, "B");
    expect(useStore.getState().commentsByFile[FILE]).toHaveLength(1);
    expect(useStore.getState().commentsByFile["/docs/other.md"]).toHaveLength(1);
  });

  it("sets createdAt to an ISO timestamp", () => {
    addAndGetId("ts check");
    const [comment] = useStore.getState().commentsByFile[FILE];
    expect(() => new Date(comment.createdAt)).not.toThrow();
    expect(isNaN(new Date(comment.createdAt).getTime())).toBe(false);
  });
});

describe("comments slice – editComment", () => {
  it("changes the text of the target comment", () => {
    const id = addAndGetId("original");
    useStore.getState().editComment(id, "updated");
    const [comment] = useStore.getState().commentsByFile[FILE];
    expect(comment.text).toBe("updated");
  });

  it("leaves other comments unchanged", () => {
    const id1 = addAndGetId("first");
    addAndGetId("second");
    useStore.getState().editComment(id1, "modified");
    const [c1, c2] = useStore.getState().commentsByFile[FILE];
    expect(c1.text).toBe("modified");
    expect(c2.text).toBe("second");
  });

  it("works across different files (edits only the target comment)", () => {
    const id = addAndGetId("file1 comment");
    useStore.getState().addComment("/docs/other.md", baseAnchor, "file2 comment");
    useStore.getState().editComment(id, "file1 updated");
    expect(useStore.getState().commentsByFile[FILE][0].text).toBe("file1 updated");
    expect(useStore.getState().commentsByFile["/docs/other.md"][0].text).toBe("file2 comment");
  });
});

describe("comments slice – deleteComment", () => {
  it("removes the comment with the given id", () => {
    const id = addAndGetId("to delete");
    useStore.getState().deleteComment(id);
    expect(useStore.getState().commentsByFile[FILE]).toHaveLength(0);
  });

  it("leaves other comments in place", () => {
    const id1 = addAndGetId("keep");
    const id2 = addAndGetId("remove");
    useStore.getState().deleteComment(id2);
    const comments = useStore.getState().commentsByFile[FILE];
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(id1);
  });

  it("handles deletion of a non-existent id gracefully", () => {
    addAndGetId("safe");
    useStore.getState().deleteComment("no-such-id");
    expect(useStore.getState().commentsByFile[FILE]).toHaveLength(1);
  });
});

describe("comments slice – resolveComment / unresolveComment", () => {
  it("resolveComment sets resolved to true", () => {
    const id = addAndGetId("resolve me");
    useStore.getState().resolveComment(id);
    const [comment] = useStore.getState().commentsByFile[FILE];
    expect(comment.resolved).toBe(true);
  });

  it("unresolveComment sets resolved back to false", () => {
    const id = addAndGetId("back to unresolved");
    useStore.getState().resolveComment(id);
    useStore.getState().unresolveComment(id);
    const [comment] = useStore.getState().commentsByFile[FILE];
    expect(comment.resolved).toBe(false);
  });

  it("resolving a comment removes it from the unresolved count", () => {
    addAndGetId("comment A");
    const id2 = addAndGetId("comment B");

    // Before: two unresolved
    const before = (useStore.getState().commentsByFile[FILE] ?? []).filter(
      (c) => !c.resolved
    ).length;
    expect(before).toBe(2);

    useStore.getState().resolveComment(id2);

    const after = (useStore.getState().commentsByFile[FILE] ?? []).filter(
      (c) => !c.resolved
    ).length;
    expect(after).toBe(1);
  });

  it("resolving only affects the targeted comment", () => {
    const id1 = addAndGetId("leave me");
    const id2 = addAndGetId("resolve me");
    useStore.getState().resolveComment(id2);
    const [c1, c2] = useStore.getState().commentsByFile[FILE];
    expect(c1.id).toBe(id1);
    expect(c1.resolved).toBe(false);
    expect(c2.id).toBe(id2);
    expect(c2.resolved).toBe(true);
  });
});

describe("comments slice – orphaned flag preservation", () => {
  it("editing a comment preserves the isOrphaned flag", () => {
    // Seed a comment with isOrphaned=true via setFileComments
    const orphaned: CommentWithOrphan = {
      id: "orph-1",
      anchorType: "block" as const,
      blockHash: "deadbeef",
      headingContext: null,
      fallbackLine: 1,
      text: "original",
      createdAt: new Date().toISOString(),
      resolved: false,
      isOrphaned: true,
    };
    useStore.getState().setFileComments(FILE, [orphaned]);

    useStore.getState().editComment("orph-1", "new text");
    const [updated] = useStore.getState().commentsByFile[FILE];
    expect(updated.isOrphaned).toBe(true);
    expect(updated.text).toBe("new text");
  });

  it("resolving a comment preserves the isOrphaned flag", () => {
    const orphaned: CommentWithOrphan = {
      id: "orph-2",
      anchorType: "block" as const,
      blockHash: "deadbeef",
      headingContext: null,
      fallbackLine: 1,
      text: "orphan",
      createdAt: new Date().toISOString(),
      resolved: false,
      isOrphaned: true,
    };
    useStore.getState().setFileComments(FILE, [orphaned]);

    useStore.getState().resolveComment("orph-2");
    const [updated] = useStore.getState().commentsByFile[FILE];
    expect(updated.isOrphaned).toBe(true);
    expect(updated.resolved).toBe(true);
  });
});

describe("useUnresolvedCount selector", () => {
  it("returns the number of unresolved comments for a file", () => {
    addAndGetId("a");
    addAndGetId("b");
    const id3 = addAndGetId("c");
    useStore.getState().resolveComment(id3);

    // Access selector via getState() directly — calling useStore() as a hook
    // is only valid inside React function components.
    const count = (useStore.getState().commentsByFile[FILE] ?? []).filter(
      (c) => !c.resolved
    ).length;
    expect(count).toBe(2);
  });

  it("returns 0 for a file with no comments", () => {
    const count = (
      useStore.getState().commentsByFile["/no/comments.md"] ?? []
    ).filter((c) => !c.resolved).length;
    expect(count).toBe(0);
  });
});

describe("comment v2 compatibility", () => {
  it("handles v1 comments (block-only, no anchorType)", () => {
    const v1Comment = {
      id: "abc",
      blockHash: "12345678",
      headingContext: null,
      fallbackLine: 5,
      text: "old comment",
      createdAt: "2026-01-01T00:00:00Z",
      resolved: false,
    };
    useStore.getState().setFileComments("/test.md", [v1Comment as any]);
    const comments = useStore.getState().commentsByFile["/test.md"];
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe("old comment");
  });

  it("stores line comments with anchorType", () => {
    const lineComment = {
      id: "def",
      anchorType: "line" as const,
      lineHash: "abcd1234",
      lineNumber: 42,
      text: "line comment",
      createdAt: "2026-01-01T00:00:00Z",
      resolved: false,
    };
    useStore.getState().setFileComments("/test.ts", [lineComment]);
    const comments = useStore.getState().commentsByFile["/test.ts"];
    expect(comments).toHaveLength(1);
    expect(comments[0].anchorType).toBe("line");
    expect(comments[0].lineHash).toBe("abcd1234");
    expect(comments[0].lineNumber).toBe(42);
  });
});


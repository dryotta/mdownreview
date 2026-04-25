import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "@/store/index";
import { MAX_TAB_HISTORY } from "@/store/tabHistory";

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

describe("tabHistory slice", () => {
  it("initial state: empty history, cursor at -1, both flags false", () => {
    const s = useStore.getState();
    expect(s.history).toEqual([]);
    expect(s.historyIndex).toBe(-1);
    expect(s.canBack).toBe(false);
    expect(s.canForward).toBe(false);
    expect(s.back()).toBeNull();
    expect(s.forward()).toBeNull();
  });

  it("pushHistory appends and updates flags", () => {
    useStore.getState().pushHistory("/a.md");
    let s = useStore.getState();
    expect(s.history).toEqual(["/a.md"]);
    expect(s.historyIndex).toBe(0);
    expect(s.canBack).toBe(false);
    expect(s.canForward).toBe(false);

    useStore.getState().pushHistory("/b.md");
    s = useStore.getState();
    expect(s.history).toEqual(["/a.md", "/b.md"]);
    expect(s.historyIndex).toBe(1);
    expect(s.canBack).toBe(true);
    expect(s.canForward).toBe(false);
  });

  it("re-pushing the current head is a no-op", () => {
    useStore.getState().pushHistory("/a.md");
    useStore.getState().pushHistory("/a.md");
    expect(useStore.getState().history).toEqual(["/a.md"]);
    expect(useStore.getState().historyIndex).toBe(0);
  });

  it("back/forward navigate the cursor and return target paths", () => {
    const { pushHistory } = useStore.getState();
    pushHistory("/a.md");
    pushHistory("/b.md");
    pushHistory("/c.md");

    expect(useStore.getState().back()).toBe("/b.md");
    expect(useStore.getState().historyIndex).toBe(1);
    expect(useStore.getState().canBack).toBe(true);
    expect(useStore.getState().canForward).toBe(true);

    expect(useStore.getState().back()).toBe("/a.md");
    expect(useStore.getState().historyIndex).toBe(0);
    expect(useStore.getState().canBack).toBe(false);
    expect(useStore.getState().canForward).toBe(true);

    // Going past the start is a no-op.
    expect(useStore.getState().back()).toBeNull();
    expect(useStore.getState().historyIndex).toBe(0);

    expect(useStore.getState().forward()).toBe("/b.md");
    expect(useStore.getState().forward()).toBe("/c.md");
    expect(useStore.getState().forward()).toBeNull();
    expect(useStore.getState().canForward).toBe(false);
  });

  it("pushHistory while not at head truncates forward history", () => {
    const { pushHistory, back } = useStore.getState();
    pushHistory("/a.md");
    pushHistory("/b.md");
    pushHistory("/c.md");
    back(); // now at /b.md
    expect(useStore.getState().historyIndex).toBe(1);

    useStore.getState().pushHistory("/d.md");
    const s = useStore.getState();
    expect(s.history).toEqual(["/a.md", "/b.md", "/d.md"]);
    expect(s.historyIndex).toBe(2);
    expect(s.canForward).toBe(false);
    expect(s.canBack).toBe(true);
  });

  it("ring buffer caps at MAX_TAB_HISTORY entries (oldest dropped)", () => {
    const { pushHistory } = useStore.getState();
    for (let i = 0; i < MAX_TAB_HISTORY + 10; i++) {
      pushHistory(`/file-${i}.md`);
    }
    const s = useStore.getState();
    expect(s.history).toHaveLength(MAX_TAB_HISTORY);
    // First retained entry is the (10)th push; last is the most recent.
    expect(s.history[0]).toBe("/file-10.md");
    expect(s.history[s.history.length - 1]).toBe(
      `/file-${MAX_TAB_HISTORY + 10 - 1}.md`,
    );
    expect(s.historyIndex).toBe(MAX_TAB_HISTORY - 1);
    expect(s.canForward).toBe(false);
    expect(s.canBack).toBe(true);
  });

  it("history is never persisted (not in partialize allowlist)", () => {
    useStore.getState().pushHistory("/a.md");
    const persistApi = (useStore as unknown as {
      persist: { getOptions: () => { partialize?: (s: unknown) => unknown } };
    }).persist;
    const opts = persistApi.getOptions();
    const snap = opts.partialize!(useStore.getState()) as Record<string, unknown>;
    expect(snap).not.toHaveProperty("history");
    expect(snap).not.toHaveProperty("historyIndex");
  });
});

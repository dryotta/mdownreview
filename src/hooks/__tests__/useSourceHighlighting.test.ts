import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSourceHighlighting, escapeHtml } from "../useSourceHighlighting";

vi.mock("@/lib/shiki", () => ({
  getSharedHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: vi.fn().mockReturnValue("<pre><code>highlighted</code></pre>"),
    getLoadedLanguages: vi.fn().mockReturnValue([]),
    loadLanguage: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("useSourceHighlighting", () => {
  it("returns highlighted lines for given content", async () => {
    const { result } = renderHook(() =>
      useSourceHighlighting("line1\nline2\nline3", "/test.ts")
    );

    await waitFor(() => {
      expect(result.current.highlightedLines).toHaveLength(3);
    });
    expect(result.current.highlightedLines[0]).toContain("highlighted");
  });

  it("produces one highlighted line per source line", async () => {
    const { result } = renderHook(() =>
      useSourceHighlighting("a\nb", "/test.ts")
    );

    await waitFor(() => {
      expect(result.current.highlightedLines).toHaveLength(2);
    });
    expect(result.current.highlightedLines[0]).toContain("highlighted");
    expect(result.current.highlightedLines[1]).toContain("highlighted");
  });

  it("updates highlighted lines when content changes", async () => {
    const { result, rerender } = renderHook(
      ({ content, path }) => useSourceHighlighting(content, path),
      { initialProps: { content: "a", path: "/test.ts" } }
    );

    await waitFor(() => {
      expect(result.current.highlightedLines).toHaveLength(1);
    });

    rerender({ content: "a\nb\nc", path: "/test.ts" });

    await waitFor(() => {
      expect(result.current.highlightedLines).toHaveLength(3);
    });
  });

  it("updates highlighted lines when path changes", async () => {
    const { result, rerender } = renderHook(
      ({ content, path }) => useSourceHighlighting(content, path),
      { initialProps: { content: "code", path: "/test.ts" } }
    );

    await waitFor(() => {
      expect(result.current.highlightedLines).toHaveLength(1);
    });

    rerender({ content: "code", path: "/test.py" });

    await waitFor(() => {
      expect(result.current.highlightedLines).toHaveLength(1);
    });
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles multiple special chars", () => {
    expect(escapeHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
});

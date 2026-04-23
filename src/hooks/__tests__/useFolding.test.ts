import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFolding } from "../useFolding";

describe("useFolding", () => {
  const braceLines = [
    "function foo() {",
    "  const x = 1;",
    "  const y = 2;",
    "}",
  ];

  it("computes foldStartMap from lines with braces", () => {
    const { result } = renderHook(() => useFolding(braceLines, "/test.ts"));
    expect(result.current.foldStartMap.size).toBeGreaterThan(0);
    const region = result.current.foldStartMap.get(1);
    expect(region).toBeDefined();
    expect(region!.startLine).toBe(1);
    expect(region!.endLine).toBe(4);
  });

  it("starts with no collapsed lines", () => {
    const { result } = renderHook(() => useFolding(braceLines, "/test.ts"));
    expect(result.current.collapsedLines.size).toBe(0);
  });

  it("toggleFold collapses and expands a line", () => {
    const { result } = renderHook(() => useFolding(braceLines, "/test.ts"));

    act(() => result.current.toggleFold(1));
    expect(result.current.collapsedLines.has(1)).toBe(true);

    act(() => result.current.toggleFold(1));
    expect(result.current.collapsedLines.has(1)).toBe(false);
  });

  it("resets collapsed lines when filePath changes", () => {
    const { result, rerender } = renderHook(
      ({ lines, path }) => useFolding(lines, path),
      { initialProps: { lines: braceLines, path: "/a.ts" } }
    );

    act(() => result.current.toggleFold(1));
    expect(result.current.collapsedLines.has(1)).toBe(true);

    rerender({ lines: braceLines, path: "/b.ts" });
    expect(result.current.collapsedLines.size).toBe(0);
  });

  it("returns empty foldStartMap for flat lines", () => {
    const flatLines = ["a", "b", "c"];
    const { result } = renderHook(() => useFolding(flatLines, "/test.txt"));
    expect(result.current.foldStartMap.size).toBe(0);
  });
});

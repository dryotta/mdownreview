import { describe, it, expect } from "vitest";
import { findRangesInContainer } from "../find-in-page";

function makeContainer(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe("findRangesInContainer", () => {
  it("returns no ranges for an empty query", () => {
    const c = makeContainer("hello world");
    expect(findRangesInContainer(c, "")).toEqual([]);
  });

  it("returns one range for a single match, covering the match span", () => {
    const c = makeContainer("alpha beta gamma");
    const ranges = findRangesInContainer(c, "beta");
    expect(ranges).toHaveLength(1);
    const r = ranges[0];
    expect(r.toString()).toBe("beta");
    expect(r.startOffset).toBe(6);
    expect(r.endOffset).toBe(10);
  });

  it("finds multiple non-overlapping matches in one text node", () => {
    const c = makeContainer("ababab");
    const ranges = findRangesInContainer(c, "ab");
    expect(ranges).toHaveLength(3);
    expect(ranges.map((r) => r.startOffset)).toEqual([0, 2, 4]);
    expect(ranges.map((r) => r.endOffset)).toEqual([2, 4, 6]);
  });

  it("matches case-insensitively", () => {
    const c = makeContainer("Foo foo FOO fOo");
    const ranges = findRangesInContainer(c, "foo");
    expect(ranges).toHaveLength(4);
    ranges.forEach((r) => expect(r.toString().toLowerCase()).toBe("foo"));
  });

  it("walks across multiple text nodes (separate ranges per node)", () => {
    const c = makeContainer("<p>foo</p><p>foo bar foo</p>");
    const ranges = findRangesInContainer(c, "foo");
    expect(ranges).toHaveLength(3);
  });

  it("enforces the max cap (≤ max even with more occurrences)", () => {
    // 1500 occurrences of "x" inside one text node.
    const c = makeContainer("x".repeat(1500));
    const ranges = findRangesInContainer(c, "x", 1000);
    expect(ranges.length).toBe(1000);
  });
});

/**
 * Pure DOM walker for the find-in-page feature (#65 G1). Walks all text
 * nodes under `container` and returns a Range covering each case-insensitive
 * occurrence of `query`. The `max` cap (default 1000) bounds work on huge
 * documents — once reached, we stop walking entirely (no partial extra hits).
 *
 * Pure: takes a Node + string, returns Range[]. No React, no CSS API. The
 * unit-testable seam for `useFindInPage`.
 */
export function findRangesInContainer(
  container: Node,
  query: string,
  max: number = 1000,
): Range[] {
  const ranges: Range[] = [];
  if (!query) return ranges;
  const ownerDoc = container.ownerDocument;
  if (!ownerDoc) return ranges;

  const needle = query.toLowerCase();
  const needleLen = needle.length;

  const walker = ownerDoc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node !== null) {
    const text = node.nodeValue ?? "";
    if (text.length >= needleLen) {
      const haystack = text.toLowerCase();
      let from = 0;
      while (from <= haystack.length - needleLen) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        const range = ownerDoc.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + needleLen);
        ranges.push(range);
        if (ranges.length >= max) return ranges;
        from = idx + needleLen;
      }
    }
    node = walker.nextNode();
  }
  return ranges;
}

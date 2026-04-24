/**
 * Parse a leading YAML-ish frontmatter block (delimited by `---` lines) from a
 * markdown string and return the remaining body plus a flat key→value map.
 *
 * This is intentionally a tiny, synchronous TS implementation rather than a
 * Tauri command: the markdown viewer renders frontmatter eagerly during initial
 * render, and an async IPC round-trip would cause a flash-of-unstyled-content.
 *
 * Behaviour notes (preserved from the original inline implementation):
 * - If the content does not start with `---`, the entire input is returned as
 *   `body` and `data` is `null`.
 * - If the opening `---` is not followed by a closing `\n---`, the entire input
 *   is returned as `body` and `data` is `null` (i.e. malformed frontmatter is
 *   treated as plain content).
 * - Inside the YAML block, lines without a `:` are silently skipped.
 * - For lines with a `:`, only the FIRST `:` is the separator; any subsequent
 *   colons are kept verbatim in the value (so URLs/timestamps survive).
 * - Keys and values are trimmed; empty keys are dropped.
 * - The body is `trimStart`ed after the closing `---`.
 */
export function parseFrontmatter(content: string): {
  body: string;
  data: Record<string, unknown> | null;
} {
  if (!content.startsWith("---")) return { body: content, data: null };
  const nlIdx = content.indexOf("\n");
  if (nlIdx === -1) return { body: content, data: null };
  const end = content.indexOf("\n---", nlIdx + 1);
  if (end === -1) return { body: content, data: null };
  const yaml = content.slice(nlIdx + 1, end);
  const body = content.slice(end + 4).trimStart();
  const data: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) data[key] = value;
  }
  return { body, data };
}

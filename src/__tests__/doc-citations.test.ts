import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildBasenameIndex,
  extractCitations,
  lineCount,
  resolveCitation,
} from "./helpers/doc-citation-helpers";

/**
 * Meta-test: verify that file:line citations in docs/architecture.md still
 * resolve to existing files, and that range citations (file:NN-MM) point
 * inside the file's actual line count.
 *
 * This is a structural cheap check, NOT semantic — it can't tell you
 * whether the cited block still describes what the doc says, only that
 * the file/line range still exists. It catches drift like "file.ts:300"
 * when file is 200 lines.
 *
 * Tuned to be conservative: a few false negatives (citations we skip)
 * are preferable to false positives (failing on legitimate prose).
 */

const REPO_ROOT = resolve(__dirname, "..", "..");
const ARCHITECTURE_DOC = join(REPO_ROOT, "docs", "architecture.md");

// Paths that are intentionally hypothetical or external in architecture.md.
// Bare basenames listed here are skipped if encountered as citations.
const ALLOWED_MISSING = new Set<string>([
  // none currently — all citations should resolve
]);

// Roots to scan when resolving a bare basename citation.
const SEARCH_ROOTS = ["src", "src-tauri/src"];

describe("docs/architecture.md citations", () => {
  const doc = readFileSync(ARCHITECTURE_DOC, "utf8");
  const basenameIndex = buildBasenameIndex(REPO_ROOT, SEARCH_ROOTS);
  const ctx = { repoRoot: REPO_ROOT, searchRoots: SEARCH_ROOTS, basenameIndex };
  const citations = extractCitations(doc);

  it("extracts a non-trivial number of citations", () => {
    // Sanity: if this drops to zero, the regex broke.
    expect(citations.length).toBeGreaterThan(10);
  });

  it("every cited file exists (path or unique basename)", () => {
    const broken: string[] = [];
    for (const c of citations) {
      if (ALLOWED_MISSING.has(c.pathOrBase)) continue;
      const resolved = resolveCitation(c, ctx);
      if (!resolved) broken.push(c.raw);
    }
    expect(broken, `Citations refer to missing files:\n  ${broken.join("\n  ")}`).toEqual([]);
  });

  it("every range citation points inside the file's actual line count", () => {
    const drift: string[] = [];
    for (const c of citations) {
      if (ALLOWED_MISSING.has(c.pathOrBase)) continue;
      const resolved = resolveCitation(c, ctx);
      if (!resolved) continue; // covered by the previous test
      const total = lineCount(resolved);
      if (c.endLine > total) {
        drift.push(`${c.raw} → file has ${total} lines`);
      }
    }
    expect(drift, `Citations point past EOF:\n  ${drift.join("\n  ")}`).toEqual([]);
  });
});

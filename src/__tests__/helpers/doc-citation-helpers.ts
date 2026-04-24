import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Pure helpers for the docs/architecture.md citation meta-test.
 * Extracted so they can be unit-tested independently with synthetic input.
 */

// File extensions we accept as code citations.
export const CODE_EXT = /\.(?:tsx?|rs|jsx?)$/;

/**
 * Permissive regex: matches forms like
 *   file.ts:42
 *   file.ts:42-99
 *   path/to/file.rs:10
 *   src-tauri/src/lib.rs:222-251
 *   App.tsx:54,62      (we capture only the first number; second is treated as a separate citation)
 *
 * Restricted to .ts/.tsx/.rs/.js/.jsx so we don't catch arbitrary "name:42" prose.
 */
export const CITATION_RE = /([A-Za-z0-9_./-]+\.(?:tsx?|rs|jsx?)):(\d+)(?:-(\d+))?/g;

export interface Citation {
  raw: string;            // the matched substring, for error messages
  pathOrBase: string;     // either a relative path or a bare basename
  startLine: number;
  endLine: number;        // === startLine for single-line citations
}

export function extractCitations(doc: string): Citation[] {
  const found: Citation[] = [];
  for (const m of doc.matchAll(CITATION_RE)) {
    const [raw, pathOrBase, startStr, endStr] = m;
    const startLine = Number.parseInt(startStr, 10);
    const endLine = endStr ? Number.parseInt(endStr, 10) : startLine;
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) continue;
    found.push({ raw, pathOrBase, startLine, endLine });
  }
  return found;
}

export function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "target" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(name)) out.push(full);
  }
  return out;
}

export function buildBasenameIndex(repoRoot: string, searchRoots: string[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const root of searchRoots) {
    for (const file of walk(join(repoRoot, root))) {
      const base = file.split(sep).pop()!;
      const arr = idx.get(base) ?? [];
      arr.push(file);
      idx.set(base, arr);
    }
  }
  return idx;
}

export function lineCount(file: string): number {
  // Use split-on-newline rather than streaming — files are small.
  const text = readFileSync(file, "utf8");
  // Don't count a trailing empty line from a final newline.
  const n = text.split(/\r?\n/).length;
  return text.endsWith("\n") ? n - 1 : n;
}

export interface ResolveContext {
  repoRoot: string;
  searchRoots: string[];
  basenameIndex: Map<string, string[]>;
  /** Override for tests; defaults to fs.existsSync. */
  exists?: (p: string) => boolean;
}

export function resolveCitation(c: Citation, ctx: ResolveContext): string | null {
  const exists = ctx.exists ?? existsSync;
  // Path-form: contains a slash → try repo-relative first, then joined with
  // each searchRoot (so "store/index.ts" matches "src/store/index.ts").
  if (c.pathOrBase.includes("/")) {
    const direct = join(ctx.repoRoot, c.pathOrBase);
    if (exists(direct)) return direct;
    for (const root of ctx.searchRoots) {
      const candidate = join(ctx.repoRoot, root, c.pathOrBase);
      if (exists(candidate)) return candidate;
    }
    return null;
  }
  // Bare basename: look up in the index.
  const matches = ctx.basenameIndex.get(c.pathOrBase);
  if (!matches || matches.length === 0) return null;
  // If ambiguous, skip resolution (return null and let the caller treat it
  // as unresolvable).
  if (matches.length > 1) return null;
  return matches[0];
}

import { describe, it, expect } from "vitest";
import {
  extractCitations,
  resolveCitation,
  type Citation,
} from "./doc-citation-helpers";

describe("extractCitations", () => {
  it("extracts path-form single-line citations like path/to/file.ts:42", () => {
    const doc = "See `path/to/file.ts:42` for details.";
    const cites = extractCitations(doc);
    expect(cites).toHaveLength(1);
    expect(cites[0].pathOrBase).toBe("path/to/file.ts");
    expect(cites[0].startLine).toBe(42);
    expect(cites[0].endLine).toBe(42);
  });

  it("extracts range citations like file.ts:10-20 and parses endLine correctly", () => {
    const doc = "Range here: file.ts:10-20.";
    const cites = extractCitations(doc);
    expect(cites).toHaveLength(1);
    expect(cites[0].pathOrBase).toBe("file.ts");
    expect(cites[0].startLine).toBe(10);
    expect(cites[0].endLine).toBe(20);
  });

  it("extracts bare-basename citations like App.tsx:50", () => {
    const doc = "look at App.tsx:50 here.";
    const cites = extractCitations(doc);
    expect(cites).toHaveLength(1);
    expect(cites[0].pathOrBase).toBe("App.tsx");
    expect(cites[0].startLine).toBe(50);
    expect(cites[0].endLine).toBe(50);
  });

  it("extracts multiple citations of mixed forms from one doc", () => {
    const doc = "See src/foo.ts:1, also bar.rs:7-9 and baz.tsx:100.";
    const cites = extractCitations(doc);
    expect(cites.map((c) => c.raw)).toEqual([
      "src/foo.ts:1",
      "bar.rs:7-9",
      "baz.tsx:100",
    ]);
    expect(cites[1].endLine).toBe(9);
  });

  it("returns an empty array when no citations are present", () => {
    expect(extractCitations("just prose, no refs")).toEqual([]);
  });
});

describe("resolveCitation", () => {
  // Use a fake exists() so tests don't touch the real filesystem.
  function makeCtx(opts: {
    existing?: Set<string>;
    index?: Map<string, string[]>;
  }) {
    const existing = opts.existing ?? new Set<string>();
    return {
      repoRoot: "/repo",
      searchRoots: ["src", "src-tauri/src"],
      basenameIndex: opts.index ?? new Map<string, string[]>(),
      exists: (p: string) => existing.has(p.replace(/\\/g, "/")),
    };
  }

  it("returns the resolved file path for an unambiguous bare basename", () => {
    const idx = new Map([["App.tsx", ["/repo/src/App.tsx"]]]);
    const c: Citation = { raw: "App.tsx:5", pathOrBase: "App.tsx", startLine: 5, endLine: 5 };
    const out = resolveCitation(c, makeCtx({ index: idx }));
    expect(out).toBe("/repo/src/App.tsx");
  });

  it("returns null on ambiguous bare basenames", () => {
    const idx = new Map([
      ["index.ts", ["/repo/src/a/index.ts", "/repo/src/b/index.ts"]],
    ]);
    const c: Citation = { raw: "index.ts:1", pathOrBase: "index.ts", startLine: 1, endLine: 1 };
    expect(resolveCitation(c, makeCtx({ index: idx }))).toBeNull();
  });

  it("returns null when bare basename is not in the index", () => {
    const c: Citation = { raw: "missing.ts:1", pathOrBase: "missing.ts", startLine: 1, endLine: 1 };
    expect(resolveCitation(c, makeCtx({}))).toBeNull();
  });

  it("resolves a path-form citation against repoRoot", () => {
    const c: Citation = {
      raw: "src/foo.ts:1",
      pathOrBase: "src/foo.ts",
      startLine: 1,
      endLine: 1,
    };
    const out = resolveCitation(c, makeCtx({ existing: new Set(["/repo/src/foo.ts"]) }));
    expect(out?.replace(/\\/g, "/")).toBe("/repo/src/foo.ts");
  });

  it("resolves a path-form citation by joining a searchRoot when not at repoRoot", () => {
    const c: Citation = {
      raw: "store/index.ts:1",
      pathOrBase: "store/index.ts",
      startLine: 1,
      endLine: 1,
    };
    const out = resolveCitation(c, makeCtx({ existing: new Set(["/repo/src/store/index.ts"]) }));
    expect(out?.replace(/\\/g, "/")).toBe("/repo/src/store/index.ts");
  });

  it("returns null for a path-form citation that doesn't exist anywhere", () => {
    const c: Citation = {
      raw: "nope/missing.ts:1",
      pathOrBase: "nope/missing.ts",
      startLine: 1,
      endLine: 1,
    };
    expect(resolveCitation(c, makeCtx({}))).toBeNull();
  });
});

describe("synthetic drift detection (positive matcher self-test)", () => {
  it("flags a citation to a nonexistent file as unresolved", () => {
    const doc = "Old reference: nonexistent-file.ts:99999.";
    const cites = extractCitations(doc);
    expect(cites).toHaveLength(1);
    const ctx = {
      repoRoot: "/repo",
      searchRoots: ["src"],
      basenameIndex: new Map<string, string[]>(),
      exists: (_p: string) => false,
    };
    const resolved = resolveCitation(cites[0], ctx);
    expect(resolved).toBeNull();
  });
});

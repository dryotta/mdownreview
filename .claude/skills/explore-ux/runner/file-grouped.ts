// One-shot: file grouped GitHub issues from an existing findings.jsonl.
// Usage:
//   tsx file-grouped.ts <runDir> [--dry-run]
//
// Reuses the same grouping + body rendering as the REPL's file_issues act.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileGroupedIssue, type GroupedFinding } from "./issues";
import { loadStore, saveStore } from "./dedupe";

interface FindingRecord {
  ts: string; step: number; heuristic_id: string;
  severity: "P1" | "P2" | "P3";
  anchor: string; detail: string; screenshot: string; status: string;
  group?: string; key: string;
}

function inferGroup(heuristicId: string): string {
  if (/TABSTRIP|TOOLBAR|VIEWER-HSCROLL|SQUEEZED|HEADER-CLIPPED|TAB-SCROLL/i.test(heuristicId))
    return "responsive-layout";
  if (heuristicId.startsWith("WCAG-") || /A11Y|FOCUS|CONTRAST/i.test(heuristicId))
    return "accessibility";
  if (heuristicId === "NIELSEN-N4" || /MODAL|DIALOG/i.test(heuristicId))
    return "modal-ux";
  if (heuristicId === "AP-EMOJI-AS-ICON" || /TITLE|EMOJI|ICON/i.test(heuristicId))
    return "visual-polish";
  if (heuristicId === "MDR-CONSOLE-ERROR" || heuristicId === "MDR-IPC-RAW-JSON-ERROR")
    return "errors";
  return "misc";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const runDir = args.find((a) => !a.startsWith("--"));
  if (!runDir) {
    console.error("Usage: tsx file-grouped.ts <runDir> [--dry-run]");
    process.exit(2);
  }
  const findingsPath = join(runDir, "findings.jsonl");
  if (!existsSync(findingsPath)) {
    console.error(`No findings.jsonl at ${findingsPath}`);
    process.exit(2);
  }
  const recs: FindingRecord[] = readFileSync(findingsPath, "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const newRecs = recs.filter((r) => r.status === "NEW");

  const buckets = new Map<string, GroupedFinding[]>();
  for (const r of newRecs) {
    const groupKey = r.group ?? inferGroup(r.heuristic_id);
    const arr = buckets.get(groupKey) ?? [];
    arr.push({
      heuristic_id: r.heuristic_id, severity: r.severity, anchor: r.anchor,
      detail: r.detail, screenshot: r.screenshot, step: r.step,
      reproductions: 1, firstSeen: r.ts,
    });
    buckets.set(groupKey, arr);
  }

  const SEV_RANK = { P1: 0, P2: 1, P3: 2 } as const;
  const runId = runDir.replace(/.*[\\/]/, "");
  const storePath = ".claude/explore-ux/known-findings.json";
  const store = loadStore(storePath);

  console.log(`\n${dryRun ? "[DRY-RUN] " : ""}Filing ${buckets.size} grouped issue(s) from ${newRecs.length} NEW finding(s):\n`);

  for (const [group, findings] of buckets) {
    findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    try {
      const r = await fileGroupedIssue({ group, runId, findings }, { dryRun });
      console.log(`  [${r.severity}] ${r.title}`);
      console.log(`         status=${r.status}${r.issue ? `, issue=#${r.issue}` : ""}${r.url ? `, url=${r.url}` : ""}`);
      if (r.status === "filed" && r.issue !== undefined) {
        for (const rec of newRecs) {
          const groupKey = rec.group ?? inferGroup(rec.heuristic_id);
          if (groupKey !== group) continue;
          const stored = store.findings[rec.key];
          if (stored && stored.issue === null) stored.issue = r.issue;
        }
      }
    } catch (e) {
      console.error(`  [FAIL] ${group}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!dryRun) {
    saveStore(storePath, store);
    console.log("\nDedupe store updated.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

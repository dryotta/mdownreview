import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceBundle } from "./explore";
import type { MergeResult } from "./dedupe";

export function writeEvidenceLine(runDir: string, b: EvidenceBundle): void {
  mkdirSync(runDir, { recursive: true });
  appendFileSync(join(runDir, "evidence.jsonl"), JSON.stringify({
    step: b.step,
    ts: b.ts,
    flow: b.flow,
    action: b.action,
    screen_id: b.screenId,
    screenshot: b.screenshot,
    dom_snapshot_sha: b.domSnapshotSha,
    console_diff: b.snapshot.console,
    ipc_errors: b.snapshot.ipc_errors,
    rule_hits: b.rule_hits,
  }) + "\n");
}

export interface ReportInput {
  runId: string;
  runDir: string;
  startedAt: string;
  finishedAt: string;
  visionEnabled: boolean;
  dryRun: boolean;
  bundles: EvidenceBundle[];
  merges: { bundle: EvidenceBundle; hit: { id: string; detail: string; anchor: string }; merge: MergeResult }[];
}

export function writeReport(input: ReportInput): string {
  const newCount = input.merges.filter((m) => m.merge.status === "NEW").length;
  const reproCount = input.merges.filter((m) => m.merge.status === "REPRODUCED").length;
  const md = [
    `# explore-ux run ${input.runId}`,
    ``,
    `- Started:  ${input.startedAt}`,
    `- Finished: ${input.finishedAt}`,
    `- Steps:    ${input.bundles.length}`,
    `- Vision:   ${input.visionEnabled ? "on" : "off"}`,
    `- Mode:     ${input.dryRun ? "DRY-RUN" : "FILE"}`,
    `- Findings: ${newCount} new, ${reproCount} reproduced`,
    ``,
    `## New findings`,
    ``,
    `| Heuristic | Severity | Screen | Anchor | Screenshot |`,
    `|---|---|---|---|---|`,
    ...input.merges
      .filter((m) => m.merge.status === "NEW")
      .map((m) => `| ${m.hit.id} | — | ${m.bundle.screenId} | \`${m.hit.anchor}\` | ${m.bundle.screenshot} |`),
    ``,
    `## Reproduced findings`,
    ``,
    `| Heuristic | Screen | Reproductions |`,
    `|---|---|---|`,
    ...input.merges
      .filter((m) => m.merge.status === "REPRODUCED")
      .map((m) => `| ${m.hit.id} | ${m.bundle.screenId} | (see known-findings.json) |`),
    ``,
  ].join("\n");
  const path = join(input.runDir, "report.md");
  writeFileSync(path, md);
  return path;
}

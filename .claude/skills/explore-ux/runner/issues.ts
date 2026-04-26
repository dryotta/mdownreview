import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface IssueInput {
  heuristic_id: string;
  heuristic_file: string;
  severity: "P1" | "P2" | "P3";
  reproSteps: string[];
  screenshot: string;
  consoleSnippet?: string;
  a11ySnippet?: string;
  domAnchor: string;
  suggestion: string;
  runId: string;
  step: number;
  reproductions: number;
  firstSeen: string;
}

export function renderIssueBody(i: IssueInput): string {
  const lines = [
    `## Heuristic`,
    `**${i.heuristic_id}** — see \`${i.heuristic_file}\``,
    ``,
    `## Severity`,
    `**${i.severity}**`,
    ``,
    `## Reproduction`,
    ...i.reproSteps.map((s, idx) => `${idx + 1}. ${s}`),
    ``,
    `## Evidence`,
    `![step-${i.step}](${i.screenshot})`,
    ``,
    `**DOM anchor:** \`${i.domAnchor}\``,
  ];
  if (i.consoleSnippet) lines.push(`**Console:** \`${i.consoleSnippet}\``);
  if (i.a11ySnippet)    lines.push(`**A11y:** ${i.a11ySnippet}`);
  lines.push(
    ``,
    `## Suggested direction`,
    i.suggestion,
    ``,
    `## Run`,
    `explore-ux run id: \`${i.runId}\`, step ${i.step}`,
    `Reproduced ${i.reproductions}× since ${i.firstSeen}.`,
  );
  return lines.join("\n");
}

export type GhExec = (args: string[]) => Promise<string>;

export const realGh: GhExec = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.once("exit", (code) => code === 0 ? resolve(out) : reject(new Error(err || `gh exit ${code}`)));
  });

export async function fileIssue(
  i: IssueInput,
  opts: { dryRun: boolean; gh?: GhExec },
): Promise<{ status: "dry-run" | "filed"; issue?: number; url?: string }> {
  if (opts.dryRun) return { status: "dry-run" };
  const gh = opts.gh ?? realGh;
  const body = renderIssueBody(i);
  const tmp = mkdtempSync(join(tmpdir(), "ux-issue-"));
  const bodyPath = join(tmp, "body.md");
  writeFileSync(bodyPath, body);
  const labels = ["explore-ux", "needs-grooming", `severity-${i.severity.toLowerCase()}`];
  const isUx = i.heuristic_id.startsWith("NIELSEN-") || i.heuristic_id.startsWith("AP-")
    || i.heuristic_id.startsWith("WCAG-");
  labels.push(isUx ? "ux" : "bug");
  const args = [
    "issue", "create",
    "--title", `[explore-ux] ${i.heuristic_id}: ${i.reproSteps[i.reproSteps.length - 1] ?? "issue"}`,
    "--body-file", bodyPath,
    ...labels.flatMap((l) => ["--label", l]),
    "--json", "number,html_url",
  ];
  const out = await gh(args);
  try {
    const parsed = JSON.parse(out);
    return { status: "filed", issue: parsed.number, url: parsed.html_url };
  } catch {
    const m = /\/issues\/(\d+)/.exec(out);
    return { status: "filed", issue: m ? +m[1] : undefined, url: out.trim() };
  }
}

export interface GroupedFinding {
  heuristic_id: string;
  severity: "P1" | "P2" | "P3";
  anchor: string;
  detail: string;
  screenshot: string;
  step: number;
  reproductions: number;
  firstSeen: string;
}

export interface GroupedIssueInput {
  group: string;
  runId: string;
  findings: GroupedFinding[];
}

const SEV_RANK: Record<"P1" | "P2" | "P3", number> = { P1: 0, P2: 1, P3: 2 };

function humaniseGroup(g: string): string {
  return g.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function renderGroupedIssueBody(g: GroupedIssueInput): string {
  const sevList = Array.from(new Set(g.findings.map((f) => f.severity)))
    .sort((a, b) => SEV_RANK[a] - SEV_RANK[b]);
  const lines: string[] = [
    `## Summary`,
    `${g.findings.length} related finding(s) surfaced by explore-ux run \`${g.runId}\`.`,
    `Severity mix: ${sevList.join(", ")}.`,
    ``,
    `## Findings`,
    ``,
  ];
  g.findings.forEach((f, idx) => {
    lines.push(
      `### ${idx + 1}. \`${f.heuristic_id}\` — ${f.severity}`,
      ``,
      `**DOM anchor:** \`${f.anchor}\``,
      ``,
      f.detail,
      ``,
      `![step-${f.step}](${f.screenshot})`,
      ``,
      `_First seen ${f.firstSeen}, reproduced ${f.reproductions}× at step ${f.step}._`,
      ``,
    );
  });
  lines.push(
    `## Run`,
    `explore-ux run id: \`${g.runId}\``,
    ``,
    `_Filed automatically by the explore-ux skill. Each \`### N.\` block is a separate finding sharing the \`${g.group}\` group tag — split into individual issues during grooming if they need independent fixes._`,
  );
  return lines.join("\n");
}

export function topSeverity(findings: GroupedFinding[]): "P1" | "P2" | "P3" {
  return findings.reduce<"P1" | "P2" | "P3">(
    (acc, f) => (SEV_RANK[f.severity] < SEV_RANK[acc] ? f.severity : acc),
    "P3",
  );
}

export async function fileGroupedIssue(
  g: GroupedIssueInput,
  opts: { dryRun: boolean; gh?: GhExec },
): Promise<{ status: "dry-run" | "filed"; issue?: number; url?: string; title: string; severity: "P1" | "P2" | "P3" }> {
  const sev = topSeverity(g.findings);
  const heuristics = Array.from(new Set(g.findings.map((f) => f.heuristic_id)));
  const heuristicSnippet = heuristics.length <= 3
    ? heuristics.join(", ")
    : `${heuristics.slice(0, 3).join(", ")} (+${heuristics.length - 3} more)`;
  const title =
    `[explore-ux] ${humaniseGroup(g.group)} — ${g.findings.length} finding(s) (${heuristicSnippet})`;
  if (opts.dryRun) return { status: "dry-run", title, severity: sev };
  const gh = opts.gh ?? realGh;
  const body = renderGroupedIssueBody(g);
  const tmp = mkdtempSync(join(tmpdir(), "ux-issue-"));
  const bodyPath = join(tmp, "body.md");
  writeFileSync(bodyPath, body);
  const labels = ["explore-ux", "needs-grooming", `severity-${sev.toLowerCase()}`];
  const isUx = heuristics.every((h) =>
    h.startsWith("NIELSEN-") || h.startsWith("AP-") || h.startsWith("WCAG-"));
  labels.push(isUx ? "ux" : "bug");
  const args = [
    "issue", "create",
    "--title", title,
    "--body-file", bodyPath,
    ...labels.flatMap((l) => ["--label", l]),
    "--json", "number,html_url",
  ];
  const out = await gh(args);
  try {
    const parsed = JSON.parse(out);
    return { status: "filed", issue: parsed.number, url: parsed.html_url, title, severity: sev };
  } catch {
    const m = /\/issues\/(\d+)/.exec(out);
    return { status: "filed", issue: m ? +m[1] : undefined, url: out.trim(), title, severity: sev };
  }
}

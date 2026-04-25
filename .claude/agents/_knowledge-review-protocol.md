---
description: Shared protocol — review agents dispatch one subagent per knowledge file. Not invocable as an agent (leading underscore).
---

# Knowledge-File Review Protocol

> This file is a **shared reference**, not an invocable agent. The leading underscore in the filename signals it should never be loaded as an agent.

Every **review** agent (architect, bug-hunter, documentation, lean, performance, product-improvement, react-tauri, security, test, ux) follows this protocol when consulting knowledge files (the `docs/best-practices-*` files and the foundational deep-dives in `docs/`). The goal is to keep each review pass uncontaminated by content from sibling rule sets.

> **Scope:** review agents only. Execution agents (`task-implementer`, `e2e-test-writer`, `goal-assessor`, `implementation-validator`) read the doc that governs the file they are touching directly and do NOT use this protocol.

## The protocol

For each knowledge file the agent's frontmatter declares it consults:

1. **Dispatch a subagent** (one per knowledge file). The subagent is given:
   - That ONE knowledge file (path).
   - The diff or the code under review.
   - No other knowledge files. No sibling rule sets. No charter overview.
2. **Subagent task:** read the knowledge file and the diff; report findings citing rules from THAT file only, in the form `violates rule <rule-id> in <path>`.
3. **Parent aggregates:** dedupe findings, identify root causes that span multiple knowledge files, surface cross-doc patterns the subagents could not see, and produce the final report.

## Rules of engagement

- **Always dispatch.** Even when only one knowledge file applies. The pattern is uniform; no thresholds. This keeps protocol overhead predictable and avoids "I'll just read it myself" drift.
- **Single level only.** A subagent does NOT dispatch its own sub-subagents. If a knowledge file references a sibling, the parent dispatches a separate subagent for the sibling instead.
- **No charter peeking.** Subagents do NOT read `principles.md` or other deep-dives unless that deep-dive is the knowledge file they were dispatched against.
- **Findings are citation-bound.** Every subagent finding MUST cite a rule id (or category slug) from the assigned knowledge file. Findings that cannot be cited from the assigned file MUST be discarded by the subagent and re-raised by the parent if still warranted.
- **Aggregation is the parent's responsibility.** The parent dedupes overlapping findings, identifies cross-doc cycles (e.g. a rerender bug AND a selector bug pointing at the same hook), and writes the final review.

## Why this matters

- **No cross-contamination:** a subagent reading only `rerender-optimization.md` will not invent a "this also violates the security rule about path canonicalization" finding because it has never seen that rule.
- **Predictable cost:** the parent knows exactly how many subagents will be dispatched per pass.
- **Citation discipline:** every finding has a verifiable rule reference; reviews stop being vibes-driven.

## Example

A `performance-expert` review of a diff touching `MarkdownViewer.tsx` declares it consults:

- `docs/performance.md`
- `docs/best-practices-common/react/rerender-optimization.md`
- `docs/best-practices-common/react/rendering-performance.md`
- `docs/best-practices-common/general/javascript-performance.md`
- `docs/best-practices-common/vite/bundle-hygiene.md`
- `docs/best-practices-project/hot-paths.md`

The parent dispatches **six** subagents (one per file). Each receives the diff and exactly one of those files. The parent aggregates the six reports into the final review.

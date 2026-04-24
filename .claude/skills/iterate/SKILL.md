---
name: iterate
description: Autonomous iteration loop on a single branch and single PR. Accepts a GitHub issue number (or #N / issue-N / issue URL) for issue mode, no-args to auto-pick the oldest groomed issue, or free text for goal mode. Runs up to 30 rebase → assess → plan → implement → validate → 6-expert review iterations, forward-fixing all failures. On success, validates via Release Gate before marking the PR ready. Supersedes implement-issue, self-improve-loop, and start-feature.
---

# Iterate

Runs **one** autonomous iteration loop against **one branch and one PR** until the goal is achieved, the iteration cap is hit, or a terminal block is reached:
pre-flight → branch → draft PR → for each iteration { rebase → assess → pre-consult → plan → implement → validate (push + CI + local, forward-fix) → expert review → record } → on Done-Achieved, release-gate validation → mark PR ready.

**Fully autonomous after the skill starts — no user interaction.**

**RIGID. Follow every step exactly.**

## Product charter (governs every iteration)

Every change must respect the product charter. Before editing a domain, skim the relevant deep-dive:

- **Charter (always):** [`docs/principles.md`](../../../docs/principles.md) — 5 pillars (Professional, Reliable, Performant, Lean, Architecturally Sound) + 3 meta-principles (Rust-First with MVVM, Never Increase Engineering Debt, Zero Bug Policy).
- [`docs/architecture.md`](../../../docs/architecture.md) — IPC/logger chokepoints, Zustand boundaries, file-size budgets.
- [`docs/performance.md`](../../../docs/performance.md) — numeric budgets, watcher rules, render-cost rules.
- [`docs/security.md`](../../../docs/security.md) — IPC surface, CSP, atomic writes, path canonicalization.
- [`docs/design-patterns.md`](../../../docs/design-patterns.md) — React 19 + Tauri v2 idioms.
- [`docs/test-strategy.md`](../../../docs/test-strategy.md) — three-layer pyramid, coverage floors, mock hygiene.

The assessor, the pre-consult experts, and the 6-expert diff review all cite specific rule numbers. An iteration that violates a rule from a deep-dive is blocked at review even if all tests are green.

## Input

One optional argument. The skill detects mode deterministically:

| Argument | Mode |
|---|---|
| (empty) | Issue mode — auto-pick oldest open `groomed` issue |
| `42` | Issue mode, issue #42 |
| `#42` | Issue mode, issue #42 |
| `issue-42` (case-insensitive) | Issue mode, issue #42 |
| `https://github.com/<owner>/<repo>/issues/42[…]` | Issue mode, issue #42 |
| anything else | Goal mode, argument used verbatim as the goal text (outer quotes stripped) |

---

## Phase 0 — Setup (runs once per invocation)

### 0a. Parse the argument and decide mode

Let `ARG` be the entire string after the skill name, trimmed.

Apply these rules in order; the first match wins:

1. `ARG` empty → `MODE=issue`, auto-pick (see 0c).
2. `ARG` matches `^\d+$` → `MODE=issue`, `ISSUE_NUMBER=$ARG`.
3. `ARG` matches `^#(\d+)$` → `MODE=issue`, `ISSUE_NUMBER=<group 1>`.
4. `ARG` matches `^[Ii]ssue-(\d+)$` → `MODE=issue`, `ISSUE_NUMBER=<group 1>`.
5. `ARG` matches `^https?://github\.com/[^/]+/[^/]+/issues/(\d+)([/#?].*)?$` → `MODE=issue`, `ISSUE_NUMBER=<group 1>`.
6. Otherwise → `MODE=goal`, `GOAL_TEXT=<ARG with surrounding quotes stripped>`.

### 0b. Pre-flight (parallel)

Run in parallel:
```bash
git status --porcelain
git branch --show-current
git rev-parse HEAD
```

- **Dirty working tree** → STOP: `[iterate] Working tree is dirty. Commit or stash changes first.`
- **Not on `main`** → `git checkout main && git pull --ff-only` (no halt).

### 0c. Issue-mode auto-pick (only when 0a rule 1 matched)

```bash
gh issue list --label "groomed" --state open --json number,title,body,labels --limit 100 \
  | jq 'sort_by(.number) | .[0]'
```

If nothing returned, STOP: `[iterate] No groomed issues found. Run /groom-issues first, or call /iterate with a goal.`
Otherwise, set `ISSUE_NUMBER=<number from JSON>`.

### 0d. Issue-mode-only: load the spec

```bash
gh issue view $ISSUE_NUMBER --json number,title,body,labels,comments
```

Find the comment whose body begins with `<!-- mdownreview-spec -->` and capture its full body as `SPEC_MARKDOWN`. If no such comment, STOP:
`[iterate] #$ISSUE_NUMBER has no spec. Run /groom-issues $ISSUE_NUMBER first.`

Capture: `ISSUE_TITLE`, `ISSUE_BODY`, `SPEC_MARKDOWN`, `ACCEPTANCE_CRITERIA` (parsed `- [ ]` / `- [x]` checklist items from the spec).

### 0e. Compute branch, PR title, and goal-for-assessor

| Variable | Issue mode | Goal mode |
|---|---|---|
| `BRANCH` | `feature/issue-$ISSUE_NUMBER-<3–5-word kebab slug of $ISSUE_TITLE>` | `auto-improve/<slug of $GOAL_TEXT, 40-char cap>-$(date +%Y%m%d)` |
| `PR_TITLE` | `feat: implement #$ISSUE_NUMBER — $ISSUE_TITLE` | `auto-improve: $GOAL_TEXT` |
| `GOAL_FOR_ASSESSOR` | `Satisfy all acceptance criteria of #$ISSUE_NUMBER: $ISSUE_TITLE` | `$GOAL_TEXT` |
| `PR_CLOSE_TRAILER` | `Closes #$ISSUE_NUMBER` | (omit) |

Slug rules: lowercase, non-alphanumerics → `-`, collapse runs of `-`, trim leading/trailing `-`.

### 0f. Create branch and draft PR

```bash
git checkout main && git pull --ff-only
git checkout -b "$BRANCH"
```

If `$BRANCH` already exists (local OR remote), STOP:
`[iterate] Branch $BRANCH already exists. Delete it or pick a different invocation — resume is not supported.`
Do NOT delete it — a pre-existing branch may hold human work.

```bash
git commit --allow-empty -m "chore(iterate): start — $GOAL_FOR_ASSESSOR"
git push -u origin HEAD

# rerere caches conflict resolutions across future rebases
git config rerere.enabled true
git config rerere.autoupdate true
```

Build `PR_BODY`:
- Issue mode: header links to the issue, full `ACCEPTANCE_CRITERIA` checklist is pasted (unchecked initially; assessor ticks as it satisfies items), trailer line is `Closes #$ISSUE_NUMBER`.
- Goal mode: header quotes the goal text; empty progress list.

```bash
gh pr create --draft --title "$PR_TITLE" --body "$PR_BODY"
```

Capture `PR_NUMBER` and `PR_URL` from the output.

### 0g. Initialise the state file

Write `.claude/iterate-state.md`:

```markdown
---
mode: <issue | goal>
goal: "<GOAL_FOR_ASSESSOR>"
issue_number: <ISSUE_NUMBER or null>
started_at: <ISO datetime>
branch: <BRANCH>
pr: <PR_URL>
pr_number: <PR_NUMBER>
iteration_cap: 30
---
# Iteration Log
```

### 0h. Print start banner

```
[iterate] Mode: <MODE> | Goal: <GOAL_FOR_ASSESSOR>
Branch: <BRANCH> | PR: <PR_URL>
Starting autonomous loop — cap 30 iterations. No further interaction needed.
```

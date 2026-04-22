---
name: self-improve
description: One cycle of the mdownreview self-improvement loop. Reviews the codebase (or uses a cached review), picks the top unimplemented quick win, implements it on a feature branch, validates with tests, and commits if clean. Run via /loop to make the app self-improving.
---

# Self-Improve — One Development Cycle

**This skill is RIGID. Follow every step exactly. Do not skip or reorder.**

This skill runs one complete improvement cycle: review → pick task → branch → implement → validate → commit. Pair with `/loop 2h /self-improve` for continuous autonomous improvement.

---

## Step 1 — Safety pre-flight

Run in parallel:
```bash
git status --porcelain
git branch --show-current
```

**If working tree is dirty**: STOP. Print:
```
[self-improve] Skipping cycle — working tree is dirty. Commit or stash changes first.
```
Then exit the skill.

**If on a branch that starts with `auto-improve/`**: you are already on an improvement branch from a previous (possibly failed) cycle. Run `git checkout main` before continuing.

---

## Step 2 — Load the improvement backlog

Read `.claude/self-improve-log.md`. If it does not exist, treat it as empty.

This file tracks every task ever attempted:
- `DONE` — implemented, tested, committed
- `FAILED` — implemented but tests failed (do not retry automatically)
- `SKIPPED` — out of scope or too risky for auto-mode

Extract the list of task IDs already attempted (any status).

---

## Step 3 — Get the task list (use cache if fresh)

Check if `.claude/self-improve-cache.md` exists and read its `generated_at` frontmatter field.

**Cache is FRESH** if generated within the last 24 hours (compare to current date/time).

### If cache is FRESH:
Read `.claude/self-improve-cache.md` and extract the Quick Wins list and Priority 1 list. Skip to Step 4.

### If cache is STALE or missing:
Run a fresh expert review. Spawn ALL 6 agents in parallel (single message, 6 Agent tool calls):

**Agent 1 — product-improvement-expert:**
```
subagent_type: product-improvement-expert
prompt: "Review mdownreview for product improvement opportunities. Read src/App.tsx, src/store/index.ts, src/components/viewers/ViewerRouter.tsx, src/components/comments/CommentsPanel.tsx, src/hooks/useFileContent.ts. Produce your Product Improvement Report. Focus especially on Quick Wins that can be implemented in under an hour."
```

**Agent 2 — performance-expert:**
```
subagent_type: performance-expert
prompt: "Review mdownreview for performance issues. Read src-tauri/src/watcher.rs, src-tauri/src/commands.rs, src/hooks/useFileContent.ts, src/hooks/useFileWatcher.ts, src/store/index.ts. Produce your Performance Analysis Report. Mark any issue fixable in under 1 hour as a Quick Win."
```

**Agent 3 — architect-expert:**
```
subagent_type: architect-expert
prompt: "Review mdownreview architecture. Read src/store/index.ts, src/lib/tauri-commands.ts, src-tauri/src/commands.rs, src/App.tsx, and all files in src/hooks/. Produce your Architecture Review. Flag any Quick Wins (small, safe, self-contained fixes under 1 hour)."
```

**Agent 4 — react-tauri-expert:**
```
subagent_type: react-tauri-expert
prompt: "Review mdownreview for React 19 and Tauri v2 API issues. Read all files in src/hooks/, src/lib/tauri-commands.ts, src-tauri/src/commands.rs, src-tauri/src/lib.rs. Also grep for invoke( and listen( in src/. Produce your React 19 + Tauri v2 Expert Review. Mark Quick Wins clearly."
```

**Agent 5 — ux-expert:**
```
subagent_type: ux-expert
prompt: "Review mdownreview UX. Read src/App.tsx, src/components/comments/CommentsPanel.tsx, src/components/comments/CommentInput.tsx, src/components/comments/SelectionToolbar.tsx, src/components/viewers/ViewerToolbar.tsx, src/components/WelcomeView.tsx. Grep for tabIndex and aria- across src/. Produce your UX Review with Top 3 Quick Wins."
```

**Agent 6 — bug-hunter:**
```
subagent_type: bug-hunter
prompt: "Hunt for bugs in mdownreview. Read all files in src/hooks/, src/lib/comment-anchors.ts, src/lib/comment-matching.ts, src/lib/tauri-commands.ts, src-tauri/src/commands.rs. Grep for listen( in src/ and check for missing unlisten() cleanup. Produce your Bug Hunt Report."
```

After all 6 return, synthesize the consolidated task list and write `.claude/self-improve-cache.md`:

```markdown
---
generated_at: [ISO 8601 datetime]
---

# Expert Review Cache

## Quick Wins (auto-implementable, < 1 hour each)
<!-- Format: QW-001, QW-002, etc. -->

| ID | Task | Expert | Files | Risk |
|----|------|--------|-------|------|
| QW-001 | [one-sentence task] | [expert name] | [file1, file2] | low/medium |
...

## Priority 1 — Bugs & Critical Gaps
| ID | Task | Expert | Files | Risk |
...

## Priority 2 — Friction & Design
| ID | Task | Expert | Files | Risk |
...

## Expert Consensus (flagged by 2+ experts)
[List of IDs]
```

**Auto-mode scope rules** — only Quick Wins with risk=`low` are eligible for automatic implementation. Never auto-implement:
- Anything touching `src-tauri/tauri.conf.json` or capability/permissions config
- Anything touching `.claude/` directory
- Anything described as "refactor" without a clear atomic change
- Any task requiring new dependencies (`npm install`, `cargo add`)
- Any task touching auth, file deletion, or process execution

---

## Step 4 — Select the next task

From the Quick Wins table in the cache, find the first row where:
- Risk = `low`
- ID is NOT in the attempted list from the log (Step 2)

If no Quick Wins remain, look at Priority 1 items with risk=`low`.

If nothing is eligible, print:
```
[self-improve] No eligible auto-implementable tasks remain.
All quick wins have been attempted. Run /expert-review to get a fresh plan,
or promote a Priority 2 task manually.
```
Then exit.

Record the selected task:
- **Task ID**: e.g., `QW-003`
- **Task**: one-sentence description
- **Expert**: which expert recommended it
- **Files**: which files to read/modify

---

## Step 5 — Create a feature branch

```bash
git checkout -b auto-improve/[YYYYMMDD]-[short-slug]
```

Where `short-slug` is 3-4 words from the task, hyphenated, lowercase. Example:
`auto-improve/20260422-fix-unlisten-cleanup`

---

## Step 6 — Implement the task

Spawn a `task-implementer` agent:

```
subagent_type: task-implementer
prompt: "Implement this task for mdownreview:

**Task ID**: [ID]
**Task**: [one-sentence description]
**Expert context**: [the expert's original finding — why this matters]
**Files to read**: [comma-separated file list]

Implement the task, then return your Implementation Summary."
```

Wait for the implementer to complete. Save its Implementation Summary.

---

## Step 7 — Validate

Spawn an `implementation-validator` agent:

```
subagent_type: implementation-validator
prompt: "Validate the implementation of task [ID] in mdownreview.

The implementer changed: [list of files from Implementation Summary]

Run the full validation sequence (TypeScript, unit tests, lint, scope check) and return your Validation Report."
```

Wait for the result.

---

## Step 8 — Commit or abort

### If Validation Report says COMMIT:

```bash
git add [changed files from implementer summary — specific files only, never git add -A]
git commit -m "auto-improve: [task one-liner]

Expert: [expert name]
Task ID: [ID]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Then update `.claude/self-improve-log.md` by appending:

```markdown
## [ID] — DONE
- **Date**: [ISO date]
- **Branch**: [branch name]
- **Task**: [task description]
- **Expert**: [expert name]
- **Commit**: [git commit hash]
- **Validation**: All checks passed
```

Print:
```
[self-improve] ✓ Cycle complete.
  Task: [ID] — [task description]
  Branch: [branch name]
  Commit: [hash]
  
  To review and merge: git checkout main && git merge [branch]
  To discard: git checkout main && git branch -D [branch]
```

### If Validation Report says DO NOT COMMIT:

Do NOT commit. Run:
```bash
git checkout main
git branch -D [branch name]
```

Update `.claude/self-improve-log.md` by appending:

```markdown
## [ID] — FAILED
- **Date**: [ISO date]
- **Task**: [task description]
- **Failure reason**: [from Validation Report]
- **Note**: Branch discarded. Fix manually or skip.
```

Print:
```
[self-improve] ✗ Cycle ended without commit.
  Task: [ID] — [task description]
  Reason: [validation failure reason]
  
  The branch was discarded. To implement manually, pick up task [ID] from the cache.
```

---

## Cycle summary table

At the end of every cycle (pass or fail), print a one-line status table:

```
┌─────────────────────────────────────────────────────────┐
│ SELF-IMPROVE CYCLE COMPLETE                             │
│ Task: [ID] [task]                    Status: DONE/FAILED│
│ Quick wins remaining: [N]            Cache age: [Xh]    │
│ Next cycle: run /self-improve again or /loop Xh /self-improve │
└─────────────────────────────────────────────────────────┘
```

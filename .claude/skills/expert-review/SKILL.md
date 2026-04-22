---
name: expert-review
description: Orchestrates all mdownreview expert agents in parallel to review the codebase and open GitHub issues, then synthesizes findings into a prioritized improvement plan.
---

# Expert Review Skill

You are orchestrating a multi-expert review of the mdownreview codebase. Run all experts in parallel, collect their findings, then synthesize a single prioritized improvement plan.

**This skill is RIGID. Follow each step exactly.**

## Step 1 — Gather context (do this BEFORE spawning agents)

Run these in parallel:

```bash
# GitHub issues
gh issue list --limit 30 --json number,title,body,labels,state 2>/dev/null || echo "No GitHub issues available"

# Recent commits (last 2 weeks of work)
git --no-pager log --since="2 weeks ago" --pretty=format:"%h %s" | head -30

# Current file counts by area
find src/ -name "*.tsx" -o -name "*.ts" | grep -v __tests__ | grep -v ".test." | wc -l
find src-tauri/src/ -name "*.rs" | wc -l
```

Save the output — you'll include it in every agent prompt.

## Step 2 — Spawn all 6 experts IN PARALLEL (single message, 6 Agent calls)

Send all 6 Agent tool calls in the same message. Each agent prompt must be self-contained.

### Agent 1: Product Improvement Expert
```
subagent_type: product-improvement-expert
prompt: "Review the mdownreview codebase for product improvement opportunities.

Context from recent work:
[INSERT GIT LOG OUTPUT]

Open GitHub issues:
[INSERT GH ISSUES OUTPUT OR "none"]

Read these files to do your analysis:
- src/App.tsx
- src/store/index.ts  
- src/components/viewers/ViewerRouter.tsx
- src/components/comments/CommentsPanel.tsx
- src/components/comments/CommentInput.tsx
- src/hooks/useFileContent.ts

Then produce your Product Improvement Report as specified in your instructions."
```

### Agent 2: Performance Expert
```
subagent_type: performance-expert
prompt: "Review the mdownreview codebase for performance issues.

Context from recent work:
[INSERT GIT LOG OUTPUT]

Read these files:
- src-tauri/src/watcher.rs
- src-tauri/src/commands.rs
- src/hooks/useFileContent.ts
- src/hooks/useFileWatcher.ts
- src/store/index.ts
- src/components/viewers/MarkdownViewer.tsx (if it exists, else check ViewerRouter.tsx)

Then produce your Performance Analysis Report."
```

### Agent 3: Architect Expert
```
subagent_type: architect-expert
prompt: "Review the mdownreview architecture.

Context from recent work:
[INSERT GIT LOG OUTPUT]

Read these files:
- src/store/index.ts
- src/lib/tauri-commands.ts
- src-tauri/src/commands.rs
- src/App.tsx
- src/hooks/ (all files)

Then produce your Architecture Review."
```

### Agent 4: React + Tauri Expert
```
subagent_type: react-tauri-expert
prompt: "Review mdownreview for React 19 and Tauri v2 API usage issues.

Context from recent work:
[INSERT GIT LOG OUTPUT]

Read these files:
- src/hooks/ (all files)
- src/lib/tauri-commands.ts
- src-tauri/src/commands.rs
- src-tauri/src/lib.rs

Also search for raw invoke() and listen() calls:
Grep for 'invoke(' in src/
Grep for 'listen(' in src/

Then produce your React 19 + Tauri v2 Expert Review."
```

### Agent 5: UX Expert
```
subagent_type: ux-expert
prompt: "Review mdownreview's user experience.

Context from recent work:
[INSERT GIT LOG OUTPUT]

Open GitHub issues:
[INSERT GH ISSUES OUTPUT OR "none"]

Read these files:
- src/App.tsx
- src/components/comments/CommentsPanel.tsx
- src/components/comments/CommentInput.tsx
- src/components/comments/SelectionToolbar.tsx
- src/components/viewers/ViewerToolbar.tsx
- src/components/WelcomeView.tsx

Also grep for 'tabIndex', 'aria-', 'onKeyDown' across src/ to check keyboard accessibility.

Then produce your UX Review."
```

### Agent 6: Bug Hunter
```
subagent_type: bug-hunter
prompt: "Hunt for bugs in the mdownreview codebase.

Context from recent work:
[INSERT GIT LOG OUTPUT]

Read these files:
- src/hooks/ (all files — focus on useEffect cleanup and error handling)
- src/lib/comment-anchors.ts
- src/lib/comment-matching.ts
- src/lib/tauri-commands.ts
- src-tauri/src/commands.rs

Also grep for 'listen(' across src/ to check for missing unlisten() cleanup.

Then produce your Bug Hunt Report."
```

## Step 3 — Wait for all 6 agents to complete

Do not proceed until all 6 have returned results.

## Step 4 — Cross-reference with GitHub issues

For each open GitHub issue, check which expert's findings address it. Note any issues that no expert found a root cause for — these need manual investigation.

## Step 5 — Synthesize the Improvement Plan

Write a consolidated report structured as:

```markdown
# mdownreview Improvement Plan
Generated: [date]

## Executive Summary
[3-4 sentences covering the overall health of the app and top themes]

## GitHub Issues Status
| # | Title | Expert Findings | Status |
|---|-------|-----------------|--------|
| [num] | [title] | [which expert addressed it and how] | Addressed / Needs investigation |

## Priority 1 — Fix Now (bugs and critical gaps)
### [Issue title]
- **Found by**: [expert name(s)]
- **Location**: [file:line]
- **Impact**: [who is affected and how]
- **Fix**: [specific recommendation]

## Priority 2 — Improve Soon (friction and design issues)
[Same format]

## Priority 3 — Invest In (features and architecture)
[Same format]

## Quick Wins (< 1 hour each, high value)
1. [Action] — [file] — [expected improvement]
2.
3.

## Expert Consensus (issues flagged by 2+ experts)
[List items multiple experts independently flagged — these are highest-confidence issues]

## Recommended Sprint Plan
**This week**: [3-5 specific tasks]
**Next sprint**: [themes / larger investments]
**Backlog**: [things to keep an eye on]
```

Show the full report to the user. Do not truncate it.

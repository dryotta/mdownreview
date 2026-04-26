# Agentic Development Process

How `mdownreview` is built. Most code in this repo is delivered by AI agents driven from short, scenario-shaped prompts. This document explains the moving parts (skills + agents + the shared retrospective contract) and gives copy-pasteable prompts for the situations you actually hit day-to-day.

For the **rules** that govern what every agent must do, read [`AGENTS.md`](AGENTS.md) first. This document is about the **process** — when to invoke what, and how the pieces fit together.

---

## TL;DR

- **You write GitHub issues.** Issues are the only durable backlog.
- **`/iterate` drains the backlog.** It picks the next issue, plans, implements with TDD, runs tests, opens a PR, and writes a retrospective. Repeats forever in continuous mode.
- **`/test-exploratory-loop` dogfoods the live app** in parallel and files new bugs as issues, which `/iterate` then picks up.
- **Every terminal path writes a retrospective** and, if it found a process gap, files a self-improvement issue tagged `iterate-improvement` — closing the loop.
- **Agents** (architect-expert, security-expert, test-expert, …) are dispatched by skills as expert reviewers. You rarely call them directly.
- **Skills** (`run-build-test`, `validate-ci`, `publish-release`, …) are the verbs. You invoke skills.

---

## Map of the system

```
                         ┌──────────────────────────────┐
   you ─── prompt ───►   │  skill (verb, autonomous)    │
                         │  iterate · test-exploratory  │
                         │  groom-issues · run-build-…  │
                         └──────────────┬───────────────┘
                                        │ dispatches
                                        ▼
                         ┌──────────────────────────────┐
                         │  agents (expert reviewers)   │
                         │  architect · security · test │
                         │  bug · perf · react-tauri …  │
                         └──────────────┬───────────────┘
                                        │ findings
                                        ▼
                         ┌──────────────────────────────┐
                         │  GitHub: issues + PRs        │
                         │  (the only durable state)    │
                         └──────────────┬───────────────┘
                                        │ retrospective
                                        ▼
                         ┌──────────────────────────────┐
                         │  .claude/retrospectives/     │
                         │  → self-improve issue        │
                         │  → next /iterate run         │
                         └──────────────────────────────┘
```

---

## Skills (the verbs)

Skills live in `.claude/skills/<name>/SKILL.md`. They are stateful, multi-step workflows that the agent invokes when its triggers match.

| Skill | When | Autonomous? | Output |
|---|---|---|---|
| **`iterate`** | Drain the backlog, fix one issue, or pursue a freeform goal | ✅ never prompts | Branch + PR + retro |
| **`test-exploratory-e2e`** | One round of dogfood testing of the live app | ✅ never prompts | Findings report + filed issues + retro (Windows only) |
| **`test-exploratory-loop`** | Continuous dogfood in a loop; pairs with `iterate` | ✅ never prompts | Per-iteration digests + outer retro (Windows only) |
| **`groom-issues`** | Take a raw issue or `needs-grooming` backlog and make it executable | Phase A interactive · Phase B autonomous | Edited issue body + acceptance criteria + `groomed` label |
| **`run-build-test`** | Before a PR, after a rebase, "verify locally" | semi (you read the failures) | Pass/fail per gate, full failure output |
| **`validate-ci`** | A change needs CI/Release Gate to actually run | semi | Open `release/*` PR if missing |
| **`publish-release`** | Ship a new version (canary or stable) | semi | Tag + CHANGELOG bump |
| **`optimize-prompt`** | Author or edit a SKILL.md / agent / instruction block | semi | Rewritten prompt with token delta |

**The two backbone skills** are `iterate` and `test-exploratory-loop`. Run them in two separate terminals (or worktrees) and the codebase improves itself.

---

## Agents (the expert reviewers)

Agents live in `.claude/agents/<name>.md`. They are stateless, specialised reviewers. Skills (and you) dispatch them with a diff and they return findings cited against canonical knowledge files in `docs/`.

| Agent | Reviews |
|---|---|
| `architect-expert` | Layer separation, IPC chokepoints, store design, file-size budgets |
| `bug-expert` | Confirmed defects with reproductions (not "potential issues") |
| `documentation-expert` | Drift between code and docs; doc taxonomy |
| `lean-expert` | Bloat — fewer lines, fewer deps, fewer abstractions |
| `performance-expert` | Render bottlenecks, watcher/IPC cost, Shiki, large files |
| `product-expert` | UX, scope vs Non-Goals, alignment with five pillars |
| `react-tauri-expert` | React 19 + Tauri v2 idioms |
| `security-expert` | IPC handlers, FS access, markdown XSS |
| `test-expert` | Pyramid placement, oracle quality, mock hygiene |
| `exe-task-implementer` | Implements one scoped task — used by `iterate` |
| `exe-implementation-validator` | Runs the gate sequence; never fixes |
| `exe-goal-assessor` | Decides if a freeform goal's requirements are satisfied |

**Convention**: every reviewer cites a specific rule (`"violates rule 14 in docs/architecture.md"`). No hand-waving.

---

## The closed loop

The full loop, end to end:

1. **Issues land** in GitHub — from you, from `test-exploratory-loop`, or from a previous retrospective.
2. **`iterate` picks the next one** that doesn't have `needs-grooming`, `blocked`, or `iterate-in-progress`.
3. **If unclear**, `iterate` posts a clarifying comment and labels it `needs-grooming` (instead of asking you).
4. **Otherwise**, it plans → writes failing tests → implements → runs `run-build-test` → opens/updates the PR.
5. **Reviewer agents are dispatched** for the diff (architect, security, test, lean, …).
6. **Findings drive another pass** until the implementation passes the gates.
7. **Retrospective runs** ([`.claude/shared/retrospective.md`](.claude/shared/retrospective.md)):
   - **R1**: write a retro file noting what blocked or slowed the run.
   - **R2**: synthesise an improvement, dedupe against existing issues, file a new one labelled `iterate-improvement` + `self-improve:<skill>`.
8. **Outcome label**: `Done-Achieved`, `Done-Blocked` (`blocked` label), or `Done-TimedOut`.
9. **Loop continues**. The new self-improvement issue gets picked up by the next `iterate` cycle.

In parallel, `test-exploratory-loop` runs Playwright against the live binary, files new findings as `explore-ux`-tagged issues, and the same loop consumes them.

---

## Scenario-based prompts

Copy these directly. They're shaped so the right skill triggers without you having to name it.

### Daily driver

```
/iterate
```
Continuous mode. Drains the backlog (skipping `needs-grooming`/`blocked`), then polls every 5 minutes for 24 hours waiting for new issues. Just leave it running.

### Fix one specific issue

```
/iterate 142
```
or
```
work on issue #142
```
or paste the issue URL.

### Drain once and exit (CI-style)

```
/iterate --once
```

### Pursue a freeform goal (no issue)

```
/iterate add a CSV export action to the comments panel
```
The skill assesses with `exe-goal-assessor`, plans, implements, opens a PR.

### Dogfood the app continuously

In a second terminal/worktree:
```
/test-exploratory-loop
```
Default 50 iterations, syncs to `origin/main` between rounds. Pairs with `/iterate` running in the first terminal — you'll watch issues file themselves and get fixed without intervention.

### One exploration round (no loop)

```
explore the app for UX bugs
```
or
```
/test-exploratory-e2e
```

### Before opening a PR / after a rebase

```
verify it works locally
```
or
```
/run-build-test
```
Runs lint → build → cargo fmt → clippy → stage:cli → cargo test → vitest → Playwright browser → native E2E (Windows). Stops on first failure with full output.

### A raw issue needs to become executable

```
/groom-issues 87
```
or
```
groom the needs-grooming backlog
```
Phase A clarifies with you; Phase B runs autonomously across the rest of the queue.

### Ship a new version

```
/publish-release
```
or
```
ship a canary release
```

### CI didn't run on a feature branch

```
/validate-ci
```
Opens a `release/*` mirror PR so the Release Gate workflow attaches.

### Author or edit a skill / agent / instruction block

```
/optimize-prompt
```
Then paste the prompt text. The skill returns a tightened rewrite with a token delta.

### Direct expert review (rarely needed)

If you want a single agent to review staged changes:
```
have the security-expert review my staged changes
```
or
```
run the test-expert over this diff
```

---

## Two-terminal dogfood mode (recommended)

Open two terminals, each in its own git worktree (see `superpowers:using-git-worktrees`).

**Terminal A** — fix loop:
```
/iterate
```

**Terminal B** — explore loop:
```
/test-exploratory-loop --iterations 100
```

Watch:
- Terminal B files new bugs as `explore-ux` issues.
- Terminal A picks them up, fixes them, opens PRs.
- Both write retrospectives that feed `iterate-improvement` issues.
- Terminal A then picks up its own self-improvement issues.
- You merge PRs at your own pace; both loops re-sync to `origin/main` automatically.

This is the intended steady-state development mode for `mdownreview`.

---

## Where state lives

Skills are stateless across runs. Durable state lives in three places:

| Location | What |
|---|---|
| **GitHub issues** | The backlog (only source of truth for "what's next") |
| **GitHub PRs** | Work in progress + review state |
| **`.claude/retrospectives/`** | Per-run retros from skills (`<skill>-<run-tag>.md`) — drives the next self-improvement issue |
| **`.claude/skills/<skill>/runs/<ISO-ts>/`** | Skill-local run artifacts (digests, screenshots, findings) — not committed |

There is no separate task tracker, no Notion, no spreadsheet. Issues + retros + PRs are the entire system.

---

## Adding a new skill or agent

1. Read [`AGENTS.md`](AGENTS.md) and [`docs/principles.md`](docs/principles.md) — the charter rules apply to skills and agents too.
2. Draft `SKILL.md` or `<agent>.md`.
3. Run `/optimize-prompt` over it before saving.
4. Land it via `/iterate` like any other change.

If the new skill is **fully autonomous**, it must wire up the unified retrospective contract at [`.claude/shared/retrospective.md`](.claude/shared/retrospective.md) so it participates in the self-improvement loop.

---

## Anti-patterns

- **Asking the agent to "look at this and make it better"** — too vague. Use a scenario prompt above, or open a GitHub issue and run `/iterate <number>`.
- **Bypassing `/iterate` and editing main directly** — never. The charter rule is feature branch + PR.
- **Calling reviewer agents one-by-one** — the skills dispatch them in parallel for you. Direct calls are an escape hatch, not the default.
- **Skipping `run-build-test` before a PR** — CI will catch it, but local catch is faster and saves a CI cycle.
- **Treating the retrospective as optional** — it's the mechanism by which the system improves itself. If it's silent for 10 runs in a row, something is wrong with the gate logic.

---

## Further reading

- [`AGENTS.md`](AGENTS.md) — charter, git workflow, doc taxonomy router
- [`docs/principles.md`](docs/principles.md) — five pillars + three meta-principles
- [`.claude/shared/retrospective.md`](.claude/shared/retrospective.md) — the unified retro + self-improve contract
- [`.claude/skills/iterate/SKILL.md`](.claude/skills/iterate/SKILL.md) — backbone skill, source of truth for the iteration phases
- [`.claude/skills/run-build-test/SKILL.md`](.claude/skills/run-build-test/SKILL.md) — the local CI mirror

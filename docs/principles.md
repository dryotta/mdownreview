# mdownreview — Engineering Principles

This is the **single source of truth** for the rules that govern every change in
mdownreview. Every contributor, every expert agent, every skill, and every PR
review is bound by it.

If a finding, proposal, or implementation conflicts with this document, the
document wins. If a rule here turns out to be wrong, change the document first
(via PR), then change the code.

The product is a slim desktop reviewer for AI‑generated markdown, code and text
files. Everything below derives from a single product promise:

> **Professional, reliable, performant, lean. Built on a sound architecture,
> sound design patterns, and a sound test strategy.**

Each section below names a pillar, lists the non‑negotiable rules for it, and
points at the agents and docs that enforce it.

---

## Foundational rules (apply to every pillar)

These three meta‑rules apply to every other rule in this document. They are the
filter that every proposal, every fix, and every review decision passes through.

### 1. Evidence‑Based Only

No guessing. Every claim — bug, perf regression, design smell, missing
feature — must be backed by code‑level evidence:

- Cite the exact `file:line` that shows the problem.
- Performance claims need a benchmark, profile, or render‑count, not intuition.
- Suspected bugs need a failing test that reproduces the defect before any fix
  is proposed.
- "This might be slow / this could break / users might want…" without evidence
  is not reportable.

When in doubt, write the test or the benchmark first; let the result drive the
proposal.

### 2. Rust‑First

Prefer Rust over TypeScript/React for any logic that can reasonably live there:

- File I/O, path manipulation, text processing, data validation → Rust.
- Performance‑sensitive computation (search, anchor matching, hashing,
  fuzzy matching, scanning) → Rust, exposed as a typed Tauri command.
- Anything called repeatedly on large inputs → Rust.
- React / TypeScript layer is for UI rendering, state for the UI, and user
  interaction — not for business logic.

When designing a feature, the first question is: *"Can the heavy lifting live
in Rust and just expose a result over IPC?"* If yes, build it there.

### 3. Zero Bug Policy

Every confirmed bug must be fixed, and every fix must be covered by a
regression test:

- No "won't fix" for confirmed bugs. They go on the backlog and they get fixed.
- A bug fix without a regression test is not done. The test is part of the fix.
- The test must reproduce the exact failure mode (race conditions reproduce the
  race, not just "the function returns the right value when called normally").
- Untested changes are rejected by the validator regardless of priority.

---

## Pillar 1 — Professional

mdownreview is a desktop tool used by engineers to review the work of AI agents.
"Professional" means it behaves the way a senior engineer expects: predictable,
consistent, accessible, secure, and respectful of the user's data and time.

**Rules**

1. **Predictable behaviour.** Same input → same output. No hidden mutation, no
   silent data loss, no destructive action without an undo or a confirmation.
2. **Local‑only by default.** No network calls except links the user clicks
   into the system browser. No telemetry. No remote log shipping. Comments live
   on disk next to the file ([MRSF v1.0 sidecar](https://sidemark.org/specification.html)).
3. **Least privilege.** Tauri capabilities are minimal. File I/O is gated by
   the explicit `read_text_file` / `read_dir` commands with a 10 MB ceiling and
   binary detection. New capabilities require justification in the PR.
4. **Input safety.** All file paths from the UI or CLI are canonicalized
   in Rust before use. All markdown rendering passes through `react-markdown`
   without `rehype-raw` so untrusted HTML cannot escape into the DOM.
5. **Visible state.** Every async action acknowledges itself: skeleton,
   spinner, badge, or status text. Failures surface as user‑readable errors,
   not silent `console.error` calls.
6. **Keyboard accessible.** The full review workflow — open, navigate,
   comment, resolve — is reachable from the keyboard. Focus order, `aria-*`,
   and `tabIndex` are first‑class concerns, not afterthoughts.
7. **Stable across versions.** No breaking changes to the on‑disk MRSF format
   without a documented migration. Older `.review.json` files keep loading.
8. **Honest logging.** Logs go through `src/logger.ts` (web) and
   `tracing` (Rust). They include enough context to reproduce, never include
   secrets or full file contents, and rotate at 5 MB × 3 files.

**Enforced by**: `security-reviewer`, `ux-expert`, `react-tauri-expert`.

---

## Pillar 2 — Reliable

A reviewer who loses a comment, sees a wrong anchor, or hits an uncaught
exception will not trust the tool again. Reliability is non‑negotiable.

**Rules**

1. **No silent failures.** Every `invoke()` has typed error handling. Every
   `listen()` has matching `unlisten()` cleanup. Every `useEffect` that
   subscribes returns a cleanup function. The validator and `bug-hunter` agent
   look for these explicitly.
2. **Race‑condition discipline.** Async sequences that touch React state are
   guarded against unmount, out‑of‑order events, and overlapping saves. The
   1.5 s save‑debounce that prevents watcher → reload → save loops is the
   model — every new async path must consider similar cycles.
3. **Comment durability.** The 4‑step re‑anchoring algorithm
   (exact text → line → fuzzy ≥ 0.6 → orphan) survives AI refactors. Orphans
   are surfaced, never deleted. Sidecars survive deletion of the source file
   as **ghost entries**.
4. **Crash containment.** Module‑level
   `window.onerror` / `window.onunhandledrejection` and `ErrorBoundary` wrap
   the React tree. The Rust panic hook logs and the app survives where it can.
5. **Deterministic startup.** First‑instance CLI args are *polled* via
   `get_launch_args` after React mounts, not pushed via an event — events can
   fire before React's first `useEffect`.
6. **No magic limits silently exceeded.** The 10 MB file cap, 10K orphan‑scan
   cap, 5 MB log rotation, and 300 ms watcher debounce are all configured in
   one place per layer and surfaced in errors.
7. **Tests reproduce real failure modes.** A bug fix is not done until a test
   that fails before the fix and passes after it lives in the test suite.

**Enforced by**: `bug-hunter`, `implementation-validator`, `e2e-test-writer`.

---

## Pillar 3 — Performant

Reviewers feel performance more than they describe it. The bar is: **typing,
scrolling, switching tabs, and opening files all feel instant** on a normal
Windows / macOS laptop.

**Rules**

1. **Benchmark before claiming.** A perf claim needs a Criterion bench
   (`src-tauri/benches/`), a Vitest bench, or a measured render count. No
   "this might be slow" findings.
2. **Heavy work belongs in Rust.** Search indexing, fuzzy matching, hashing,
   path scans — anything O(n) or worse over file content — runs in a Rust
   command, off the React render path. See **Rust‑First** above.
3. **Render granularity matters.** Components subscribe to Zustand via
   *fine‑grained selectors* or `useShallow`. Bare `useStore()` destructuring
   forces a re‑render on every store change and is treated as a bug.
4. **No work in render.** Memoization (`useMemo`, `useDeferredValue`,
   `useTransition`) is applied where evidence shows blocking. React 19
   primitives are preferred over manual debouncing where they apply.
5. **Single shared singletons.** Expensive resources — Shiki highlighters,
   markdown parser components — exist once at module scope, never per render.
   Duplicated singletons are a perf bug.
6. **IPC payloads are bounded.** No unbounded list returns over IPC. The
   orphan scanner cap (10K), the file size cap (10 MB), and the watcher
   debounce (300 ms) are the patterns to follow.
7. **Mutations stay scoped.** Store reducers update only the slice/key they
   need (do not `Object.fromEntries` over every file when one file changed).

**Enforced by**: `performance-expert`, `architect-expert`,
`react-tauri-expert`.

---

## Pillar 4 — Lean in Resources

The app must be installable, fast to launch, and light on disk, memory and
CPU even when watching large folders.

**Rules**

1. **No GPU requirement.** Renders correctly without hardware acceleration on
   Windows 10+ and macOS 12+.
2. **Small dependency surface.** A new runtime dependency is a design
   decision: add only when it replaces meaningful in‑repo code, has no smaller
   alternative, and is checked against the GitHub Advisory Database.
3. **Bounded background work.** The file watcher only watches *open* files
   plus their sidecars, with a 300 ms debounce. Directory scans are explicit
   and capped (orphan scan: 10 000).
4. **No log spam.** Release builds log at `info`; WebView `console.log/debug`
   are dropped, only `warn`/`error` are forwarded. Logs rotate at 5 MB × 3.
5. **Persist only what must persist.** Zustand `persist` middleware serializes
   only UI preferences (theme, pane widths, scroll positions, workspace root).
   Comments live in MRSF sidecars, never in app storage.
6. **No dead code.** Parallel implementations (e.g. unused MVVM hooks, second
   highlighter singletons, alternative comment paths) are removed or wired up
   on the first PR that touches them. There is one canonical way per concern.

**Enforced by**: `performance-expert`, `architect-expert`,
`security-reviewer`.

---

## Pillar 5 — Sound Client Architecture

Two runtime layers, one IPC boundary, one state layer, one logger. See
`docs/architecture.md` for the full description; the rules below are the
invariants.

**Rules**

1. **Two layers, one bridge.** Rust owns business logic, file I/O,
   serialization, and watching. React owns UI, interaction, and UI‑state.
   Tauri v2 IPC is the only bridge.
2. **Single IPC boundary.** All `invoke()` calls go through
   `src/lib/tauri-commands.ts`. Components and hooks **never** import
   `@tauri-apps/api/core` directly. Every Rust command in
   `src-tauri/src/commands.rs` has a matching typed wrapper here.
3. **Single logger.** All web logging goes through `src/logger.ts`. Components
   never import `@tauri-apps/plugin-log` directly. Rust uses `tracing`.
4. **Single store.** State lives in the Zustand store (`src/store/`) split
   into slices (`workspace`, `tabs`, `comments`, `ui`, `update`, `watcher`).
   No parallel state systems, no module‑level globals for app data.
5. **No back‑door file access.** All file system access goes through
   typed Rust commands. `tauri-plugin-fs` is intentionally bypassed in favour
   of explicit, guarded commands.
6. **Dependency direction is one‑way.** `lib/` does not import from
   `components/`. Hooks do not have cycles. Viewers do not reach across to
   each other; shared logic moves into `lib/` or a hook.
7. **No God components.** `App.tsx` wires layout and top‑level effects only.
   Business logic lives in hooks, libs, or Rust — not in the root component.

**Enforced by**: `architect-expert`, `react-tauri-expert`.

---

## Pillar 6 — Sound Design Patterns

These are the patterns the codebase already uses well. Every new contribution
follows them; deviating requires justification in the PR.

**Rules**

1. **Typed IPC wrappers.** Each Tauri command is exposed as a typed function
   in `tauri-commands.ts`. Mocks in `src/__mocks__/@tauri-apps/api/core.ts`
   are typed against the same interfaces — TypeScript validates the mock at
   compile time.
2. **Sliced store + selectors.** Slices encapsulate one concern. Consumers
   read with selectors. Mutations target the smallest necessary key.
3. **Hooks for orchestration, libs for pure logic.** `useFileContent`,
   `useFileWatcher`, `useSearch` orchestrate side effects. `comment-matching`,
   `comment-anchors`, `comment-threads` are pure modules with unit tests.
4. **Custom DOM events for cross‑cut signals.** The Rust watcher → React
   bridge uses `mdownreview:file-changed` `CustomEvent`s. New cross‑cut
   signals follow the same `mdownreview:` prefix and `{path, kind}` shape.
5. **Module‑scope singletons for expensive resources.** Shiki highlighters,
   parser config (`MD_COMPONENTS`) are defined once at module scope, never
   inside render functions. This pattern is mandatory for anything expensive
   to initialise.
6. **Sidecars over databases.** Per‑document data (comments) lives in a
   sibling file (`<filename>.review.yaml`). No SQLite, no app‑managed store
   of comment content.
7. **Polling for boot‑time data, events for live updates.** First‑instance
   data uses a command (`get_launch_args`); steady‑state updates use Tauri
   events with cleanup‑safe `listen()`.
8. **Errors as values across IPC.** Rust commands return `Result<T, String>`.
   TypeScript wrappers throw on `Err` and let the call site handle it. No
   silent `unwrap()` in commands.
9. **Open standards.** When a format exists for the job (MRSF for review
   sidecars, RFC 3339 timestamps, SHA‑256 for hashes), use it instead of
   inventing a new one.

**Enforced by**: `architect-expert`, `react-tauri-expert`,
`task-implementer`, `bug-hunter`.

---

## Pillar 7 — Sound Test Strategy

Tests are how we keep the other six pillars honest. The strategy is described
in detail in `docs/test-strategy.md`. The rules below are the invariants.

**Rules**

1. **Three layers, clear ownership.**
   - **Unit / component** (`src/**/__tests__/`, Vitest): pure logic, store
     slices, components in isolation. No IPC. No file I/O.
   - **Browser integration** (`e2e/browser/`, Playwright + Vite dev server):
     UI flows with mocked Tauri IPC. Verifies the React layer reacts to
     events and command results correctly.
   - **Native E2E** (`e2e/native/`, Playwright + real binary, Windows‑only):
     full‑stack scenarios that require real OS file events, the Rust watcher,
     CLI arg handling, or actual disk persistence.
   - **Rust integration** (`src-tauri/tests/`): every Tauri command and
     watcher behaviour has Rust‑side coverage.

2. **Pick the right layer.** A native E2E test must include a comment
   explaining why it cannot be a browser test. A browser test must not
   pretend to be a native one (no fake file I/O dressed up as real).

3. **Required‑pass gates.** A change is not done until **all four** of these
   pass locally and in CI:
   - `npm run lint` (zero warnings on changed code)
   - `cargo test` (only required if `src-tauri/` changed)
   - `npm test` (Vitest unit + component)
   - `npm run test:e2e` (Playwright browser)

4. **Native suite is the release gate.** `npm run test:e2e:native` runs as a
   pre‑release gate, not on every commit.

5. **Test failure modes, not happy paths only.** Every confirmed bug fix
   ships with a test that fails before the fix. Every new feature covers the
   happy path *and* the main edge case (empty input, error path, boundary).

6. **Mock IPC honestly.** Browser tests use the canonical
   `window.__TAURI_IPC_MOCK__` pattern and must mock **every** command the
   app calls during boot, or the app hangs. Mock return shapes are typed.

7. **No console noise.** `test-setup.ts` fails any test that produces
   unexpected `console.error` or `console.warn`. Tests that intentionally
   trigger errors must suppress the spy explicitly.

8. **Rust benches for Rust hotspots.** Performance‑sensitive Rust code has
   a Criterion benchmark in `src-tauri/benches/` so regressions are caught
   numerically.

**Enforced by**: `e2e-test-writer`, `test-gap-reviewer`,
`implementation-validator`, every other agent.

---

## How agents and skills relate to this document

- Every expert agent in `.claude/agents/` lists this document as its first
  authority. If an agent's rules and `docs/principles.md` disagree, this
  document wins and the agent's prompt is updated.
- The `expert-review` skill orchestrates the agents to check the codebase
  against the pillars above and writes a backlog.
- The `self-improve` skill consumes that backlog and implements one task per
  cycle, bound by the same rules.
- The `groom-issues` and `implement-issues` skills enforce the same rules on
  GitHub‑driven work.
- `AGENTS.md` is the contributor entry point and links here for the full set.

## Companion documents

- `docs/architecture.md` — the canonical client architecture and design
  patterns reference.
- `docs/test-strategy.md` — the canonical test strategy with selection rules,
  fixtures, and IPC mock patterns.
- `docs/specs/` — per‑feature behavioural specs (acceptance scenarios).

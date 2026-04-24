# Test Strategy — rules for mdownreview

**Status:** Canonical for test layering, coverage floors, and mock hygiene. Cite violations as "violates rule N in `docs/test-strategy.md`".
**Charter:** [`docs/principles.md`](principles.md)
**Last updated:** 2026-04-23

## Principles

Unique to testing. The Rust-first-for-Rust-logic instinct is covered by principle 1 (test at the lowest layer) plus the charter meta-principle — see [`docs/principles.md`](principles.md).

1. **Test-layer responsibility is fixed, not negotiable.** Every test picks the lowest layer that can prove its claim. Unit/component tests run in ms; native E2E runs only in release workflow. Putting pure logic into E2E wastes seconds per assertion.
2. **Console silence is a first-class assertion.** A test that prints to `console.error`/`console.warn` is failing even if its explicit assertions pass. Don't work around the spy — fix the noise.
3. **Every bug fix ships with a regression test that first fails.** No failing-then-passing test, no fix. The test is part of the fix, not a follow-up.
4. **IPC mocks MUST cover every command used during app init.** Missing mocks hang the app on an unresolved Promise at startup.
5. **Fixtures are data, not code.** Fixtures live in a single tree per layer, are read-only at test time, and are never mutated across tests.

## The three-layer pyramid

| Layer | Where | What it tests | What it does NOT |
|---|---|---|---|
| **Unit / component** | `src/**/__tests__/`, `src-tauri/src/core/*.rs #[cfg(test)]`, `src-tauri/tests/` | Pure functions, store slice actions, React components in isolation, Rust core logic, hooks via `renderHook` | No IPC, no file I/O, no network |
| **Browser integration** | `e2e/browser/` | User-visible UI flows, keyboard shortcuts, multi-component interactions, persistence rehydration, IPC event dispatch | No real Rust, no real filesystem, no OS events |
| **Native E2E** | `e2e/native/` | Real Tauri binary bringing CLI args online, watcher on OS events, sidecar round-trips to disk, log file creation, auto-update harness | Anything a browser test can express |

## Coverage floors

| Layer | Target | Measured? | Current |
|---|---|---|---|
| Zustand slice actions (`src/store/index.ts`) | 100% actions invoked, incl. early-return branches | No | Gaps listed below |
| `src/lib/*.ts` pure functions | 100% exported-symbol, 90% branch | No | All files have co-located tests |
| React components with branching render | 80% branch | No | 20 test files |
| Rust core (`src-tauri/src/core/`) | 90% line, 95% branch on `matching.rs`/`anchors.rs` | `cargo tarpaulin` not wired | 74 `#[test]` across 7 modules + 22 integration |
| Browser E2E command mock coverage | Every init command mocked in every spec | Grep-audit in CI (gap) | 101 IPC-keyword hits across 10 specs |
| Native E2E | 0 tests that could be browser tests | Manual review | 4 specs |

## Rules

### Per-layer coverage
1. Every Zustand action exported from `src/store/index.ts` MUST have a direct unit test (action called in isolation, observed via `useStore.getState()`). **Evidence pattern:** `src/__tests__/store/recentItems.test.ts:10`.
2. Every exported pure function in `src/lib/` MUST have at least three tests: happy path, empty/null input, one error path. **Evidence pattern:** `src/lib/__tests__/comment-utils.test.ts`.
3. Comment-matching branches (`src-tauri/src/core/matching.rs`) MUST each have an integration test: exact-at-original-line, exact-elsewhere, line-fallback, fuzzy, orphan. **Evidence:** `matching.rs:12`.
4. Every React component with a conditional render branch MUST have a test per branch.
5. Component tests MUST assert at least one user interaction (click, keyboard, typing) in addition to rendering. Render-only tests don't count toward coverage.
6. Every user-visible error state (file missing, file too large, binary file, network offline) MUST have a component test asserting the specific error UI.
7. Every keyboard shortcut documented in `docs/specs/` MUST have a browser E2E test that simulates the key press and asserts the UI outcome.
8. Every anchor-line code path (exact/line/fuzzy/orphan) MUST produce an assertion in Rust unit tests and a round-trip MRSF test.

### IPC mock hygiene
9. Every browser E2E spec MUST mock the eleven canonical init commands: `get_launch_args`, `read_dir`, `read_text_file`, `load_review_comments`, `save_review_comments`, `check_path_exists`, `get_log_path`, `get_unresolved_counts`, `get_file_comments`, `scan_review_files`, `update_watched_files`. **Evidence:** `e2e/browser/fixtures/error-tracking.ts:53-66`.
10. Safe-default fallbacks (`{}`/`[]`/`undefined`) exist for bootstrap safety only; tests whose outcome depends on a value MUST set it explicitly.
11. IPC `invoke` mock return types MUST be `InvokeResult`-typed so TypeScript catches mock drift. **Evidence:** `src/__mocks__/@tauri-apps/api/core.ts:11-25`.
12. The `invoke` mock MUST be reset between tests (`vi.mocked(invoke).mockReset()` in `beforeEach`). Mock reuse across tests leaks IPC expectations.

### Native-test gate
13. Native E2E specs MUST begin with a block comment explaining why the scenario cannot be a browser test. **Evidence:** `e2e/native/01-smoke.spec.ts:7-9`.
14. Native E2E tests MUST NOT assert content a browser test already covers. Native-only claim = real binary + real OS event + real CLI arg + real disk write.

### Console-spy contract
15. Tests that intentionally trigger `console.error`/`console.warn` MUST suppress with `vi.spyOn(console, "error").mockImplementation(() => {})` **inside the test body**, before the triggering action. **Evidence:** `src/components/__tests__/ErrorBoundary.test.tsx:18,33,60`.
16. `vi.restoreAllMocks()` in `afterEach` is globally applied in `src/test-setup.ts:15` — do not override locally.

### Test isolation
17. No test file may share mutable state with another. `beforeEach` MUST reset store state (`useStore.setState({...})`) and `localStorage.clear()`. **Evidence:** `src/store/__tests__/tabPersistence.test.ts:5-8`.
18. Every `#[test]` in `src-tauri/` MUST be self-contained — use `tempfile::NamedTempFile` or `tempdir`.

### Debounce & watcher tests
19. File-watcher save-loop debounce MUST be tested in isolation: mock `Date.now`, assert event ignored inside the window, processed outside. (Canonical window: rule 5 in [`docs/performance.md`](performance.md).)
20. Ghost-entry rescan debounce MUST be tested: multiple `deleted` events within the window coalesce to one `scanReviewFiles` call. (Canonical window: rule 6 in [`docs/performance.md`](performance.md).)

### Fixture hygiene
21. Fixture markdown lives under `e2e/fixtures/<feature>/` and `src-tauri/tests/fixtures/<feature>/` with kebab-case names. No fixture is edited by a test.

### Playwright imports
22. Playwright browser tests MUST import from `e2e/browser/fixtures/index.ts`, never `@playwright/test` directly. Native tests import from `@playwright/test` directly (different fixture semantics). **Evidence:** `fixtures/index.ts:1`.

### Test-based IPC abstraction (references)
- Tests MUST NOT import `invoke` or `@tauri-apps/plugin-log` directly. IPC chokepoint: rule 1 in [`docs/architecture.md`](architecture.md). Logger chokepoint: rule 4 in [`docs/architecture.md`](architecture.md). Tests mock the single-file mocks, not raw `invoke`.

### Pre-merge gate
23. A bug-fix PR without a failing-then-passing regression test is rejected by review. (Charter: Zero Bug Policy.)
24. `cargo test`, `npm test`, `npm run lint`, and `npm run test:e2e` MUST all pass before a PR merges.

## Gaps (unenforced, backlog)

- **Untested store actions**: `recordSave`, `toggleAutoReveal`, `setGhostEntries`, `setAuthorName`, `setViewMode`, `setUpdateProgress`, `setUpdateVersion`, `dismissUpdate`. `setGhostEntries`'s equality-short-circuit branch (`store/index.ts:188-192`) is particularly untested.
- **`validatePersistedTabs` error path** (`src/store/index.ts:250-264`): `checkPath` rejection branch not exercised.
- **File-watcher save-loop debounce branch** (`src/hooks/useFileWatcher.ts:56-59`): "ignore event within save window" path has no assertion.
- **Ghost-entry debounce coalescing** (`src/hooks/useFileWatcher.ts:23-39`): not asserted.
- **`openFilesFromArgs` with `folders: [""]`** (`src/store/index.ts:287-291`): last-folder-wins branch untested.
- **Comment threading with orphaned reply** (`src-tauri/src/core/threads.rs`): orphaned-reply reparenting branch not obviously covered.
- **No CI grep-audit** verifying every browser spec mocks the eleven canonical commands.
- **No mechanical enforcement of the `mockImplementation(() => {})` scope rule.** A developer could silence globally via `beforeAll`, leaking state — needs a CI grep flagging `mockImplementation` outside a `test`/`it` body.

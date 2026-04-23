# mdownreview — Test Strategy

This document is the canonical test strategy for mdownreview. It expands the
summary in `AGENTS.md` and is bound by the rules in `docs/principles.md`
(Pillar 7).

The strategy exists to make it **obvious which layer a new test belongs in**,
so that:

- Fast tests stay fast and run on every commit.
- Slow / OS‑dependent tests stay rare and run only when needed.
- A bug fix can never ship without a regression test.

---

## The four layers

```
Speed ▲   ┌────────────────────────────────────────────────────────────┐
fast      │ Unit / component   src/**/__tests__   Vitest + jsdom       │
          ├────────────────────────────────────────────────────────────┤
          │ Rust integration   src-tauri/tests/   cargo test           │
          ├────────────────────────────────────────────────────────────┤
          │ Browser E2E        e2e/browser/       Playwright + Vite    │
          │                    (mocked Tauri IPC)                      │
          ├────────────────────────────────────────────────────────────┤
slow      │ Native E2E         e2e/native/        Playwright + real    │
          │                    (real binary, Win-only via CDP)         │
Speed ▼   └────────────────────────────────────────────────────────────┘
```

| Layer | Location | Runner | What it tests | When it runs |
|---|---|---|---|---|
| Unit / component | `src/**/__tests__/` | `npm test` (Vitest) | Pure logic, store slices, components in isolation | Every commit |
| Rust integration | `src-tauri/tests/` and `#[cfg(test)]` | `cargo test` | Tauri commands, watcher behaviour, MRSF serde, matching algorithm | Every commit (when `src-tauri/` changed) |
| Browser E2E | `e2e/browser/` | `npm run test:e2e` (Playwright + Vite dev server) | UI flows with mocked Tauri IPC. Verifies React reacts correctly to commands and events. **Does not test Rust, file I/O, or real IPC.** | Every commit |
| Native E2E | `e2e/native/` | `npm run test:e2e:native` (Playwright + real binary, CDP) | Full‑stack: OS file events → Rust watcher → Tauri emit → React re‑render; CLI args; on‑disk persistence. Windows only (WebView2 + CDP). | Pre‑release gate |

---

## Choosing the right layer

Decide top‑down. Stop at the first layer that can faithfully cover the case.

1. **Can a pure‑function or component test cover it?** → unit / component.
2. **Is it about a Rust command's behaviour or a watcher edge case?**
   → Rust integration.
3. **Is it a UI flow that depends only on responses from Tauri, not on real
   file I/O or the watcher?** → browser E2E with mocked IPC.
4. **Does the scenario require real OS file events, the actual Rust watcher,
   real CLI arg handling, or actual disk persistence?** → native E2E.

**Native E2E rule:** every test in `e2e/native/` MUST include a top‑of‑file
or top‑of‑test comment stating *why* it cannot live in `e2e/browser/`. If you
cannot write that justification, the test belongs in the browser layer.

---

## Required‑pass gates

A change is **not done** until all of these pass locally and in CI:

```bash
npm run lint                         # zero warnings on changed code
cargo test --manifest-path src-tauri/Cargo.toml   # only if src-tauri/ touched
npm test                             # Vitest unit + component
npm run test:e2e                     # Playwright browser
```

Native E2E (`npm run test:e2e:native`) is the **release gate**, not a
per‑commit gate. The release workflow runs it before publishing.

---

## Unit / component tests (Vitest)

- **Location:** colocated as `src/<area>/__tests__/<name>.test.ts(x)`.
- **Setup file:** `src/test-setup.ts`. Spies on `console.error` and
  `console.warn`; any unexpected call **fails** the test. Use this to catch
  silent regressions.
- **Mocking IPC:** use `src/__mocks__/@tauri-apps/api/core.ts`. Mock return
  shapes are typed against `tauri-commands.ts` interfaces — TypeScript
  validates them at compile time.
- **Mocking the logger:** `src/__mocks__/logger.ts` provides `vi.fn()` stubs.

**Tests that intentionally trigger errors** must suppress the spy with
`vi.spyOn(console, 'error').mockImplementation(() => {})` and restore it
afterwards.

**What to cover (per file):**

- Every exported function or component
- Empty / null / boundary inputs
- Each error path
- For comment matching: all 4 re‑anchoring outcomes (exact, line, fuzzy,
  orphan)
- For React components: keyboard interactions, empty state, not just rendering

---

## Rust integration tests

- **Location:** `src-tauri/tests/commands_integration.rs` for IPC command
  behaviour; `#[cfg(test)] mod tests` inside modules for unit‑level checks.
- **Coverage rule:** every Tauri command in `commands.rs` has at least one
  test. Watcher behaviour is covered in `watcher.rs` tests.
- **Benchmarks:** Criterion benches live in `src-tauri/benches/` with
  `harness = false` in `Cargo.toml`. Run with `cargo bench` from
  `src-tauri/`. Performance‑sensitive code (matching, serde) must have a
  bench so regressions are caught numerically.

---

## Browser E2E tests (mocked IPC)

- **Location:** `e2e/browser/*.spec.ts`.
- **Runner:** Playwright (`playwright.browser.config.ts`) against the Vite
  dev server.
- **Imports:** `import { test, expect } from "./fixtures";` — never directly
  from `@playwright/test`. The fixture attaches `pageerror` and `console`
  error collectors so any uncaught error fails the test.

### Canonical IPC mock

Use `page.addInitScript` to install `window.__TAURI_IPC_MOCK__`. **All seven
boot commands must be mocked**, or the app hangs on startup waiting on an
unresolved promise:

```ts
await page.addInitScript(({ dir }) => {
  window.__TAURI_IPC_MOCK__ = async (cmd, args) => {
    if (cmd === "get_launch_args")   return { files: [], folders: [dir] };
    if (cmd === "read_dir")          return [{ name: "file.md", path: `${dir}/file.md`, is_dir: false }];
    if (cmd === "read_text_file")    return "# Content";
    if (cmd === "load_review_comments") return null;
    if (cmd === "save_review_comments") return null;
    if (cmd === "check_path_exists") return "file";
    if (cmd === "get_log_path")      return "/mock/log.log";
    return null;
  };
}, { dir: "/e2e/fixtures" });
```

### Simulating watcher events

Watcher events from Rust are re‑emitted as DOM `CustomEvent`s, so the test
dispatches the same event the production code would receive:

```ts
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("mdownreview:file-changed", {
    detail: { path: "/e2e/fixtures/file.md", kind: "content" }
  }));
});
```

Kinds: `"content"` | `"review"` | `"deleted"`.

### Tracking save calls

```ts
// in initScript:
(window as Record<string, unknown>).__SAVE_CALLS__ = [];
// in save_review_comments handler:
((window as Record<string, unknown>).__SAVE_CALLS__ as unknown[]).push(args);
// later:
const calls = await page.evaluate(() => (window as Record<string, unknown>).__SAVE_CALLS__);
```

### Key selectors

| Selector | Purpose |
|---|---|
| `.app-layout` | Root app container |
| `.folder-tree` | Left sidebar file tree |
| `.folder-tree-filter` | Sidebar search input |
| `.markdown-viewer` | Rendered markdown |
| `.source-view` | Syntax‑highlighted source view |
| `.comments-panel` | Right‑hand comments sidebar |
| `.tab-bar .tab` | Individual tab |
| `.welcome-view` | Empty state |

---

## Native E2E tests (real binary)

- **Location:** `e2e/native/*.spec.ts`.
- **Runner:** Playwright (`playwright.native.config.ts`) attached to the real
  Tauri binary via Chrome DevTools Protocol. **Windows only** (WebView2 +
  CDP). The fixture auto‑skips on macOS/Linux.
- **Imports:** `import { test, expect } from "./fixtures";` — uses the
  `nativePage` fixture that connects to the binary.
- **Build first:** `cd src-tauri && cargo build` (or
  `npm run test:e2e:native:build`).

```ts
import { test, expect } from "./fixtures";

// Why native: requires real CLI arg handling — IPC mock cannot test the
// setup hook that parses argv before React mounts.
test("opens file from CLI argument", async ({ nativePage }) => {
  await expect(nativePage.locator(".markdown-viewer")).toBeVisible({ timeout: 10_000 });
});
```

### When to write a native test

Only when at least one of the following is true:

- Real OS file events must drive a code path (the Rust watcher).
- Real CLI argv handling must be exercised (single‑instance, file
  associations).
- Actual disk persistence must be verified (writing a sidecar and reading
  it back).
- The scenario depends on the real WebView2 process (focus, window state,
  clipboard).

If none of those apply, write a browser test.

---

## Test‑gap policy

After implementing in `src/lib/` or `src/components/`, run `test-gap-reviewer`
(or self‑audit) and check:

1. Every exported function / component has at least one test.
2. Edge cases (empty/null input, error paths, boundary values) are covered.
3. Comment‑related logic exercises every re‑anchoring step.
4. React components test interactions (click, keyboard, empty state), not
   just rendering.

Test gaps are filed as backlog items, not deferred indefinitely. The
`implementation-validator` rejects changes that touch source files without
matching test changes (zero bug policy).

---

## Naming & structure conventions

- Vitest files end in `.test.ts(x)` and live in `__tests__/` next to the
  module.
- Playwright files end in `.spec.ts`.
- One test file per source module is the default. Split when a single file
  exceeds ~300 lines.
- `describe` blocks group by behaviour, not by function name.
- Assertion messages are not used as a substitute for test names — the
  `it`/`test` description is enough.

---

## Companion documents

- `docs/principles.md` — Pillar 7 enumerates the test rules.
- `docs/architecture.md` — explains the layers being tested.
- `docs/specs/e2e-app-tests.md` — original E2E spec.
- `docs/specs/unit-store-tests.md` — original unit‑test spec for the store.
- `docs/specs/test-exception-tracking.md` — how unexpected console errors
  fail tests.

# Retrospective — iteration 1/30 (PASSED)

## Goal of this iteration
Drop the Settings toolbar button so the top toolbar matches AC's exact enumeration `[Open File] [Open Folder] [Comments]`, while keeping Settings reachable.

## What went well
- Deviation was discovered immediately by the assessor scan (`src/App.tsx:198–205`, AC line 1) — no wasted iterations.
- The wire-up pattern (Rust `MenuItem` → `on_menu_event` id-map → `EventPayloads` entry → `useMenuListeners` listen → callback) was already followed 15× in the codebase, so the change followed canonical shape (`src-tauri/src/lib.rs:104-122`, `src/lib/tauri-events.ts:33-49`, `src/hooks/useMenuListeners.ts:30-58`).
- Browser e2e ux-overhaul.spec.ts F8 added a hard assertion on the toolbar's exact 3-button enumeration, locking the spec in CI.

## What did not go well
- The first push broke `e2e/browser/settings-author.spec.ts` (commit `1850070`): the test still clicked the now-removed Settings button. CI surfaced it; one forward-fix commit (`f8e385a`) restored green.
- The assessor over-counted "met" criteria for AC line 1 in the original PR #83 (the toolbar button was visibly extra) — same root cause as #36 → #105 retro candidate. The assessor in this iteration *did* catch it on first re-evaluation, suggesting #105's intervention point will help.

## Root causes of friction
- Toolbar button → e2e dependency was implicit. No grep-or-die step searches for click-by-name dependencies before deleting UI elements (would have caught `getByRole("button", { name: "Open settings" })` in `settings-author.spec.ts:55,74`).
- The original PR #83 assessor did not enumerate the toolbar's three accessible names against the AC's literal list. This is the same class of over-claim as #105.

## Improvement candidates

### Add pre-delete grep for accessible-name selectors
- **Category:** process
- **Problem (with evidence):** Removing the Settings toolbar button broke `e2e/browser/settings-author.spec.ts:55,74` (`getByRole("button", { name: "Open settings" })`). One CI cycle was spent re-discovering this. A grep for `name: "Open settings"` and `aria-label="Open settings"` before the delete would have surfaced both call sites instantly.
- **Proposed change:** Add a checklist step in the iterate skill or in a CONTRIBUTING note: "Before deleting a UI control, grep for its label/title/aria-label across `src/`, `e2e/`, and tests."
- **Acceptance signal:** A documented step exists; future UI-removal commits cite it in their commit body.
- **Estimated size:** xs
- **Confidence this matters:** medium (one occurrence here; recurs whenever UI is deleted).

## Carry-over to next iteration
None — all 13 ACs verified met after this iteration's commits.

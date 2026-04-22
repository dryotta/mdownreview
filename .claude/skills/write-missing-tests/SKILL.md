---
name: write-missing-tests
description: Write unit tests for untested source files in this project following established patterns. Invoked by user when filling coverage gaps.
disable-model-invocation: true
---

# Write Missing Tests

High-value targets (no test file yet):
- `src/lib/comment-threads.ts`
- `src/lib/path-utils.ts`
- `src/components/comments/LineCommentMargin.tsx`
- `src/components/viewers/DeletedFileViewer.tsx`

## Conventions

**Imports**
```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
```

**Tauri mock** — never import `invoke` directly; use the mock:
```typescript
import { invoke } from '@tauri-apps/api/core'; // resolved via src/__mocks__
vi.mocked(invoke).mockResolvedValue(...);
```

**Logger mock** — already stubbed via `src/__mocks__/logger.ts`; import it if the module under test calls logger.

**console.error spy** — `test-setup.ts` fails on unexpected `console.error` calls. For tests that intentionally trigger errors:
```typescript
vi.spyOn(console, 'error').mockImplementation(() => {});
```

**Component rendering** — use `@testing-library/react`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
```

**Reference tests** — model each new test file after its closest sibling:
- `lib/` utilities → see `src/lib/__tests__/comment-utils.test.ts`
- `comments/` components → see `src/components/comments/__tests__/CommentThread.test.tsx`
- `viewers/` components → see `src/components/viewers/__tests__/DeletedFileViewer` (once written) or `BinaryPlaceholder.test.tsx`

## After Writing

Run `npm test` to confirm no regressions before marking complete.

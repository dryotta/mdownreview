---
name: mdownreview-review
description: "Use when .review.json sidecar files exist alongside source files — orchestrates the full review cycle: read comments, fix code, respond, resolve, and clean up"
---

# Review and Address All Comments

Orchestrate the full review cycle: read all unresolved comments, fix the code, respond, resolve, and clean up.

## Workflow

### Step 1 — Read all unresolved comments

```bash
python scripts/mdownreview.py read --format json
```

Parse the JSON output. Each entry has `reviewFile`, `sourceFile`, and `comments` array.

### Step 2 — Process comments grouped by file

For each source file with unresolved comments:

1. **Read** the source file to understand the full context
2. **For each comment** on that file:
   - Understand what the reviewer is asking for
   - Make the code change to address the feedback
   - Record what you did:
     ```bash
     python scripts/mdownreview.py respond <review-json-file> <comment-id> "<what you did>"
     ```
   - Mark the comment resolved:
     ```bash
     python scripts/mdownreview.py resolve <review-json-file> <comment-id>
     ```
3. **Commit** changes for that file (or group of related files)

### Step 3 — Clean up resolved sidecars

```bash
python scripts/mdownreview.py cleanup
```

This deletes `.review.json` files where every comment has been resolved.

### Step 4 — Summary

Report what was done:
- How many files were changed
- How many comments were addressed
- Any comments that could not be resolved (explain why)

## Guidelines

- Use `--format json` for reliable parsing of comment data
- Group work by file — read a file once, address all its comments, then move on
- Commit per-file or per logical group, not per-comment
- If a comment is ambiguous, respond explaining your interpretation before making the change
- If a comment cannot be addressed (e.g., out of scope, contradicts another comment), respond explaining why and still resolve it

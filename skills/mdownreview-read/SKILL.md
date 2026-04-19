---
name: mdownreview-read
description: "Use when .review.json sidecar files exist alongside source files — reads unresolved review comments for the agent to address"
---

# Read Review Comments

Scan for `.review.json` sidecar files and display outstanding review comments.

## Usage

```bash
python scripts/mdownreview.py read [path] [--format json|text] [--all]
```

- Default: scans current directory recursively, shows only unresolved comments
- `--format json` for machine-parseable output
- `--all` to include resolved comments
- Each comment shows: id, file, line, anchor type, text, resolved status, responses

## When to Use

Use this skill when you see `.review.json` files alongside source files in the workspace. These are review comment sidecars — each contains human review feedback on the corresponding source file.

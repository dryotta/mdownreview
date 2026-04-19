---
name: mdownreview-resolve
description: "Use after responding to review comments from .review.json sidecar files — marks comments as resolved"
---

# Resolve Review Comments

Mark review comments as resolved after addressing them.

## Usage

```bash
python scripts/mdownreview.py resolve <review-json-file> <comment-id> [comment-id...]
python scripts/mdownreview.py resolve <review-json-file> --all
```

- Provide one or more comment IDs to resolve specific comments
- Use `--all` to resolve every comment in the file

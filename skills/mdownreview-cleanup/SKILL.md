---
name: mdownreview-cleanup
description: "Use to clean up .review.json sidecar files after all review comments have been resolved"
---

# Clean Up Resolved Review Files

Delete `.review.json` sidecar files where every comment has been resolved.

## Usage

```bash
python scripts/mdownreview.py cleanup [path] [--dry-run]
```

- Default: scans current directory recursively
- `--dry-run`: preview which files would be deleted without deleting them
- Only deletes files where ALL comments are resolved

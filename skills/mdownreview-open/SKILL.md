---
name: mdownreview-open
description: "Use to open the mDown reView desktop app on the current project folder for visual review of comments"
---

# Open mDown reView

Find and launch the mDown reView desktop app to visually review `.review.json` sidecar comments.

## Usage

```bash
python scripts/mdownreview.py open [path]
```

- Default: opens the current working directory
- Searches common install locations, then falls back to PATH
- Launches in the background (does not block the agent)
- Exit 0 on launch, exit 1 if app not found (lists searched locations)

## When to Use

Use this skill when the user wants to visually review or browse comments in the mDown reView desktop app. The app provides a rich UI for reading comments alongside rendered markdown.

---
name: mdownreview-respond
description: "Use after addressing a review comment from a .review.json sidecar file — records a response acknowledging the fix"
---

# Respond to Review Comments

After modifying code to address a review comment, record your response.

## Usage

```bash
python scripts/mdownreview.py respond <review-json-file> <comment-id> "<response-text>"
```

- `review-json-file`: path to the `.review.json` sidecar file
- `comment-id`: the `id` field of the comment you addressed
- `response-text`: brief description of what you did to address the comment

The response is recorded with `author: "agent"` and the current timestamp.

## Workflow

1. Read comments with `mdownreview-read`
2. Fix the code issue described in the comment
3. Use this skill to record what you did
4. Mark the comment resolved with `mdownreview-resolve`

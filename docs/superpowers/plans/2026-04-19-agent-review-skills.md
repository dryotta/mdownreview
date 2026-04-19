# Agent Review Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four marketplace-published skills and a Python CLI for coding agents to read, respond to, resolve, and clean up `.review.json` sidecar files.

**Architecture:** A single zero-dependency Python CLI (`scripts/mdownreview.py`) with four subcommands, backed by four thin SKILL.md files in `skills/` (marketplace-published). Marketplace metadata in `.claude-plugin/`. Documentation updates to README.md and site/index.html.

**Tech Stack:** Python 3.8+ (stdlib only), Markdown (SKILL.md files), JSON (marketplace config)

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Create | `scripts/mdownreview.py` | Python CLI with read/respond/resolve/cleanup subcommands |
| Create | `scripts/test_mdownreview.py` | Tests for the Python CLI |
| Create | `skills/mdownreview-read/SKILL.md` | Read skill |
| Create | `skills/mdownreview-respond/SKILL.md` | Respond skill |
| Create | `skills/mdownreview-resolve/SKILL.md` | Resolve skill |
| Create | `skills/mdownreview-cleanup/SKILL.md` | Cleanup skill |
| Create | `.claude-plugin/marketplace.json` | Marketplace catalog |
| Create | `.claude-plugin/plugin.json` | Plugin metadata |
| Modify | `README.md` | Add Agent Skills section |
| Modify | `site/index.html` | Add Agent Integration section |
| Modify | `.claude/skills/publish-release/SKILL.md` | Bump marketplace versions on release |

---

### Task 1: Python CLI — Core Helpers and `read` Subcommand

**Files:**
- Create: `scripts/mdownreview.py`
- Create: `scripts/test_mdownreview.py`

- [ ] **Step 1: Write failing tests for `read` subcommand**

Create `scripts/test_mdownreview.py`:

```python
"""Tests for mdownreview.py CLI."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CLI = str(Path(__file__).parent / "mdownreview.py")


def run_cli(*args: str, cwd: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, CLI, *args],
        capture_output=True, text=True, cwd=cwd,
    )


class TestRead(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        # Create a sample .review.json sidecar
        self.sidecar = {
            "version": 3,
            "comments": [
                {
                    "id": "c1",
                    "anchorType": "line",
                    "lineNumber": 10,
                    "text": "Fix this null check",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "resolved": False,
                },
                {
                    "id": "c2",
                    "anchorType": "selection",
                    "lineNumber": 20,
                    "selectedText": "foo()",
                    "selectionStartOffset": 0,
                    "selectionEndLine": 20,
                    "selectionEndOffset": 5,
                    "text": "Rename this function",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "resolved": True,
                },
            ],
        }
        review_path = os.path.join(self.tmpdir, "app.tsx.review.json")
        with open(review_path, "w") as f:
            json.dump(self.sidecar, f)
        # Also create the source file (not required but realistic)
        with open(os.path.join(self.tmpdir, "app.tsx"), "w") as f:
            f.write("// source\n")

    def test_read_text_shows_unresolved_only(self):
        result = run_cli("read", self.tmpdir, "--format", "text")
        self.assertEqual(result.returncode, 0)
        self.assertIn("c1", result.stdout)
        self.assertIn("Fix this null check", result.stdout)
        self.assertNotIn("c2", result.stdout)

    def test_read_text_all_shows_resolved(self):
        result = run_cli("read", self.tmpdir, "--format", "text", "--all")
        self.assertEqual(result.returncode, 0)
        self.assertIn("c1", result.stdout)
        self.assertIn("c2", result.stdout)

    def test_read_json_format(self):
        result = run_cli("read", self.tmpdir, "--format", "json")
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["sourceFile"], "app.tsx")
        # Only unresolved by default
        self.assertEqual(len(data[0]["comments"]), 1)
        self.assertEqual(data[0]["comments"][0]["id"], "c1")

    def test_read_json_all(self):
        result = run_cli("read", self.tmpdir, "--format", "json", "--all")
        data = json.loads(result.stdout)
        self.assertEqual(len(data[0]["comments"]), 2)

    def test_read_empty_dir(self):
        empty = tempfile.mkdtemp()
        result = run_cli("read", empty, "--format", "text")
        self.assertEqual(result.returncode, 0)
        self.assertIn("No review comments found", result.stdout)

    def test_read_defaults_to_cwd(self):
        result = run_cli("read", "--format", "json", cwd=self.tmpdir)
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        self.assertEqual(len(data), 1)

    def test_read_nested_dirs(self):
        subdir = os.path.join(self.tmpdir, "src", "components")
        os.makedirs(subdir)
        nested_sidecar = {
            "version": 3,
            "comments": [
                {
                    "id": "n1",
                    "anchorType": "line",
                    "lineNumber": 5,
                    "text": "Add type annotation",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "resolved": False,
                }
            ],
        }
        with open(os.path.join(subdir, "Button.tsx.review.json"), "w") as f:
            json.dump(nested_sidecar, f)
        result = run_cli("read", self.tmpdir, "--format", "json")
        data = json.loads(result.stdout)
        self.assertEqual(len(data), 2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python scripts/test_mdownreview.py`
Expected: All tests fail (mdownreview.py doesn't exist yet)

- [ ] **Step 3: Implement `scripts/mdownreview.py` with `read` subcommand**

Create `scripts/mdownreview.py`:

```python
#!/usr/bin/env python3
"""CLI for working with .review.json sidecar files.

Subcommands:
  read      Scan for review comments
  respond   Add a response to a comment
  resolve   Mark comments as resolved
  cleanup   Delete fully-resolved sidecar files
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# ── Helpers ──────────────────────────────────────────────────────────────────

def find_review_files(root: str) -> list[str]:
    """Recursively find all .review.json files under root."""
    results = []
    for dirpath, _, filenames in os.walk(root):
        for f in filenames:
            if f.endswith(".review.json"):
                results.append(os.path.join(dirpath, f))
    results.sort()
    return results


def load_sidecar(path: str) -> dict:
    """Load a .review.json sidecar file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_sidecar(path: str, data: dict) -> None:
    """Atomically write a sidecar file (temp + rename)."""
    directory = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp", prefix=".review-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        os.unlink(tmp_path)
        raise


def source_file_from_review(review_path: str, relative_to: str) -> str:
    """Derive source file path from .review.json path, relative to root."""
    abs_path = os.path.abspath(review_path)
    # Strip .review.json suffix to get source file path
    if abs_path.endswith(".review.json"):
        source_abs = abs_path[: -len(".review.json")]
    else:
        source_abs = abs_path
    return os.path.relpath(source_abs, relative_to)


def format_comment_location(comment: dict) -> str:
    """Format a comment's location for text display."""
    anchor = comment.get("anchorType", "block")
    line = comment.get("lineNumber")
    if anchor == "selection":
        end_line = comment.get("selectionEndLine")
        if end_line and line and end_line != line:
            return f"selection lines {line}-{end_line}"
        return f"selection line {line}" if line else "selection"
    elif anchor == "line":
        return f"line {line}" if line else "line ?"
    else:  # block (legacy)
        fl = comment.get("fallbackLine")
        return f"block line {fl}" if fl else "block"


# ── Subcommands ──────────────────────────────────────────────────────────────

def cmd_read(args: argparse.Namespace) -> int:
    """Read review comments from sidecar files."""
    root = os.path.abspath(args.path)
    review_files = find_review_files(root)

    if not review_files:
        if args.format == "json":
            print("[]")
        else:
            print("No review comments found.")
        return 0

    results = []
    for rf in review_files:
        try:
            data = load_sidecar(rf)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: skipping {rf}: {e}", file=sys.stderr)
            continue

        comments = data.get("comments", [])
        if not args.all:
            comments = [c for c in comments if not c.get("resolved", False)]

        if not comments:
            continue

        source = source_file_from_review(rf, root)
        results.append({
            "reviewFile": os.path.relpath(rf, root),
            "sourceFile": source,
            "comments": comments,
        })

    if args.format == "json":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        if not results:
            print("No review comments found.")
            return 0
        for entry in results:
            n = len(entry["comments"])
            label = "comment" if n == 1 else "comments"
            qualifier = "" if args.all else "unresolved "
            print(f"\n── {entry['sourceFile']} ({n} {qualifier}{label}) ──")
            for c in entry["comments"]:
                loc = format_comment_location(c)
                resolved = " [resolved]" if c.get("resolved") else ""
                print(f"  [{c['id']}] {loc}: {c['text']}{resolved}")
                for resp in c.get("responses", []):
                    print(f"    ↳ {resp.get('author', '?')}: {resp['text']}")

    return 0


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        prog="mdownreview",
        description="Work with .review.json sidecar files.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # read
    p_read = subparsers.add_parser("read", help="Scan for review comments")
    p_read.add_argument("path", nargs="?", default=".",
                        help="Directory to scan (default: current directory)")
    p_read.add_argument("--format", choices=["text", "json"], default="text",
                        help="Output format (default: text)")
    p_read.add_argument("--all", action="store_true",
                        help="Include resolved comments")

    args = parser.parse_args()

    if args.command == "read":
        return cmd_read(args)

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify `read` passes**

Run: `python scripts/test_mdownreview.py`
Expected: All TestRead tests pass

- [ ] **Step 5: Commit**

```bash
git add scripts/mdownreview.py scripts/test_mdownreview.py
git commit -m "feat: add mdownreview CLI with read subcommand

Zero-dependency Python CLI that scans for .review.json sidecar
files and displays review comments in text or JSON format."
```

---

### Task 2: Python CLI — `respond` Subcommand

**Files:**
- Modify: `scripts/mdownreview.py`
- Modify: `scripts/test_mdownreview.py`

- [ ] **Step 1: Write failing tests for `respond`**

Append to `scripts/test_mdownreview.py`:

```python
class TestRespond(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.sidecar_path = os.path.join(self.tmpdir, "app.tsx.review.json")
        self.sidecar = {
            "version": 3,
            "comments": [
                {
                    "id": "c1",
                    "anchorType": "line",
                    "lineNumber": 10,
                    "text": "Fix this",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "resolved": False,
                }
            ],
        }
        with open(self.sidecar_path, "w") as f:
            json.dump(self.sidecar, f)

    def test_respond_adds_response(self):
        result = run_cli("respond", self.sidecar_path, "c1", "Fixed the null check")
        self.assertEqual(result.returncode, 0)
        data = json.loads(Path(self.sidecar_path).read_text())
        responses = data["comments"][0].get("responses", [])
        self.assertEqual(len(responses), 1)
        self.assertEqual(responses[0]["author"], "agent")
        self.assertEqual(responses[0]["text"], "Fixed the null check")
        self.assertIn("createdAt", responses[0])

    def test_respond_preserves_version(self):
        result = run_cli("respond", self.sidecar_path, "c1", "Done")
        self.assertEqual(result.returncode, 0)
        data = json.loads(Path(self.sidecar_path).read_text())
        self.assertEqual(data["version"], 3)

    def test_respond_unknown_id_fails(self):
        result = run_cli("respond", self.sidecar_path, "nonexistent", "text")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not found", result.stderr)

    def test_respond_appends_to_existing_responses(self):
        # Add first response
        run_cli("respond", self.sidecar_path, "c1", "First fix")
        # Add second response
        run_cli("respond", self.sidecar_path, "c1", "Follow-up fix")
        data = json.loads(Path(self.sidecar_path).read_text())
        responses = data["comments"][0]["responses"]
        self.assertEqual(len(responses), 2)
        self.assertEqual(responses[0]["text"], "First fix")
        self.assertEqual(responses[1]["text"], "Follow-up fix")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python scripts/test_mdownreview.py TestRespond`
Expected: FAIL — `respond` subcommand not recognized

- [ ] **Step 3: Implement `respond` subcommand**

Add to `scripts/mdownreview.py`, after `cmd_read`:

```python
def cmd_respond(args: argparse.Namespace) -> int:
    """Add a response to a specific comment."""
    try:
        data = load_sidecar(args.file)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading {args.file}: {e}", file=sys.stderr)
        return 1

    for comment in data.get("comments", []):
        if comment["id"] == args.comment_id:
            responses = comment.setdefault("responses", [])
            responses.append({
                "author": "agent",
                "text": args.text,
                "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            })
            save_sidecar(args.file, data)
            print(f"Response added to comment {args.comment_id}")
            return 0

    print(f"Error: comment '{args.comment_id}' not found in {args.file}", file=sys.stderr)
    return 1
```

Add the subparser in `main()`:

```python
    # respond
    p_respond = subparsers.add_parser("respond", help="Add a response to a comment")
    p_respond.add_argument("file", help="Path to .review.json file")
    p_respond.add_argument("comment_id", help="Comment ID to respond to")
    p_respond.add_argument("text", help="Response text")
```

Add dispatch in `main()`:

```python
    elif args.command == "respond":
        return cmd_respond(args)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python scripts/test_mdownreview.py TestRespond`
Expected: All 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add scripts/mdownreview.py scripts/test_mdownreview.py
git commit -m "feat: add respond subcommand to mdownreview CLI"
```

---

### Task 3: Python CLI — `resolve` Subcommand

**Files:**
- Modify: `scripts/mdownreview.py`
- Modify: `scripts/test_mdownreview.py`

- [ ] **Step 1: Write failing tests for `resolve`**

Append to `scripts/test_mdownreview.py`:

```python
class TestResolve(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.sidecar_path = os.path.join(self.tmpdir, "app.tsx.review.json")
        self.sidecar = {
            "version": 3,
            "comments": [
                {
                    "id": "c1",
                    "anchorType": "line",
                    "lineNumber": 10,
                    "text": "Fix this",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "resolved": False,
                },
                {
                    "id": "c2",
                    "anchorType": "line",
                    "lineNumber": 20,
                    "text": "Fix that",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "resolved": False,
                },
            ],
        }
        with open(self.sidecar_path, "w") as f:
            json.dump(self.sidecar, f)

    def test_resolve_single_comment(self):
        result = run_cli("resolve", self.sidecar_path, "c1")
        self.assertEqual(result.returncode, 0)
        data = json.loads(Path(self.sidecar_path).read_text())
        self.assertTrue(data["comments"][0]["resolved"])
        self.assertFalse(data["comments"][1]["resolved"])

    def test_resolve_multiple_comments(self):
        result = run_cli("resolve", self.sidecar_path, "c1", "c2")
        self.assertEqual(result.returncode, 0)
        data = json.loads(Path(self.sidecar_path).read_text())
        self.assertTrue(data["comments"][0]["resolved"])
        self.assertTrue(data["comments"][1]["resolved"])

    def test_resolve_all(self):
        result = run_cli("resolve", self.sidecar_path, "--all")
        self.assertEqual(result.returncode, 0)
        data = json.loads(Path(self.sidecar_path).read_text())
        self.assertTrue(all(c["resolved"] for c in data["comments"]))

    def test_resolve_unknown_id_fails(self):
        result = run_cli("resolve", self.sidecar_path, "nonexistent")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not found", result.stderr)

    def test_resolve_preserves_version(self):
        run_cli("resolve", self.sidecar_path, "c1")
        data = json.loads(Path(self.sidecar_path).read_text())
        self.assertEqual(data["version"], 3)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python scripts/test_mdownreview.py TestResolve`
Expected: FAIL

- [ ] **Step 3: Implement `resolve` subcommand**

Add to `scripts/mdownreview.py`:

```python
def cmd_resolve(args: argparse.Namespace) -> int:
    """Mark comments as resolved."""
    try:
        data = load_sidecar(args.file)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading {args.file}: {e}", file=sys.stderr)
        return 1

    comments = data.get("comments", [])

    if args.all:
        count = 0
        for c in comments:
            if not c.get("resolved", False):
                c["resolved"] = True
                count += 1
        save_sidecar(args.file, data)
        print(f"Resolved {count} comment(s) in {args.file}")
        return 0

    if not args.comment_ids:
        print("Error: provide comment IDs or --all", file=sys.stderr)
        return 1

    comment_map = {c["id"]: c for c in comments}
    for cid in args.comment_ids:
        if cid not in comment_map:
            print(f"Error: comment '{cid}' not found in {args.file}", file=sys.stderr)
            return 1

    for cid in args.comment_ids:
        comment_map[cid]["resolved"] = True

    save_sidecar(args.file, data)
    print(f"Resolved {len(args.comment_ids)} comment(s) in {args.file}")
    return 0
```

Add the subparser in `main()`:

```python
    # resolve
    p_resolve = subparsers.add_parser("resolve", help="Mark comments as resolved")
    p_resolve.add_argument("file", help="Path to .review.json file")
    p_resolve.add_argument("comment_ids", nargs="*", help="Comment IDs to resolve")
    p_resolve.add_argument("--all", action="store_true",
                           help="Resolve all comments in the file")
```

Add dispatch:

```python
    elif args.command == "resolve":
        return cmd_resolve(args)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python scripts/test_mdownreview.py TestResolve`
Expected: All 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add scripts/mdownreview.py scripts/test_mdownreview.py
git commit -m "feat: add resolve subcommand to mdownreview CLI"
```

---

### Task 4: Python CLI — `cleanup` Subcommand

**Files:**
- Modify: `scripts/mdownreview.py`
- Modify: `scripts/test_mdownreview.py`

- [ ] **Step 1: Write failing tests for `cleanup`**

Append to `scripts/test_mdownreview.py`:

```python
class TestCleanup(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        # All resolved
        self.all_resolved_path = os.path.join(self.tmpdir, "done.md.review.json")
        with open(self.all_resolved_path, "w") as f:
            json.dump({
                "version": 3,
                "comments": [
                    {"id": "r1", "anchorType": "line", "lineNumber": 1,
                     "text": "Done", "createdAt": "2026-01-01T00:00:00Z", "resolved": True},
                ],
            }, f)
        # Has unresolved
        self.has_unresolved_path = os.path.join(self.tmpdir, "wip.md.review.json")
        with open(self.has_unresolved_path, "w") as f:
            json.dump({
                "version": 3,
                "comments": [
                    {"id": "u1", "anchorType": "line", "lineNumber": 1,
                     "text": "TODO", "createdAt": "2026-01-01T00:00:00Z", "resolved": False},
                ],
            }, f)

    def test_cleanup_deletes_fully_resolved(self):
        result = run_cli("cleanup", self.tmpdir)
        self.assertEqual(result.returncode, 0)
        self.assertFalse(os.path.exists(self.all_resolved_path))
        self.assertTrue(os.path.exists(self.has_unresolved_path))

    def test_cleanup_dry_run(self):
        result = run_cli("cleanup", self.tmpdir, "--dry-run")
        self.assertEqual(result.returncode, 0)
        # File should NOT be deleted in dry-run
        self.assertTrue(os.path.exists(self.all_resolved_path))
        self.assertIn("done.md.review.json", result.stdout)

    def test_cleanup_empty_dir(self):
        empty = tempfile.mkdtemp()
        result = run_cli("cleanup", empty)
        self.assertEqual(result.returncode, 0)

    def test_cleanup_reports_deleted_count(self):
        result = run_cli("cleanup", self.tmpdir)
        self.assertIn("1", result.stdout)  # 1 file deleted
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python scripts/test_mdownreview.py TestCleanup`
Expected: FAIL

- [ ] **Step 3: Implement `cleanup` subcommand**

Add to `scripts/mdownreview.py`:

```python
def cmd_cleanup(args: argparse.Namespace) -> int:
    """Delete .review.json files where all comments are resolved."""
    root = os.path.abspath(args.path)
    review_files = find_review_files(root)

    if not review_files:
        print("No .review.json files found.")
        return 0

    deleted = []
    for rf in review_files:
        try:
            data = load_sidecar(rf)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: skipping {rf}: {e}", file=sys.stderr)
            continue

        comments = data.get("comments", [])
        if not comments:
            continue

        all_resolved = all(c.get("resolved", False) for c in comments)
        if all_resolved:
            rel = os.path.relpath(rf, root)
            if args.dry_run:
                print(f"  Would delete: {rel}")
            else:
                os.remove(rf)
                print(f"  Deleted: {rel}")
            deleted.append(rel)

    if args.dry_run:
        print(f"\n{len(deleted)} file(s) would be deleted.")
    else:
        print(f"\n{len(deleted)} file(s) deleted.")

    return 0
```

Add the subparser in `main()`:

```python
    # cleanup
    p_cleanup = subparsers.add_parser("cleanup", help="Delete fully-resolved sidecar files")
    p_cleanup.add_argument("path", nargs="?", default=".",
                           help="Directory to scan (default: current directory)")
    p_cleanup.add_argument("--dry-run", action="store_true",
                           help="Show what would be deleted without deleting")
```

Add dispatch:

```python
    elif args.command == "cleanup":
        return cmd_cleanup(args)
```

- [ ] **Step 4: Run ALL tests to verify everything passes**

Run: `python scripts/test_mdownreview.py`
Expected: All tests pass (TestRead + TestRespond + TestResolve + TestCleanup)

- [ ] **Step 5: Commit**

```bash
git add scripts/mdownreview.py scripts/test_mdownreview.py
git commit -m "feat: add cleanup subcommand to mdownreview CLI"
```

---

### Task 5: SKILL.md Files

**Files:**
- Create: `skills/mdownreview-read/SKILL.md`
- Create: `skills/mdownreview-respond/SKILL.md`
- Create: `skills/mdownreview-resolve/SKILL.md`
- Create: `skills/mdownreview-cleanup/SKILL.md`

- [ ] **Step 1: Create `skills/mdownreview-read/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Create `skills/mdownreview-respond/SKILL.md`**

```markdown
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
```

- [ ] **Step 3: Create `skills/mdownreview-resolve/SKILL.md`**

```markdown
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
```

- [ ] **Step 4: Create `skills/mdownreview-cleanup/SKILL.md`**

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add skills/
git commit -m "feat: add marketplace skills for review comment operations

Four skills: mdownreview-read, mdownreview-respond,
mdownreview-resolve, mdownreview-cleanup"
```

---

### Task 6: Marketplace Configuration

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "mdownreview-skills",
  "description": "Skills for reading, responding to, resolving, and cleaning up .review.json sidecar comments",
  "version": "0.3.0",
  "author": {
    "name": "dryotta"
  },
  "homepage": "https://github.com/dryotta/mdownreview",
  "repository": "https://github.com/dryotta/mdownreview",
  "license": "MIT",
  "keywords": ["review", "comments", "sidecar", "markdown"]
}
```

- [ ] **Step 2: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "mdownreview",
  "metadata": {
    "description": "Skills for working with .review.json sidecar comments",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "mdownreview-skills",
      "source": {
        "source": "url",
        "url": "https://github.com/dryotta/mdownreview.git"
      },
      "description": "Read, respond to, resolve, and clean up .review.json sidecar comments",
      "version": "0.3.0",
      "strict": true
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/
git commit -m "feat: add marketplace configuration for plugin discovery"
```

---

### Task 7: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `site/index.html`

- [ ] **Step 1: Update README.md**

Add after the "Development" section, before "License":

```markdown
## Agent Skills

mDown reView persists review comments as `.review.json` sidecar files alongside your source files. Coding agents can read and act on these comments using the bundled CLI and skills.

### Quick Start (agents in this repo)

Skills are automatically available. Run `python scripts/mdownreview.py read` to see outstanding comments.

### Install in Other Projects

**Claude Code / Copilot CLI:**
```
/plugin marketplace add dryotta/mdownreview
/plugin install mdownreview-skills@mdownreview
```

### Available Skills

| Skill | Description |
|-------|-------------|
| `mdownreview-read` | Scan for `.review.json` files and list unresolved comments |
| `mdownreview-respond` | Record an agent response after addressing a comment |
| `mdownreview-resolve` | Mark comments as resolved |
| `mdownreview-cleanup` | Delete `.review.json` files where all comments are resolved |

### CLI Usage

```bash
python scripts/mdownreview.py read [path] [--format json|text] [--all]
python scripts/mdownreview.py respond <file> <comment-id> "<text>"
python scripts/mdownreview.py resolve <file> <comment-id> [--all]
python scripts/mdownreview.py cleanup [path] [--dry-run]
```
```

- [ ] **Step 2: Update site/index.html**

Add a new section after the "Build from source" section, before `</footer>`:

```html
  <section class="install">
    <h2>Agent Integration</h2>
    <p>Review comments are stored as <code>.review.json</code> sidecar files. Coding agents can read and act on them with the bundled skills.</p>
    <pre><code>/plugin marketplace add dryotta/mdownreview
/plugin install mdownreview-skills@mdownreview</code></pre>
    <p>Or use the CLI directly: <code>python scripts/mdownreview.py read</code></p>
  </section>
```

- [ ] **Step 3: Commit**

```bash
git add README.md site/index.html
git commit -m "docs: add agent skills documentation to README and site"
```

---

### Task 8: Update Publish-Release Skill

**Files:**
- Modify: `.claude/skills/publish-release/SKILL.md`

- [ ] **Step 1: Add marketplace version bumping to the publish-release skill**

In `.claude/skills/publish-release/SKILL.md`, after Step 6 (Update Version in Three Files), add these additional files to update:

Add to the Step 6 file list:

```
4. **`.claude-plugin/plugin.json`** → Update the `"version"` field
5. **`.claude-plugin/marketplace.json`** → Update the `"version"` field of the plugin entry in the `plugins` array (where `name` is `"mdownreview-skills"`)
```

In Step 8, update the `git add` command to include:

```
.claude-plugin/plugin.json .claude-plugin/marketplace.json
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/publish-release/SKILL.md
git commit -m "chore: update publish-release skill to bump marketplace versions"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run all Python CLI tests**

Run: `python scripts/test_mdownreview.py -v`
Expected: All tests pass

- [ ] **Step 2: Verify skill files have valid YAML frontmatter**

Run: `python -c "import yaml; [yaml.safe_load(open(f).read().split('---')[1]) for f in ['skills/mdownreview-read/SKILL.md', 'skills/mdownreview-respond/SKILL.md', 'skills/mdownreview-resolve/SKILL.md', 'skills/mdownreview-cleanup/SKILL.md']]"`

If Python yaml isn't available, manually verify each SKILL.md has valid `---` delimited frontmatter with `name` and `description` keys.

- [ ] **Step 3: Verify marketplace JSON is valid**

Run: `python -c "import json; json.load(open('.claude-plugin/plugin.json')); json.load(open('.claude-plugin/marketplace.json')); print('OK')"`

- [ ] **Step 4: Run existing project tests to ensure no regressions**

Run: `npm test`
Run: `npm run test:e2e`

Expected: All existing tests still pass (our changes are additive — new files only, plus doc updates).

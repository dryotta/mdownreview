// Synchronise the working tree with origin/main between loop iterations.
//
// Usage: tsx sync.ts
//
// Behaviour:
//   - Allow-lists `.claude/retrospectives/**.md` — stashes them with
//     --include-untracked around the fetch + ff so the inner skill's
//     mandatory retrospective artefacts (per `.claude/shared/retrospective.md`
//     Step R1) do not deadlock the loop. See issue #143 for the rationale.
//   - Refuses if any OTHER path is dirty (caller should commit/stash).
//   - Fetches origin, fast-forwards `main` to origin/main, prints the new SHA.
//   - Exits 0 on success, 1 on dirty tree (outside the allow-list) or git failure.

import { spawn } from "node:child_process";

function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.once("exit", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `git exit ${code}`)));
  });
}

interface PorcelainEntry { code: string; path: string; }

function parsePorcelain(out: string): PorcelainEntry[] {
  if (!out) return [];
  return out.split("\n").map((line) => {
    // Format: XY <space> path  (X = index, Y = worktree, "??" for untracked)
    const code = line.slice(0, 2);
    const path = line.slice(3).trim().replace(/\\/g, "/");
    return { code, path };
  });
}

// Allow-list: paths under `.claude/retrospectives/` ending in `.md`.
// These are skill artefacts that must survive across loop iterations
// (shared/retrospective.md Step R1).
function isAllowlisted(path: string): boolean {
  return /^\.claude\/retrospectives\/[^/]+\.md$/.test(path);
}

async function main(): Promise<void> {
  const status = await git(["status", "--porcelain", "--untracked-files=all"]);
  const entries = parsePorcelain(status);
  const disallowed = entries.filter((e) => !isAllowlisted(e.path));
  if (disallowed.length > 0) {
    const lines = disallowed.map((e) => `${e.code} ${e.path}`).join("\n");
    process.stderr.write(`[sync] working tree dirty (outside allow-list):\n${lines}\n` +
      `       commit, stash, or discard before continuing.\n`);
    process.exit(1);
  }

  const allowlisted = entries.filter((e) => isAllowlisted(e.path));
  let stashed = false;
  if (allowlisted.length > 0) {
    process.stderr.write(`[sync] stashing ${allowlisted.length} allow-listed retrospective file(s) around ff\n`);
    await git(["stash", "push", "--include-untracked", "-m", "test-exploratory-loop: retrospectives",
              "--", ".claude/retrospectives/"]);
    stashed = true;
  }

  try {
    await git(["fetch", "--quiet", "origin"]);
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch !== "main") {
      process.stderr.write(`[sync] checking out main (was ${branch})\n`);
      await git(["checkout", "main"]);
    }
    await git(["merge", "--ff-only", "origin/main"]);
  } finally {
    if (stashed) {
      try {
        await git(["stash", "pop"]);
      } catch (e) {
        process.stderr.write(`[sync] WARNING: failed to restore stashed retros: ${e instanceof Error ? e.message : e}\n` +
          `       run \`git stash list\` to recover them manually.\n`);
        // Do not exit non-zero — the ff already succeeded; the retro is salvageable from the stash.
      }
    }
  }

  const head = await git(["rev-parse", "HEAD"]);
  process.stderr.write(`[sync] main → ${head.slice(0, 8)}\n`);
  process.stdout.write(head + "\n");
}

main().catch((e) => { console.error(`[sync] ${e instanceof Error ? e.message : e}`); process.exit(1); });

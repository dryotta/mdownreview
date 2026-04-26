#!/usr/bin/env node
// Lint every `.claude/skills/**/SKILL.md`: every `npm run <name>` reference must
// resolve to a real key under `package.json` "scripts". Catches docs drift like
// the broken `npm run explore-ux:repl` reference fixed in #141.
//
// Scope: matches `npm run <name>` literally — both inside fenced code blocks and
// in inline backticks. Prose such as "the npm script `foo`" does not match
// because it lacks the `npm run ` prefix.
//
// Exit codes:
//   0 — every reference resolves
//   1 — at least one missing script (printed with file:line)
//   2 — usage / IO error

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(REPO_ROOT, ".claude", "skills");
const PKG_PATH = join(REPO_ROOT, "package.json");
const NPM_RUN_RE = /\bnpm run ([a-zA-Z0-9_][a-zA-Z0-9_:.-]*)/g;

function loadScripts() {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile() && name === "SKILL.md") yield full;
  }
}

function findReferences(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const refs = [];
  lines.forEach((line, idx) => {
    NPM_RUN_RE.lastIndex = 0;
    let m;
    while ((m = NPM_RUN_RE.exec(line)) !== null) {
      refs.push({ name: m[1], line: idx + 1, snippet: line.trim() });
    }
  });
  return refs;
}

function main() {
  const scripts = loadScripts();
  const skillFiles = [...walk(SKILLS_DIR)];
  if (skillFiles.length === 0) {
    process.stderr.write(`[lint-skills] no SKILL.md files under ${relative(REPO_ROOT, SKILLS_DIR)}\n`);
    process.exit(2);
  }

  const failures = [];
  for (const file of skillFiles) {
    for (const ref of findReferences(file)) {
      if (!scripts.has(ref.name)) {
        failures.push({ file, ...ref });
      }
    }
  }

  if (failures.length === 0) {
    process.stderr.write(`[lint-skills] OK: ${skillFiles.length} SKILL.md files, all "npm run <name>" references resolve.\n`);
    process.exit(0);
  }

  process.stderr.write(`[lint-skills] FAIL: ${failures.length} broken "npm run <name>" reference(s):\n`);
  for (const f of failures) {
    const rel = relative(REPO_ROOT, f.file).replace(/\\/g, "/");
    process.stderr.write(`  ${rel}:${f.line}  npm run ${f.name}    (no such script in package.json)\n`);
    process.stderr.write(`    > ${f.snippet}\n`);
  }
  process.exit(1);
}

main();

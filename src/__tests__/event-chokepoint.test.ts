import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(__dirname, "..");
// Files allowed to import from "@tauri-apps/api/event" directly.
const ALLOWED = new Set<string>([
  // The chokepoint itself.
  join("lib", "tauri-events.ts"),
]);

const FORBIDDEN_IMPORT = /from\s+["']@tauri-apps\/api\/event["']/;

function* walk(dir: string): IterableIterator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      // Skip nothing — tests live under src/ but are excluded by filename below.
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function isTestFile(rel: string): boolean {
  // Vitest test files and __tests__ / __mocks__ directories.
  return (
    /\.test\.(ts|tsx)$/.test(rel) ||
    rel.includes(`${sep}__tests__${sep}`) ||
    rel.includes(`${sep}__mocks__${sep}`) ||
    /(^|[\\/])test-setup\.ts$/.test(rel)
  );
}

describe("event chokepoint architecture", () => {
  it("no production file outside @/lib/tauri-events imports @tauri-apps/api/event", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC_ROOT)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const rel = relative(SRC_ROOT, file);
      if (isTestFile(rel)) continue;
      if (ALLOWED.has(rel)) continue;

      const content = readFileSync(file, "utf8");
      if (FORBIDDEN_IMPORT.test(content)) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `These files import @tauri-apps/api/event directly. ` +
        `Use listenEvent from @/lib/tauri-events instead:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});

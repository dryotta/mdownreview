import { test, expect } from "./fixtures";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

test.describe("Native File Reload (full-stack watcher)", () => {
  test("27.1 - external file modification triggers content reload", async ({ nativePage }) => {
    // TODO: this test requires a `set_root_via_test` Tauri command gated behind
    // #[cfg(debug_assertions)] so the test can open a folder without a native dialog.
    // Until that command is added to src-tauri/src/commands.rs, skip rather than
    // run assertions that only validate the test's own file writes.
    test.skip(true, "requires set_root_via_test debug command — see TODO in file-reload.spec.ts");

    const tmpDir = path.join(os.tmpdir(), `mdownreview-native-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "watched.md");
    fs.writeFileSync(tmpFile, "# Version 1\n\nOriginal content.");

    try {
      await nativePage.evaluate((folder: string) => {
        // @ts-ignore — Tauri internals are available in the WebView
        return window.__TAURI_INTERNALS__.invoke("set_root_via_test", { path: folder });
      }, tmpDir);

      // Wait for the app to process the open-folder command and register watchers
      await new Promise((r) => setTimeout(r, 500));

      fs.writeFileSync(tmpFile, "# Version 2\n\nUpdated content.");
      // Watcher debounce is 300ms; 2000ms allows for re-render and CI slowness
      await new Promise((r) => setTimeout(r, 2000));

      // Assert the app re-rendered with the updated content
      await expect(nativePage.locator(".markdown-viewer")).toContainText("Version 2");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("27.2 - .review.yaml sidecar modification triggers review reload", async ({ nativePage }) => {
    // TODO: same as 27.1 — requires set_root_via_test debug command
    test.skip(true, "requires set_root_via_test debug command — see TODO in file-reload.spec.ts");

    const tmpDir = path.join(os.tmpdir(), `mdownreview-native-sidecar-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "doc.md");
    const sidecarFile = tmpFile + ".review.yaml";

    fs.writeFileSync(tmpFile, "# Document\n\nContent.");
    fs.writeFileSync(
      sidecarFile,
      `mrsf_version: "1.0"\ndocument: doc.md\ncomments: []\n`,
    );

    try {
      await nativePage.evaluate((folder: string) => {
        // @ts-ignore
        return window.__TAURI_INTERNALS__.invoke("set_root_via_test", { path: folder });
      }, tmpDir);

      // Wait for watchers to register
      await new Promise((r) => setTimeout(r, 500));

      // Simulate external tool adding a comment
      fs.writeFileSync(
        sidecarFile,
        `mrsf_version: "1.0"\ndocument: doc.md\ncomments:\n  - id: ext-1\n    author: "External (ext)"\n    timestamp: "2026-01-01T00:00:00Z"\n    text: "Added by external tool"\n    resolved: false\n    line: 1\n`,
      );
      // Watcher debounce is 300ms; 2000ms allows for re-render and CI slowness
      await new Promise((r) => setTimeout(r, 2000));

      // Assert the comments panel reflects the new comment
      await expect(nativePage.locator(".comments-panel")).toContainText("Added by external tool");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

import { test, expect, setRootViaTest } from "./fixtures";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

test.describe("Native File Reload (full-stack watcher)", () => {
  test("27.1 - external file modification triggers content reload", async ({ nativePage }) => {
    const tmpDir = path.join(os.tmpdir(), `mdownreview-native-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "watched.md");
    fs.writeFileSync(tmpFile, "# Version 1\n\nOriginal content.");

    try {
      await setRootViaTest(nativePage, tmpDir);

      // Wait for the app to open the tab and register watchers
      await expect(nativePage.locator(".markdown-viewer")).toBeVisible({ timeout: 5000 });

      fs.writeFileSync(tmpFile, "# Version 2\n\nUpdated content.");
      // Watcher debounce is 300ms; 3000ms allows for re-render and CI slowness
      await expect(nativePage.locator(".markdown-viewer")).toContainText("Version 2", { timeout: 3000 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("27.2 - .review.yaml sidecar modification triggers review reload", async ({ nativePage }) => {
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
      await setRootViaTest(nativePage, tmpDir);

      // Wait for the tab to open
      await expect(nativePage.locator(".markdown-viewer")).toBeVisible({ timeout: 5000 });

      // Simulate external tool adding a comment
      fs.writeFileSync(
        sidecarFile,
        `mrsf_version: "1.0"\ndocument: doc.md\ncomments:\n  - id: ext-1\n    author: "External (ext)"\n    timestamp: "2026-01-01T00:00:00Z"\n    text: "Added by external tool"\n    resolved: false\n    line: 1\n`,
      );
      // Watcher debounce is 300ms; 3000ms allows for re-render and CI slowness
      await expect(nativePage.locator(".comments-panel")).toContainText("Added by external tool", { timeout: 3000 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("27.3 - file deletion while open shows DeletedFileViewer", async ({ nativePage }) => {
    const tmpDir = path.join(os.tmpdir(), `mdownreview-native-delete-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "todelete.md");
    fs.writeFileSync(tmpFile, "# To Be Deleted\n\nThis file will be deleted.");

    try {
      await setRootViaTest(nativePage, tmpDir);

      // Wait for the tab to open
      await expect(nativePage.locator(".markdown-viewer")).toBeVisible({ timeout: 5000 });

      // Delete the file while it is open in a tab
      fs.rmSync(tmpFile, { force: true });

      // The app should detect the deletion and show the deleted-file UI
      await expect(nativePage.locator(".deleted-file-viewer")).toBeVisible({ timeout: 3000 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

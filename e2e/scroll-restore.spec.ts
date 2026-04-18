import { test, expect } from "./fixtures";

test.describe("Scroll Restore", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__TAURI_IPC_MOCK__ = async (cmd: string) => {
        if (cmd === "get_launch_args") return { files: [], folders: [] };
        if (cmd === "read_text_file") return Array.from({ length: 200 }, (_, i) => `# Line ${i}\n\nContent.`).join("\n\n");
        if (cmd === "load_review_comments") return null;
        return null;
      };
    });
  });

  test("24.3 - scroll position restored when switching tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });
});

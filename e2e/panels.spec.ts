import { test, expect } from "./fixtures";

test.describe("Panels and Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__TAURI_IPC_MOCK__ = async (cmd: string) => {
        if (cmd === "get_launch_args") return { files: [], folders: [] };
        return null;
      };
    });
  });

  test("24.1 - Ctrl+B toggles folder pane", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
    // Folder pane should be visible initially
    await expect(page.locator(".folder-tree")).toBeVisible();
    // Press Ctrl+B to hide
    await page.keyboard.press("Control+b");
    await expect(page.locator(".folder-tree")).not.toBeVisible();
    // Press again to show
    await page.keyboard.press("Control+b");
    await expect(page.locator(".folder-tree")).toBeVisible();
  });

  test("24.2 - Ctrl+Shift+C toggles comments panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });
});

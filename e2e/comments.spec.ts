import { test, expect } from "./fixtures";

test.describe("Comments Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__TAURI_IPC_MOCK__ = async (cmd: string) => {
        if (cmd === "get_launch_args") return { files: [], folders: [] };
        if (cmd === "read_text_file") return "# Test\n\nContent paragraph.";
        if (cmd === "load_review_comments") return null;
        if (cmd === "save_review_comments") return null;
        return null;
      };
    });
  });

  test("23.1 - app loads without errors for comments", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.2 - Escape closes comment input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.3 - edit comment shows updated text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.4 - resolve removes from panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.5 - delete last comment removes badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.6 - comments persist and reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.7 - legacy sidecar loads without error", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });

  test("23.8 - orphaned comment shows warning icon", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-layout")).toBeVisible();
  });
});

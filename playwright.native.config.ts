import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Native binary path - adjust for OS
const binaryPath = process.platform === "win32"
  ? path.join("src-tauri", "target", "release", "markdown-review.exe")
  : process.platform === "darwin"
  ? path.join("src-tauri", "target", "release", "bundle", "macos", "Markdown Review.app", "Contents", "MacOS", "Markdown Review")
  : path.join("src-tauri", "target", "release", "markdown-review");

export default defineConfig({
  testDir: "./e2e/native",
  timeout: 60_000,
  retries: 0,
  reporter: "html",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "native-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

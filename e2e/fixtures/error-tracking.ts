import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

interface ErrorTrackingOptions {
  consoleErrorAllowlist: string[];
}

interface ErrorTrackingFixtures {
  consoleErrorAllowlist: string[];
}

const test = base.extend<ErrorTrackingFixtures & ErrorTrackingOptions>({
  consoleErrorAllowlist: [[], { option: true }],

  page: async ({ page, consoleErrorAllowlist }, use) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        const allowed = consoleErrorAllowlist.some((pattern) => text.includes(pattern));
        if (!allowed) {
          consoleErrors.push(text);
        }
      }
    });

    await use(page);

    if (pageErrors.length > 0) {
      throw new Error(
        `Test failed: uncaught page errors:\n${pageErrors.map((e) => e.message).join("\n")}`
      );
    }
    if (consoleErrors.length > 0) {
      throw new Error(
        `Test failed: unexpected console errors:\n${consoleErrors.join("\n")}`
      );
    }
  },
});

export { test, expect };
export type { Page };

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { chromium } from "@playwright/test";

const CDP_PORT = 9222;
const BINARY_PATH =
  process.platform === "win32"
    ? path.join(process.cwd(), "src-tauri", "target", "debug", "mdownreview.exe")
    : path.join(process.cwd(), "src-tauri", "target", "debug", "mdownreview");

let binaryProcess: ChildProcess | null = null;

async function waitForCdp(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${port}`, {
        timeout: 1000,
      });
      await browser.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`CDP endpoint on port ${port} did not become ready within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  if (process.platform !== "win32") {
    console.log("[native-setup] Non-Windows platform: skipping binary launch (CDP not supported on WKWebView)");
    return;
  }

  if (!fs.existsSync(BINARY_PATH)) {
    throw new Error(
      `[native-setup] Binary not found at ${BINARY_PATH}. Run 'cd src-tauri && cargo build' first, or use 'npm run test:e2e:native:build'.`
    );
  }

  binaryProcess = spawn(BINARY_PATH, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
    detached: false,
  });

  binaryProcess.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[mdownreview] ${d}`)
  );

  // Store pid so teardown can kill it
  fs.writeFileSync(".e2e-native.pid", String(binaryProcess.pid ?? ""));

  console.log(`[native-setup] Launched binary (pid ${binaryProcess.pid}), waiting for CDP on port ${CDP_PORT}...`);
  await waitForCdp(CDP_PORT, 15_000);
  console.log("[native-setup] CDP ready.");
}

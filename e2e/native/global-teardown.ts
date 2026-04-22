import * as fs from "fs";

export default async function globalTeardown() {
  const pidFile = ".e2e-native.pid";
  if (!fs.existsSync(pidFile)) return;
  const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
  if (!isNaN(pid)) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`[native-teardown] Killed binary (pid ${pid})`);
    } catch {
      // Already dead — ignore
    }
  }
  fs.unlinkSync(pidFile);
}

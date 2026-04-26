// Iter 7 (issue #112) regression — guards the IPC contract that EVERY
// successful comment-mutation invoke is followed by a `comments-changed`
// emit. Mirrors the Rust acceptance criterion: `Emitter::emit` runs after
// every sidecar save in `commands/comments/{mod.rs,update.rs}`. If a new
// mutation command is added (or the central auto-emit is reverted), the
// spec below should fail without any per-spec edits.

import { test, expect } from "./fixtures";

test.describe("comment-emit IPC contract", () => {
  test("listen('comments-changed') fires for every mutation command", async ({ page }) => {
    await page.addInitScript(() => {
      (window as Record<string, unknown>).__EMIT_LOG__ = [] as Array<{
        cmd: string;
        file_path: string;
      }>;
      window.__TAURI_IPC_MOCK__ = async (cmd: string, args: Record<string, unknown>) => {
        // Mutation commands receive {filePath} from the TS wrappers; the
        // central mock looks at that key to fire the emit. For the regression,
        // it doesn't matter what these return — we only need them to succeed.
        if (
          cmd === "add_comment" ||
          cmd === "edit_comment" ||
          cmd === "delete_comment" ||
          cmd === "add_reply" ||
          cmd === "update_comment" ||
          cmd === "resolve_comment" ||
          cmd === "move_anchor"
        ) {
          return null;
        }
        if (cmd === "get_launch_args") return { files: [], folders: [] };
        return null;
      };
    });

    await page.goto("/");

    // Subscribe via the production listen() path, then drive each mutation
    // command through the production invoke wrapper.
    await page.evaluate(async () => {
      const log = (window as Record<string, unknown>).__EMIT_LOG__ as Array<{
        cmd: string;
        file_path: string;
      }>;
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");

      let lastCmd = "";
      await listen("comments-changed", (e: { payload: unknown }) => {
        const fp =
          (e.payload as { file_path?: string } | null | undefined)?.file_path ?? "";
        log.push({ cmd: lastCmd, file_path: fp });
      });

      const file = "/tmp/x.md";
      const cmds: Array<[string, Record<string, unknown>]> = [
        ["add_comment", { filePath: file, text: "t", anchor: { kind: "file" } }],
        ["edit_comment", { filePath: file, commentId: "c1", text: "t2" }],
        ["delete_comment", { filePath: file, commentId: "c1" }],
        ["add_reply", { filePath: file, parentId: "c1", text: "r" }],
        ["update_comment", { filePath: file, commentId: "c1", patch: {} }],
        ["resolve_comment", { filePath: file, commentId: "c1", resolved: true }],
        ["move_anchor", { filePath: file, commentId: "c1", newAnchor: { kind: "file" } }],
      ];
      for (const [cmd, args] of cmds) {
        lastCmd = cmd;
        await invoke(cmd, args);
      }
    });

    const log = await page.evaluate(
      () => (window as Record<string, unknown>).__EMIT_LOG__ as Array<{ cmd: string; file_path: string }>,
    );

    expect(log).toEqual([
      { cmd: "add_comment", file_path: "/tmp/x.md" },
      { cmd: "edit_comment", file_path: "/tmp/x.md" },
      { cmd: "delete_comment", file_path: "/tmp/x.md" },
      { cmd: "add_reply", file_path: "/tmp/x.md" },
      { cmd: "update_comment", file_path: "/tmp/x.md" },
      { cmd: "resolve_comment", file_path: "/tmp/x.md" },
      { cmd: "move_anchor", file_path: "/tmp/x.md" },
    ]);
  });
});

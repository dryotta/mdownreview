import { useCallback, useEffect } from "react";
import { installUpdate, checkUpdate } from "@/lib/tauri-commands";
import { listenEvent } from "@/lib/tauri-events";
import { useStore } from "@/store";

/** Pure actions — safe to call from multiple components without duplicate side effects. */
export function useUpdateActions() {
  const setUpdateStatus = useStore((s) => s.setUpdateStatus);
  const setUpdateProgress = useStore((s) => s.setUpdateProgress);
  const setUpdateVersion = useStore((s) => s.setUpdateVersion);

  const install = useCallback(async () => {
    setUpdateStatus("downloading");
    try {
      await installUpdate();
    } catch {
      setUpdateProgress(0);
      setUpdateStatus("available");
    }
  }, [setUpdateStatus, setUpdateProgress]);

  const checkForUpdate = useCallback(async (channel?: string) => {
    const ch = channel ?? useStore.getState().updateChannel;
    try {
      setUpdateStatus("checking");
      const info = await checkUpdate(ch);
      if (info) {
        setUpdateVersion(info.version);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("idle");
      }
    } catch {
      setUpdateStatus("idle");
    }
  }, [setUpdateStatus, setUpdateVersion]);

  return { install, checkForUpdate };
}

/** Subscribe to download progress events. Call exactly once (in App). */
export function useUpdateProgress() {
  const setUpdateStatus = useStore((s) => s.setUpdateStatus);
  const setUpdateProgress = useStore((s) => s.setUpdateProgress);

  useEffect(() => {
    let downloaded = 0;
    let total = 0;
    const unlisten = listenEvent("update-progress", (payload) => {
      if (payload.event === "Started") {
        downloaded = 0;
        total = payload.content_length ?? 0;
        setUpdateProgress(0);
      } else if (payload.event === "Progress") {
        downloaded += payload.chunk_length;
        if (total > 0) setUpdateProgress(Math.min(Math.round((downloaded / total) * 100), 100));
      } else if (payload.event === "Finished") {
        setUpdateStatus("ready");
      }
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [setUpdateProgress, setUpdateStatus]);
}

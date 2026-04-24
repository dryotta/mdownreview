import { useEffect } from "react";
import { listenEvent } from "@/lib/tauri-events";
import { getLaunchArgs } from "@/lib/tauri-commands";
import { useStore, openFilesFromArgs } from "@/store";

/**
 * Loads CLI launch args on mount and subscribes to second-instance "args-received"
 * events. Calls `openFilesFromArgs` for each result.
 */
export function useLaunchArgsBootstrap() {
  useEffect(() => {
    let cancelled = false;

    getLaunchArgs()
      .then(({ files, folders }) => {
        if (cancelled) return;
        openFilesFromArgs(files, folders, useStore.getState());
      })
      .catch(() => {});

    const argsListener = listenEvent("args-received", (payload) => {
      openFilesFromArgs(payload.files, payload.folders, useStore.getState());
    });

    return () => {
      cancelled = true;
      argsListener.then((fn) => fn()).catch(() => {});
    };
  }, []);
}

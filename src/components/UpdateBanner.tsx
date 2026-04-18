import type { Update } from "@tauri-apps/plugin-updater";
import { useUpdateState } from "@/store";
import "@/styles/update-banner.css";

interface UpdateBannerProps {
  update: Update | null;
}

export function UpdateBanner({ update }: UpdateBannerProps) {
  const {
    updateStatus,
    updateVersion,
    updateProgress,
    setUpdateStatus,
    setUpdateProgress,
    dismissUpdate,
  } = useUpdateState();

  if (updateStatus === "idle" || updateStatus === "checking" || updateStatus === "error") {
    return null;
  }

  const handleInstall = async () => {
    if (!update) return;
    setUpdateStatus("downloading");
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setUpdateProgress(Math.min(Math.round((downloaded / total) * 100), 100));
        } else if (event.event === "Finished") {
          setUpdateStatus("ready");
        }
      });
    } catch {
      setUpdateStatus("available");
    }
  };

  const handleRestart = async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  };

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {updateStatus === "available" && (
        <>
          <span>v{updateVersion} available</span>
          <button className="update-banner-btn" onClick={handleInstall}>Install</button>
          <button className="update-banner-dismiss" onClick={dismissUpdate} aria-label="Dismiss update">✕</button>
        </>
      )}
      {updateStatus === "downloading" && (
        <>
          <span>Downloading update… {updateProgress}%</span>
          <progress className="update-banner-progress" value={updateProgress} max={100} />
        </>
      )}
      {updateStatus === "ready" && (
        <>
          <span>Restart to apply update</span>
          <button className="update-banner-btn" onClick={handleRestart}>Restart Now</button>
          <button className="update-banner-dismiss" onClick={dismissUpdate} aria-label="Dismiss update">✕</button>
        </>
      )}
    </div>
  );
}

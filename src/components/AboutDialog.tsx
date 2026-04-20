import { useEffect, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getAppVersion, getLogPath } from "@/lib/tauri-commands";
import "@/styles/about-dialog.css";

interface Props {
  onClose: () => void;
}

export function AboutDialog({ onClose }: Props) {
  const [version, setVersion] = useState<string>("");
  const [logPath, setLogPath] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getAppVersion()
      .then((v) => setVersion(v))
      .catch(() => setVersion("unknown"));
    getLogPath()
      .then((path) => setLogPath(path))
      .catch(() => setLogPath("Unavailable"));
  }, []);

  const handleCopy = async () => {
    await writeText(logPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dialog-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>mdownreview</h2>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <p className="dialog-version">Version {version || "…"}</p>
          <div className="dialog-log-section">
            <label className="dialog-label">Log file</label>
            <div className="dialog-log-path">
              <code>{logPath || "Loading…"}</code>
              <button className="comment-btn" onClick={handleCopy} disabled={!logPath}>
                {copied ? "Copied!" : "Copy path"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

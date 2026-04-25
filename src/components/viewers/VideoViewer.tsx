import { extname } from "@/lib/path-utils";
import { convertAssetUrl } from "@/lib/tauri-commands";

interface Props {
  path: string;
}

const MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

/**
 * Native HTML5 video viewer (#65 F2). Same loading model as AudioViewer:
 * `convertAssetUrl` produces an `asset://` URL the webview can stream
 * directly. Native controls only — no custom player chrome.
 */
export function VideoViewer({ path }: Props) {
  const filename = path.split(/[\\/]/).pop() || path;
  const mime = MIME_MAP[extname(path)] ?? "video/*";
  const src = convertAssetUrl(path);

  return (
    <div
      className="video-viewer"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div
        className="video-viewer-header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border, #d0d7de)",
          fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 600 }}>{filename}</span>
        <span style={{ color: "var(--color-muted, #656d76)" }}>{mime}</span>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          overflow: "auto",
        }}
      >
        <video
          controls
          preload="metadata"
          src={src}
          style={{ maxWidth: "100%", maxHeight: "100%" }}
        />
      </div>
    </div>
  );
}

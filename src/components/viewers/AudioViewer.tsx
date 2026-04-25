import { useState } from "react";
import { extname } from "@/lib/path-utils";
import { convertAssetUrl } from "@/lib/tauri-commands";

interface Props {
  path: string;
}

const MIME_MAP: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

/**
 * Native HTML5 audio viewer (#65 F1). Routes the absolute path through
 * `convertAssetUrl` (the chokepoint wrapper around `convertFileSrc`) so the
 * webview loads the file via the `asset://` protocol — no base64 round-trip,
 * no in-memory copy, and the browser owns streaming/seek. Lean pillar: native
 * controls only, no bundled player chrome.
 */
export function AudioViewer({ path }: Props) {
  const [duration, setDuration] = useState<number | null>(null);
  const filename = path.split(/[\\/]/).pop() || path;
  const mime = MIME_MAP[extname(path)] ?? "audio/*";
  const src = convertAssetUrl(path);

  return (
    <div
      className="audio-viewer"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div
        className="audio-viewer-header"
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
        {duration !== null && (
          <span style={{ color: "var(--color-muted, #656d76)" }}>
            {formatDuration(duration)}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <audio
          controls
          preload="metadata"
          src={src}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
          style={{ width: "100%", maxWidth: 640 }}
        />
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

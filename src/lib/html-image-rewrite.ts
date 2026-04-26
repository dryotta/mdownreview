import { fetchRemoteAsset } from "./tauri-commands";
import { warn } from "@/logger";

// When the HTML preview "Allow external images" toggle is on, we route every
// `<img src="http(s)://...">` through the existing `fetch_remote_asset`
// chokepoint (https-only, size/timeout-bounded, image/* allowlist) and swap
// the src to a `blob:` URL. CSP is NOT widened — the iframe still cannot
// reach the network, only the parent webview that runs this code can.
//
// Returns the rewritten HTML and a `revoke` callback the caller MUST invoke
// on unmount or content change to release the created blob URLs.

const REMOTE_IMG_RE = /<img\b([^>]*?)\bsrc\s*=\s*("https?:\/\/[^"]*"|'https?:\/\/[^']*')([^>]*)>/gi;

export interface RewriteResult {
  html: string;
  revoke: () => void;
}

export async function rewriteRemoteImages(html: string): Promise<RewriteResult> {
  const created: string[] = [];
  const matches: { full: string; pre: string; quoted: string; post: string; url: string }[] = [];
  REMOTE_IMG_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = REMOTE_IMG_RE.exec(html)); ) {
    const quoted = m[2];
    // Strip the surrounding quote character.
    const url = quoted.slice(1, -1);
    matches.push({ full: m[0], pre: m[1], quoted, post: m[3], url });
  }
  if (matches.length === 0) {
    return { html, revoke: () => {} };
  }

  // Fetch in parallel; resolve each to its blob URL (or null on failure).
  const resolved = await Promise.all(
    matches.map(async (m) => {
      try {
        const { bytes, contentType } = await fetchRemoteAsset(m.url);
        // Construct the Blob from a fresh ArrayBuffer copy — the underlying
        // buffer behind `bytes` is shared with the IPC response and may be
        // detached on some runtimes.
        const blob = new Blob([bytes.slice().buffer], { type: contentType || "application/octet-stream" });
        const blobUrl = URL.createObjectURL(blob);
        created.push(blobUrl);
        return blobUrl;
      } catch (e) {
        warn(`rewriteRemoteImages: failed to fetch ${m.url}: ${String(e)}`);
        return null;
      }
    }),
  );

  // Apply substitutions. Iterate on the original string so we don't have to
  // worry about overlapping rewrites — each match's `full` is unique enough
  // (URL plus surrounding attrs) that splitOnce-replace is safe.
  let out = html;
  for (let i = 0; i < matches.length; i++) {
    const blobUrl = resolved[i];
    if (!blobUrl) continue;
    const m = matches[i];
    const replacement = `<img${m.pre}src="${blobUrl}"${m.post}>`;
    out = out.replace(m.full, replacement);
  }

  return {
    html: out,
    revoke: () => {
      for (const u of created) {
        try { URL.revokeObjectURL(u); } catch { /* noop */ }
      }
      created.length = 0;
    },
  };
}

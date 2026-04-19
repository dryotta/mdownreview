import { readBinaryFile } from "@/lib/tauri-commands";
import { dirname, extname } from "@/lib/path-utils";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

function isLocalPath(src: string): boolean {
  return !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:") && !src.startsWith("//");
}

function resolvePath(src: string, htmlDir: string): string {
  if (src.startsWith("/") || src.startsWith("\\") || /^[a-zA-Z]:/.test(src)) return src;
  const clean = src.replace(/^\.\//, "");
  return `${htmlDir}/${clean}`;
}

export async function resolveLocalAssets(html: string, htmlFilePath: string): Promise<string> {
  const htmlDir = dirname(htmlFilePath);
  const srcPattern = /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi;

  const matches: { full: string; prefix: string; src: string; suffix: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = srcPattern.exec(html)) !== null) {
    if (isLocalPath(m[2])) {
      matches.push({ full: m[0], prefix: m[1], src: m[2], suffix: m[3], index: m.index });
    }
  }

  if (matches.length === 0) return html;

  const replacements = await Promise.all(
    matches.map(async ({ src }) => {
      const absPath = resolvePath(src, htmlDir);
      const mime = MIME_MAP[extname(absPath)] ?? "application/octet-stream";
      try {
        const base64 = await readBinaryFile(absPath);
        return `data:${mime};base64,${base64}`;
      } catch {
        return src;
      }
    })
  );

  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { prefix, suffix, index, full } = matches[i];
    result = result.slice(0, index) + prefix + replacements[i] + suffix + result.slice(index + full.length);
  }

  return result;
}

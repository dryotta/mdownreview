// URL-scheme classifiers used by viewer link handlers AND by the external-URL
// chokepoint in `lib/tauri-commands.ts`. Hoisted to one place so the viewer
// classifies clicks the same way the plugin gate enforces.
//
// Allowed external schemes: http(s), mailto, tel.
// Explicitly blocked: javascript, file, data, vbscript.
//
// The split is intentional — `EXTERNAL_LINK_SCHEME` is "delegate to OS
// opener", `BLOCKED_LINK_SCHEME` is "drop with a warn". Any scheme matching
// neither is treated as a workspace-relative path by viewer handlers.

export const EXTERNAL_LINK_SCHEME = /^(https?|mailto|tel):/i;
export const BLOCKED_LINK_SCHEME = /^(javascript|file|data|vbscript):/i;

import { resolveWorkspacePath } from "./path-utils";

// Routing chokepoint shared by MarkdownComponentsMap (in-process anchor
// click) AND HtmlPreviewView (postMessage from sandboxed iframe). Pure
// function — no React, no IPC. The caller dispatches based on the returned
// route kind (open external, open in workspace, ignore, etc.).
//
// Security notes (see docs/security.md rule 13):
//   • The `href` is treated as attacker-controlled (postMessage payloads
//     have no provenance guarantees beyond nonce+source filtering).
//   • Type guard FIRST — non-string / oversized inputs are dropped. The
//     4 KiB cap is well beyond legitimate href lengths and prevents
//     pathological inputs from reaching downstream regex/url parsers.
//   • Leading whitespace is stripped before scheme classification so
//     "\n\tjavascript:..." cannot bypass the blocklist by virtue of HTML
//     parsers tolerating leading whitespace in href attributes.
//   • BLOCKED_LINK_SCHEME is checked BEFORE EXTERNAL_LINK_SCHEME so that
//     a future overlap can never fall through to the external opener.

export interface RouteLinkContext {
  /** Directory of the document the link lives in (for relative resolution). */
  baseDir: string | undefined;
  /** Workspace root used to enforce containment. */
  workspaceRoot: string;
}

export type LinkRoute =
  | { kind: "fragment"; fragment: string }
  | { kind: "external"; href: string }
  | { kind: "workspace"; path: string; fragment?: string }
  | { kind: "blocked"; href: string; reason: string };

export function routeLinkClick(rawHref: unknown, ctx: RouteLinkContext): LinkRoute {
  if (typeof rawHref !== "string" || rawHref.length === 0 || rawHref.length > 4096) {
    return { kind: "blocked", href: typeof rawHref === "string" ? rawHref : "", reason: "type/length" };
  }
  // Strip leading whitespace (HTML parsers tolerate it; the blocklist must not).
  const href = rawHref.replace(/^\s+/, "");
  if (href.length === 0) {
    return { kind: "blocked", href: rawHref, reason: "type/length" };
  }
  if (BLOCKED_LINK_SCHEME.test(href)) {
    return { kind: "blocked", href, reason: "blocked-scheme" };
  }
  if (href.startsWith("#")) {
    return { kind: "fragment", fragment: href.slice(1) };
  }
  if (EXTERNAL_LINK_SCHEME.test(href)) {
    return { kind: "external", href };
  }
  if (!ctx.baseDir) {
    return { kind: "blocked", href, reason: "no-basedir" };
  }
  const resolved = resolveWorkspacePath(ctx.workspaceRoot, ctx.baseDir, href);
  if (!resolved) {
    return { kind: "blocked", href, reason: "outside-workspace" };
  }
  return {
    kind: "workspace",
    path: resolved.path,
    ...(resolved.fragment ? { fragment: resolved.fragment } : {}),
  };
}

import { describe, it, expect } from "vitest";
import { buildBridgeSrcDoc, isBridgeMsg } from "@/lib/html-bridge";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("buildBridgeSrcDoc", () => {
  it("embeds the nonce literal and the script before </body>", () => {
    const out = buildBridgeSrcDoc("<html><body>x</body></html>", { nonce: UUID, commentMode: true });
    expect(out).toContain(UUID);
    expect(out).toContain("mdr-html-bridge");
    // script is inserted before </body>, not after
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</body>"));
    // body gets the comment-mode marker AND the link-bridge marker
    expect(out).toContain('data-mdr-comment-mode="true"');
    expect(out).toContain('data-mdr-link-bridge="true"');
  });

  it("preserves case of the closing body tag", () => {
    const out = buildBridgeSrcDoc("<html><BODY>x</BODY></html>", { nonce: UUID, commentMode: true });
    expect(out).toContain("</BODY>");
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</BODY>"));
  });

  it("wraps a fragment that lacks <body> in one", () => {
    const out = buildBridgeSrcDoc("<p>fragment</p>", { nonce: UUID, commentMode: true });
    expect(out.startsWith('<body data-mdr-link-bridge="true" data-mdr-comment-mode="true">')).toBe(true);
    expect(out).toContain("<p>fragment</p>");
    expect(out).toContain("</body>");
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</body>"));
  });

  it("scripts-only mode (no commentMode) still tags body for link bridge", () => {
    const out = buildBridgeSrcDoc("<body>x</body>", { nonce: UUID });
    expect(out).toContain('data-mdr-link-bridge="true"');
    expect(out).not.toContain('data-mdr-comment-mode="true"');
  });

  it("rejects non-UUID nonces (defense against script injection)", () => {
    expect(() => buildBridgeSrcDoc("<body>x</body>", { nonce: "n" })).toThrow(/invalid nonce/);
    expect(() => buildBridgeSrcDoc("<body>x</body>", { nonce: '"); evil(); //' })).toThrow(/invalid nonce/);
  });

  // B2 forward-fix: anchor clicks in comment mode must NOT navigate the iframe.
  it("script suppresses navigation when click target is inside an <a>", () => {
    const out = buildBridgeSrcDoc("<body>x</body>", { nonce: UUID, commentMode: true });
    expect(out).toMatch(/closest\s*&&\s*t\.closest\("a"\)/);
    expect(out).toContain("e.preventDefault()");
    expect(out).toContain("e.stopPropagation()");
  });

  // Iter 11 re-fix: anchor suppression must run before the selection
  // non-empty early-return inside the comment-click handler.
  it("anchor suppression runs before the selection-non-empty early-return in the click handler", () => {
    const out = buildBridgeSrcDoc("<body>x</body>", { nonce: UUID, commentMode: true });
    // Isolate the comment-mode click handler — it's the one that gates on
    // commentActive(). The link interceptor (gated on linkActive()) is a
    // separate addEventListener call.
    const handlers = out.split('document.addEventListener("click"').slice(1);
    // Find the comment-mode click handler (the one referencing commentActive).
    const commentSegment = handlers.find((h) => h.includes("commentActive()"));
    expect(commentSegment).toBeTruthy();
    const seg = commentSegment!;
    const closestIdx = seg.indexOf('t.closest("a")');
    const preventIdx = seg.indexOf("e.preventDefault()");
    const selectionEarlyReturnIdx = seg.search(/sel\s*&&\s*sel\.toString\(\)\.length\s*>\s*0/);
    expect(closestIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeGreaterThan(-1);
    expect(selectionEarlyReturnIdx).toBeGreaterThan(-1);
    expect(closestIdx).toBeLessThan(selectionEarlyReturnIdx);
    expect(preventIdx).toBeLessThan(selectionEarlyReturnIdx);
  });

  it("installs a link-interceptor click handler gated on linkActive()", () => {
    const out = buildBridgeSrcDoc("<body>x</body>", { nonce: UUID });
    expect(out).toContain('type:"link"');
    expect(out).toContain("linkActive()");
    expect(out).toContain('mdrLinkBridge');
  });
});

describe("isBridgeMsg", () => {
  it("accepts a well-formed selection message", () => {
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "selection" })).toBe(true);
  });
  it("accepts a well-formed click message", () => {
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "click" })).toBe(true);
  });
  it("accepts a well-formed link message", () => {
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "link", href: "https://x" })).toBe(true);
  });
  it("rejects link message with non-string href", () => {
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "link", href: 42 })).toBe(false);
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "link" })).toBe(false);
  });
  it("rejects foreign source", () => {
    expect(isBridgeMsg({ source: "other", nonce: "n", type: "click" })).toBe(false);
  });
  it("rejects non-string nonce", () => {
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: 1, type: "click" })).toBe(false);
  });
  it("rejects unknown type", () => {
    expect(isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "weird" })).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isBridgeMsg(null)).toBe(false);
    expect(isBridgeMsg("string")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { buildBridgeSrcDoc, isBridgeMsg } from "@/lib/html-bridge";

describe("buildBridgeSrcDoc", () => {
  it("embeds the nonce literal and the script before </body>", () => {
    const out = buildBridgeSrcDoc("<html><body>x</body></html>", { nonce: "abc-123" });
    expect(out).toContain("abc-123");
    expect(out).toContain("mdr-html-bridge");
    // script is inserted before </body>, not after
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</body>"));
    // body gets the comment-mode marker
    expect(out).toContain('data-mdr-comment-mode="true"');
  });

  it("preserves case of the closing body tag", () => {
    const out = buildBridgeSrcDoc("<html><BODY>x</BODY></html>", { nonce: "n" });
    expect(out).toContain("</BODY>");
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</BODY>"));
  });

  it("wraps a fragment that lacks <body> in one", () => {
    const out = buildBridgeSrcDoc("<p>fragment</p>", { nonce: "n" });
    expect(out.startsWith('<body data-mdr-comment-mode="true">')).toBe(true);
    expect(out).toContain("<p>fragment</p>");
    expect(out).toContain("</body>");
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</body>"));
  });

  // B2 forward-fix: anchor clicks in comment mode must NOT navigate the iframe.
  // The iframe runs cross-origin under `allow-scripts`, so we cannot reach into
  // it from the host to assert behaviour at runtime — assert the script string
  // contains the closest("a")+preventDefault path instead.
  it("script suppresses navigation when click target is inside an <a>", () => {
    const out = buildBridgeSrcDoc("<body>x</body>", { nonce: "n" });
    expect(out).toMatch(/closest\s*&&\s*t\.closest\("a"\)/);
    expect(out).toContain("e.preventDefault()");
    expect(out).toContain("e.stopPropagation()");
  });
});

describe("isBridgeMsg", () => {
  it("accepts a well-formed selection message", () => {
    expect(
      isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "selection" }),
    ).toBe(true);
  });
  it("accepts a well-formed click message", () => {
    expect(
      isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "click" }),
    ).toBe(true);
  });
  it("rejects foreign source", () => {
    expect(isBridgeMsg({ source: "other", nonce: "n", type: "click" })).toBe(false);
  });
  it("rejects non-string nonce", () => {
    expect(
      isBridgeMsg({ source: "mdr-html-bridge", nonce: 1, type: "click" }),
    ).toBe(false);
  });
  it("rejects unknown type", () => {
    expect(
      isBridgeMsg({ source: "mdr-html-bridge", nonce: "n", type: "weird" }),
    ).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isBridgeMsg(null)).toBe(false);
    expect(isBridgeMsg("string")).toBe(false);
  });
});

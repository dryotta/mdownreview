import { describe, it, expect } from "vitest";
import { routeLinkClick } from "../url-policy";

const ctx = { baseDir: "/wk/sub", workspaceRoot: "/wk" };

describe("routeLinkClick", () => {
  it("classifies fragment links", () => {
    const r = routeLinkClick("#sec-2", ctx);
    expect(r).toEqual({ kind: "fragment", fragment: "sec-2" });
  });

  it("classifies http(s) external links", () => {
    expect(routeLinkClick("https://example.com/x", ctx)).toEqual({
      kind: "external", href: "https://example.com/x",
    });
    expect(routeLinkClick("HTTP://Example.com", ctx).kind).toBe("external");
  });

  it("classifies mailto/tel as external", () => {
    expect(routeLinkClick("mailto:a@b.com", ctx).kind).toBe("external");
    expect(routeLinkClick("tel:+15551234", ctx).kind).toBe("external");
  });

  it("resolves workspace-relative paths", () => {
    const r = routeLinkClick("./other.md", ctx);
    expect(r.kind).toBe("workspace");
    if (r.kind === "workspace") {
      expect(r.path).toBe("/wk/sub/other.md");
    }
  });

  it("preserves fragment on workspace paths", () => {
    const r = routeLinkClick("./other.md#h1", ctx);
    expect(r.kind).toBe("workspace");
    if (r.kind === "workspace") {
      expect(r.path).toBe("/wk/sub/other.md");
      expect(r.fragment).toBe("h1");
    }
  });

  it("blocks javascript: scheme", () => {
    const r = routeLinkClick("javascript:alert(1)", ctx);
    expect(r).toEqual({ kind: "blocked", href: "javascript:alert(1)", reason: "blocked-scheme" });
  });

  it("blocks file: scheme", () => {
    expect(routeLinkClick("file:///etc/passwd", ctx).kind).toBe("blocked");
  });

  it("blocks data: scheme", () => {
    expect(routeLinkClick("data:text/html,<script>", ctx).kind).toBe("blocked");
  });

  it("blocks vbscript: scheme", () => {
    expect(routeLinkClick("vbscript:msgbox", ctx).kind).toBe("blocked");
  });

  it("blocks paths that escape the workspace", () => {
    const r = routeLinkClick("../../../../etc/passwd", ctx);
    expect(r.kind).toBe("blocked");
    if (r.kind === "blocked") expect(r.reason).toBe("outside-workspace");
  });

  it("blocks oversized hrefs", () => {
    const big = "https://example.com/" + "a".repeat(5000);
    const r = routeLinkClick(big, ctx);
    expect(r.kind).toBe("blocked");
    if (r.kind === "blocked") expect(r.reason).toBe("type/length");
  });

  it("blocks non-string input", () => {
    expect(routeLinkClick(undefined, ctx).kind).toBe("blocked");
    expect(routeLinkClick(null, ctx).kind).toBe("blocked");
    expect(routeLinkClick(42, ctx).kind).toBe("blocked");
    expect(routeLinkClick({ href: "x" }, ctx).kind).toBe("blocked");
  });

  it("strips leading whitespace before scheme classification", () => {
    // A naive `startsWith("javascript:")` would miss this; we strip first.
    const r = routeLinkClick("\n\t javascript:alert(1)", ctx);
    expect(r.kind).toBe("blocked");
    if (r.kind === "blocked") expect(r.reason).toBe("blocked-scheme");
  });

  it("blocks workspace-relative when no baseDir is supplied", () => {
    const r = routeLinkClick("./x.md", { baseDir: undefined, workspaceRoot: "/wk" });
    expect(r.kind).toBe("blocked");
    if (r.kind === "blocked") expect(r.reason).toBe("no-basedir");
  });
});

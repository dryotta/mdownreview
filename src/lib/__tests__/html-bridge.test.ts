import { describe, it, expect } from "vitest";
import { buildBridgeScript, injectBridgeScript } from "@/lib/html-bridge";

describe("html-bridge", () => {
  it("buildBridgeScript embeds the nonce literal", () => {
    const s = buildBridgeScript({ nonce: "abc-123" });
    expect(s).toContain("abc-123");
    expect(s.startsWith("<script>")).toBe(true);
    expect(s.trimEnd().endsWith("</script>")).toBe(true);
    expect(s).toContain("mdr-html-bridge");
  });

  it("injectBridgeScript splices before </body> (case-insensitive)", () => {
    const out = injectBridgeScript("<html><body>x</body></html>", "<script>S</script>");
    expect(out).toBe("<html><body>x<script>S</script></body></html>");
    const out2 = injectBridgeScript("<html><BODY>x</BODY></html>", "<script>S</script>");
    expect(out2).toBe("<html><BODY>x<script>S</script></BODY></html>");
  });

  it("injectBridgeScript appends when no </body> is present", () => {
    const out = injectBridgeScript("<html><body>x</html>", "<script>S</script>");
    expect(out).toBe("<html><body>x</html><script>S</script>");
    const out2 = injectBridgeScript("<p>fragment</p>", "<script>S</script>");
    expect(out2).toBe("<p>fragment</p><script>S</script>");
  });
});

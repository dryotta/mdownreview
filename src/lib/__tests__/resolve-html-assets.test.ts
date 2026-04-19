import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveLocalAssets } from "@/lib/resolve-html-assets";

vi.mock("@/lib/tauri-commands", () => ({
  readBinaryFile: vi.fn(),
}));

import { readBinaryFile } from "@/lib/tauri-commands";

describe("resolveLocalAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readBinaryFile).mockResolvedValue("AAAA");
  });

  it("replaces relative img src with data URL", async () => {
    const html = '<img src="photo.png">';
    const result = await resolveLocalAssets(html, "/docs/page.html");
    expect(result).toContain("data:image/png;base64,AAAA");
    expect(result).not.toContain("photo.png");
  });

  it("resolves paths relative to HTML file directory", async () => {
    const html = '<img src="./images/cat.jpg">';
    await resolveLocalAssets(html, "/docs/page.html");
    expect(readBinaryFile).toHaveBeenCalledWith("/docs/images/cat.jpg");
  });

  it("leaves http URLs untouched", async () => {
    const html = '<img src="https://example.com/img.png">';
    const result = await resolveLocalAssets(html, "/docs/page.html");
    expect(result).toBe(html);
    expect(readBinaryFile).not.toHaveBeenCalled();
  });

  it("leaves data URLs untouched", async () => {
    const html = '<img src="data:image/png;base64,AAAA">';
    const result = await resolveLocalAssets(html, "/docs/page.html");
    expect(result).toBe(html);
  });

  it("handles multiple images", async () => {
    const html = '<img src="a.png"><img src="b.jpg">';
    const result = await resolveLocalAssets(html, "/docs/page.html");
    expect(result).toContain("data:image/png;base64,AAAA");
    expect(result).toContain("data:image/jpeg;base64,AAAA");
  });

  it("handles failed loads gracefully", async () => {
    vi.mocked(readBinaryFile).mockRejectedValue(new Error("not found"));
    const html = '<img src="missing.png">';
    const result = await resolveLocalAssets(html, "/docs/page.html");
    expect(result).toContain("missing.png");
  });
});

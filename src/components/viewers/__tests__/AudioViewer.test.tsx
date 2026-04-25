import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudioViewer } from "../AudioViewer";

vi.mock("@/lib/tauri-commands", () => ({
  convertAssetUrl: vi.fn((p: string) => `asset://localhost/${encodeURIComponent(p)}`),
}));

import { convertAssetUrl } from "@/lib/tauri-commands";

describe("AudioViewer", () => {
  beforeEach(() => {
    vi.mocked(convertAssetUrl).mockClear();
    vi.mocked(convertAssetUrl).mockImplementation(
      (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
    );
  });

  it("renders <audio> element with controls and asset:// src", () => {
    const { container } = render(<AudioViewer path="/music/song.mp3" />);
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio!.hasAttribute("controls")).toBe(true);
    const src = audio!.getAttribute("src") ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain("asset://");
    expect(convertAssetUrl).toHaveBeenCalledWith("/music/song.mp3");
  });

  it("uses preload='metadata' so the browser doesn't fetch full audio up front", () => {
    const { container } = render(<AudioViewer path="/music/song.mp3" />);
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("preload")).toBe("metadata");
  });

  it("shows filename and MIME hint in the header", () => {
    render(<AudioViewer path="/music/song.mp3" />);
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(screen.getByText("audio/mpeg")).toBeInTheDocument();
  });

  it("falls back to audio/* for unknown audio extensions", () => {
    render(<AudioViewer path="/music/song.xyz" />);
    expect(screen.getByText("audio/*")).toBeInTheDocument();
  });
});

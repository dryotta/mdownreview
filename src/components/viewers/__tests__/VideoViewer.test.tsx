import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VideoViewer } from "../VideoViewer";

vi.mock("@/lib/tauri-commands", () => ({
  convertAssetUrl: vi.fn((p: string) => `asset://localhost/${encodeURIComponent(p)}`),
}));

import { convertAssetUrl } from "@/lib/tauri-commands";

describe("VideoViewer", () => {
  beforeEach(() => {
    vi.mocked(convertAssetUrl).mockClear();
    vi.mocked(convertAssetUrl).mockImplementation(
      (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
    );
  });

  it("renders <video> element with controls and asset:// src", () => {
    const { container } = render(<VideoViewer path="/movies/clip.mp4" />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.hasAttribute("controls")).toBe(true);
    const src = video!.getAttribute("src") ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain("asset://");
    expect(convertAssetUrl).toHaveBeenCalledWith("/movies/clip.mp4");
  });

  it("uses preload='metadata' and constrains size with maxWidth", () => {
    const { container } = render(<VideoViewer path="/movies/clip.mp4" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.style.maxWidth).toBe("100%");
  });

  it("shows filename and MIME hint in the header", () => {
    render(<VideoViewer path="/movies/clip.mp4" />);
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("video/mp4")).toBeInTheDocument();
  });

  it("falls back to video/* for unknown video extensions", () => {
    render(<VideoViewer path="/movies/clip.xyz" />);
    expect(screen.getByText("video/*")).toBeInTheDocument();
  });
});

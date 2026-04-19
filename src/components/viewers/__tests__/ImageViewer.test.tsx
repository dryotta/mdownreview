import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageViewer } from "../ImageViewer";
import * as core from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core");

describe("ImageViewer", () => {
  beforeEach(() => {
    vi.mocked(core.convertFileSrc).mockImplementation((path: string) => "asset://localhost/" + encodeURIComponent(path));
  });

  it("renders image with asset URL", () => {
    render(<ImageViewer path="/photos/test.png" />);
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("asset://");
  });

  it("shows filename in header", () => {
    render(<ImageViewer path="/photos/test.png" />);
    expect(screen.getByText("test.png")).toBeInTheDocument();
  });

  it("does not render any comment UI", () => {
    const { container } = render(<ImageViewer path="/photos/test.png" />);
    expect(container.querySelector(".comment-plus-btn")).toBeNull();
    expect(container.querySelector(".comment-margin-wrapper")).toBeNull();
  });
});

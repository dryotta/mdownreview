import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BinaryPlaceholder } from "../BinaryPlaceholder";

// ─── 12.2: BinaryPlaceholder ──────────────────────────────────────────────────

describe("12.2 – BinaryPlaceholder", () => {
  it("renders 'cannot be displayed' message", () => {
    render(<BinaryPlaceholder path="/docs/image.png" />);
    expect(screen.getByText(/cannot be displayed/i)).toBeInTheDocument();
  });

  it("renders the file name", () => {
    render(<BinaryPlaceholder path="/docs/image.png" />);
    expect(screen.getByText("image.png")).toBeInTheDocument();
  });

  it("renders file name from nested path", () => {
    render(<BinaryPlaceholder path="/some/deep/path/photo.jpg" />);
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
  });

  it("renders size when provided", () => {
    render(<BinaryPlaceholder path="/docs/video.mp4" size={2048} />);
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it("does not render size when omitted", () => {
    render(<BinaryPlaceholder path="/docs/image.png" />);
    expect(document.querySelector(".binary-size")).not.toBeInTheDocument();
  });
});

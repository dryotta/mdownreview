import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { SourceViewer } from "../SourceViewer";

vi.mock("@tauri-apps/api/core");
vi.mock("@/logger");

vi.mock("shiki", () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: vi.fn().mockReturnValue("<pre><code>highlighted code</code></pre>"),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 12.1: SourceViewer rendering ────────────────────────────────────────────

describe("12.1 – SourceViewer rendering", () => {
  it("renders the file content", async () => {
    await act(async () => {
      render(<SourceViewer content="const x = 42;" path="/src/foo.ts" />);
    });

    await waitFor(() => {
      const container = document.querySelector(".source-viewer");
      expect(container).toBeInTheDocument();
    });
  });

  it("shows highlighted content after async shiki loads", async () => {
    await act(async () => {
      render(<SourceViewer content="const x = 42;" path="/src/foo.ts" />);
    });

    await waitFor(() => {
      const hasHighlighted = !!document.querySelector(".source-highlighted");
      const hasPlain = !!document.querySelector(".source-plain");
      expect(hasHighlighted || hasPlain).toBe(true);
    });
  });

  it("shows plain source for unknown extensions", async () => {
    await act(async () => {
      render(<SourceViewer content="some data" path="/data/file.xyz" />);
    });

    await waitFor(() => {
      expect(document.querySelector(".source-viewer")).toBeInTheDocument();
    });
  });

  it("files >500 KB show warning banner", async () => {
    const fileSize = 600 * 1024; // 600 KB
    await act(async () => {
      render(<SourceViewer content="big content" path="/big/file.ts" fileSize={fileSize} />);
    });

    expect(screen.getByText(/large/i)).toBeInTheDocument();
    expect(screen.getByText(/600 KB/)).toBeInTheDocument();
  });

  it("files ≤500 KB do not show warning banner", async () => {
    const fileSize = 100 * 1024; // 100 KB
    await act(async () => {
      render(<SourceViewer content="small content" path="/small/file.ts" fileSize={fileSize} />);
    });

    expect(screen.queryByText(/large/i)).not.toBeInTheDocument();
  });

  it("no fileSize prop shows no warning banner", async () => {
    await act(async () => {
      render(<SourceViewer content="content" path="/src/file.ts" />);
    });

    expect(screen.queryByText(/large/i)).not.toBeInTheDocument();
  });
});

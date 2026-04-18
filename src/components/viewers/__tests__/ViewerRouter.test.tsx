import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewerRouter } from "../ViewerRouter";
import { useStore } from "@/store";

vi.mock("@tauri-apps/api/core");
vi.mock("@/logger");

// Mock child viewers as simple test stubs
vi.mock("../MarkdownViewer", () => ({
  MarkdownViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="markdown-viewer" data-path={filePath}>MarkdownViewer</div>
  ),
}));

vi.mock("../SourceViewer", () => ({
  SourceViewer: ({ path }: { path: string }) => (
    <div data-testid="source-viewer" data-path={path}>SourceViewer</div>
  ),
}));

vi.mock("../BinaryPlaceholder", () => ({
  BinaryPlaceholder: ({ path }: { path: string }) => (
    <div data-testid="binary-placeholder" data-path={path}>BinaryPlaceholder</div>
  ),
}));

vi.mock("../SkeletonLoader", () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading…</div>,
}));

// Mock useFileContent hook
vi.mock("@/hooks/useFileContent");
import { useFileContent } from "@/hooks/useFileContent";
const mockUseFileContent = useFileContent as ReturnType<typeof vi.fn>;

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ tabs: [], activeTabPath: null });
  mockUseFileContent.mockReset();
});

// ─── 8.3: ViewerRouter routing ───────────────────────────────────────────────

describe("8.3 – ViewerRouter routing", () => {
  it(".md extension routes to MarkdownViewer", () => {
    mockUseFileContent.mockReturnValue({ status: "ready", content: "# Hello" });
    useStore.setState({ tabs: [{ path: "/docs/README.md", scrollTop: 0 }] });

    render(<ViewerRouter path="/docs/README.md" />);
    expect(screen.getByTestId("markdown-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("source-viewer")).not.toBeInTheDocument();
  });

  it(".mdx extension routes to MarkdownViewer", () => {
    mockUseFileContent.mockReturnValue({ status: "ready", content: "# MDX" });
    useStore.setState({ tabs: [{ path: "/docs/page.mdx", scrollTop: 0 }] });

    render(<ViewerRouter path="/docs/page.mdx" />);
    expect(screen.getByTestId("markdown-viewer")).toBeInTheDocument();
  });

  it(".ts extension routes to SourceViewer", () => {
    mockUseFileContent.mockReturnValue({ status: "ready", content: "const x = 1;" });
    useStore.setState({ tabs: [{ path: "/src/index.ts", scrollTop: 0 }] });

    render(<ViewerRouter path="/src/index.ts" />);
    expect(screen.getByTestId("source-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("markdown-viewer")).not.toBeInTheDocument();
  });

  it("loading status shows SkeletonLoader", () => {
    mockUseFileContent.mockReturnValue({ status: "loading" });
    useStore.setState({ tabs: [{ path: "/docs/README.md", scrollTop: 0 }] });

    render(<ViewerRouter path="/docs/README.md" />);
    expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("markdown-viewer")).not.toBeInTheDocument();
  });

  it("binary status shows BinaryPlaceholder", () => {
    mockUseFileContent.mockReturnValue({ status: "binary" });
    useStore.setState({ tabs: [{ path: "/docs/image.png", scrollTop: 0 }] });

    render(<ViewerRouter path="/docs/image.png" />);
    expect(screen.getByTestId("binary-placeholder")).toBeInTheDocument();
  });

  it("error status shows error message", () => {
    mockUseFileContent.mockReturnValue({ status: "error", error: "file not found" });
    useStore.setState({ tabs: [{ path: "/missing.md", scrollTop: 0 }] });

    render(<ViewerRouter path="/missing.md" />);
    expect(screen.getByText(/Error loading file/)).toBeInTheDocument();
    expect(screen.getByText(/file not found/)).toBeInTheDocument();
  });
});

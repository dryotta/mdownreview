import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ViewerToolbar } from "../ViewerToolbar";
import { useStore } from "@/store";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core");
vi.mock("@/logger");

describe("ViewerToolbar", () => {
  it("renders source and visual toggle buttons", () => {
    render(<ViewerToolbar activeView="source" onViewChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /source/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /visual/i })).toBeInTheDocument();
  });

  it("highlights the active view", () => {
    render(<ViewerToolbar activeView="visual" onViewChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /visual/i })).toHaveClass("active");
    expect(screen.getByRole("button", { name: /source/i })).not.toHaveClass("active");
  });

  it("calls onViewChange when toggling", () => {
    const onChange = vi.fn();
    render(<ViewerToolbar activeView="source" onViewChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /visual/i }));
    expect(onChange).toHaveBeenCalledWith("visual");
  });

  it("does not render when hidden and no wrap toggle / zoom", () => {
    const { container } = render(
      <ViewerToolbar activeView="source" onViewChange={vi.fn()} hidden />
    );
    expect(container.querySelector(".viewer-toolbar")).toBeNull();
  });

  it("renders wrap button when showWrapToggle is true", () => {
    render(
      <ViewerToolbar activeView="source" onViewChange={vi.fn()} hidden showWrapToggle wordWrap={false} onToggleWrap={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /wrap/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /source/i })).toBeNull();
  });

  it("declares sticky positioning so it stays visible while scrolling content", () => {
    // jsdom does not compute `position: sticky`, so verify the rule exists in the source CSS.
    const css = readFileSync(
      resolve(__dirname, "../../../styles/viewer-toolbar.css"),
      "utf8",
    );
    const block = css.match(/\.viewer-toolbar\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/top:\s*0/);
    // Opaque background is required so scrolled content does not bleed through the sticky bar.
    expect(block).toMatch(/background:\s*var\(--color-bg\)/);
    expect(block).toMatch(/z-index:\s*\d+/);
  });

  // L1 — file action buttons live in `FileActionsBar`, not in the toolbar.
  // The toolbar no longer accepts a `path` prop.
  it("does not accept a `path` prop / does not render reveal/open buttons", () => {
    render(<ViewerToolbar activeView="source" onViewChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /reveal in folder/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open in default app/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open externally/i })).toBeNull();
  });

  // ── Iter 5 Group B: Comment on file button ────────────────────────────────
  describe("onCommentOnFile (iter 5 group B)", () => {
    it("does NOT render the button when no callback is provided", () => {
      render(<ViewerToolbar activeView="source" onViewChange={vi.fn()} />);
      expect(screen.queryByRole("button", { name: /comment on file/i })).toBeNull();
    });

    it("renders the button when a callback is provided", () => {
      render(
        <ViewerToolbar activeView="source" onViewChange={vi.fn()} onCommentOnFile={vi.fn()} />,
      );
      expect(screen.getByRole("button", { name: /comment on file/i })).toBeInTheDocument();
    });

    it("invokes onCommentOnFile when clicked", () => {
      const onCommentOnFile = vi.fn();
      render(
        <ViewerToolbar activeView="source" onViewChange={vi.fn()} onCommentOnFile={onCommentOnFile} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /comment on file/i }));
      expect(onCommentOnFile).toHaveBeenCalledTimes(1);
    });

    it("renders the toolbar (and button) even when hidden, no wrap toggle, and no zoom — entry point must be universal", () => {
      const { container } = render(
        <ViewerToolbar activeView="source" onViewChange={vi.fn()} hidden onCommentOnFile={vi.fn()} />,
      );
      expect(container.querySelector(".viewer-toolbar")).not.toBeNull();
      expect(screen.getByRole("button", { name: /comment on file/i })).toBeInTheDocument();
      // The Source/Visual toggle is still suppressed when `hidden` is set.
      expect(screen.queryByRole("button", { name: /^source$/i })).toBeNull();
    });
  });

  // ── Iter 6 F8 — workspace-wide "Next unresolved" button ─────────────────
  describe("Next unresolved (workspace) (iter 6 F8)", () => {
    beforeEach(() => {
      vi.mocked(invoke).mockReset();
      useStore.setState({ tabs: [], activeTabPath: null, focusedThreadId: null });
    });

    it("renders the button when onCommentOnFile is wired", () => {
      useStore.setState({
        tabs: [
          { path: "/a.md", scrollTop: 0, lastAccessedAt: 0 },
          { path: "/b.md", scrollTop: 0, lastAccessedAt: 0 },
        ],
        activeTabPath: "/a.md",
      });
      render(
        <ViewerToolbar activeView="source" onViewChange={vi.fn()} onCommentOnFile={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: /next unresolved/i }),
      ).toBeInTheDocument();
    });

    it("is disabled when only one tab is open (no other files)", () => {
      useStore.setState({
        tabs: [{ path: "/only.md", scrollTop: 0, lastAccessedAt: 0 }],
        activeTabPath: "/only.md",
      });
      render(
        <ViewerToolbar activeView="source" onViewChange={vi.fn()} onCommentOnFile={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: /next unresolved/i }),
      ).toBeDisabled();
    });

    it("clicking it switches activeTabPath to a file with unresolved threads", async () => {
      useStore.setState({
        tabs: [
          { path: "/clean.md", scrollTop: 0, lastAccessedAt: 0 },
          { path: "/has.md", scrollTop: 0, lastAccessedAt: 0 },
        ],
        activeTabPath: "/clean.md",
        focusedThreadId: null,
      });
      vi.mocked(invoke).mockImplementation(async (cmd, args) => {
        if (cmd === "get_file_comments") {
          return [];
        }
        if (cmd === "get_file_badges") {
          // Other paths excluding active.
          const paths = (args as { filePaths: string[] }).filePaths;
          const out: Record<string, { count: number; max_severity: "low" }> = {};
          for (const p of paths) {
            out[p] = { count: p === "/has.md" ? 2 : 0, max_severity: "low" };
          }
          return out;
        }
        return undefined;
      });

      render(
        <ViewerToolbar activeView="source" onViewChange={vi.fn()} onCommentOnFile={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /next unresolved/i }));

      await waitFor(() => expect(useStore.getState().activeTabPath).toBe("/has.md"));
    });
  });
});

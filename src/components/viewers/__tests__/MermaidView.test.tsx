import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const { addCommentMock, setFocusedThreadMock } = vi.hoisted(() => ({
  addCommentMock: vi.fn<(filePath: string, text: string, anchor?: unknown) => Promise<void>>(async () => {}),
  setFocusedThreadMock: vi.fn(),
}));

vi.mock("@/lib/vm/use-comments", () => ({
  useComments: () => ({ threads: [], comments: [], loading: false, reload: () => {} }),
}));

vi.mock("@/lib/vm/use-comment-actions", () => ({
  useCommentActions: () => ({ addComment: addCommentMock }),
}));

vi.mock("@/store", () => {
  const state = {
    setFocusedThread: setFocusedThreadMock,
    zoomByFiletype: {} as Record<string, number>,
    bumpZoom: () => {},
    setZoom: () => {},
  };
  const useStore = (selector: (s: typeof state) => unknown) => selector(state);
  (useStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useStore };
});

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">mock diagram</svg>' }),
  },
}));

import { MermaidView } from "../MermaidView";
import mermaid from "mermaid";

beforeEach(() => {
  addCommentMock.mockClear();
  setFocusedThreadMock.mockClear();
});

describe("MermaidView", () => {
  it("renders mermaid diagram", async () => {
    render(<MermaidView content="graph TD; A-->B;" />);
    await waitFor(() => {
      expect(screen.getByTitle("Mermaid diagram")).toBeInTheDocument();
    });
  });

  it("shows error for invalid syntax", async () => {
    (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Parse error"));
    render(<MermaidView content="invalid mermaid" />);
    await waitFor(() => {
      expect(screen.getByText(/error rendering/i)).toBeInTheDocument();
    });
  });

  it("provides export buttons", () => {
    render(<MermaidView content="graph TD; A-->B;" />);
    expect(screen.getByRole("button", { name: /png/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /svg/i })).toBeInTheDocument();
  });

  it("F1 — clicking a node opens composer; save dispatches kind:line with mapped line", async () => {
    // Mermaid v10/v11 emits flowchart nodes as
    // `<g class="node" id="<mermaidId>-flowchart-X-N">`. Source has the `A`
    // identifier on line 2, so clicking that node should resolve to line:2
    // via the id-based heuristic.
    const fakeSvg = `
      <svg>
        <g class="node" id="mermaid-x-flowchart-A-0"><text>Start</text></g>
        <g class="node" id="mermaid-x-flowchart-B-1"><text>End</text></g>
      </svg>
    `;
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ svg: fakeSvg });

    const content = "graph TD\n  A[Start] --> B[End]\n";
    render(<MermaidView content={content} path="/diagram.mmd" />);

    // Wait for the SVG to mount.
    const aNode = await waitFor(() => {
      const n = document.querySelector('g.node[id="mermaid-x-flowchart-A-0"]') as SVGGElement | null;
      if (!n) throw new Error("node not yet rendered");
      return n;
    });

    // The walk effect should have stamped data-source-line.
    await waitFor(() => {
      expect(aNode.getAttribute("data-source-line")).toBe("2");
    });

    // Click → composer opens.
    fireEvent.click(aNode);
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "explain start" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(addCommentMock).toHaveBeenCalledTimes(1);
    });
    const callArgs = addCommentMock.mock.calls[0];
    expect(callArgs[0]).toBe("/diagram.mmd");
    expect(callArgs[1]).toBe("explain start");
    expect(callArgs[2]).toEqual({ kind: "line", line: 2 });
  });

  it("F1 — node with no source mapping falls back to file-level (anchor undefined)", async () => {
    // Non-flowchart-id node + label that isn't in source → both heuristic
    // steps fail, so handleSave should dispatch with `anchor: undefined`.
    const fakeSvg = `
      <svg>
        <g class="node" id="some-other-id"><text>Nowhere</text></g>
      </svg>
    `;
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ svg: fakeSvg });

    render(<MermaidView content="graph TD\n  A --> B\n" path="/diagram.mmd" />);

    const node = await waitFor(() => {
      const n = document.querySelector('g.node') as SVGGElement | null;
      if (!n) throw new Error("node not yet rendered");
      return n;
    });
    expect(node.getAttribute("data-source-line")).toBeNull();

    fireEvent.click(node);
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "general" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(addCommentMock).toHaveBeenCalledTimes(1);
    });
    expect(addCommentMock.mock.calls[0][2]).toBeUndefined();
  });

  it("F1 — comment UI is hidden when no path is provided (markdown-embed mode)", async () => {
    const fakeSvg = `<svg><g class="node" id="mermaid-x-flowchart-A-0"><text>X</text></g></svg>`;
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ svg: fakeSvg });

    render(<MermaidView content="graph TD\n  A --> B\n" />);

    const node = await waitFor(() => {
      const n = document.querySelector('g.node') as SVGGElement | null;
      if (!n) throw new Error("node not yet rendered");
      return n;
    });
    fireEvent.click(node);
    // No composer, no addComment — embed mode is read-only.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(addCommentMock).not.toHaveBeenCalled();
  });
});

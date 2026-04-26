import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

const { addCommentMock } = vi.hoisted(() => ({
  addCommentMock: vi.fn<(filePath: string, text: string, anchor?: unknown) => Promise<void>>(
    async () => {},
  ),
}));

vi.mock("@tauri-apps/api/core");
vi.mock("@/logger");
vi.mock("@/lib/tauri-commands", () => ({
  resolveHtmlAssets: vi.fn((html: string) => Promise.resolve(html)),
  openExternalUrl: vi.fn(async () => {}),
  fetchRemoteAsset: vi.fn(async () => ({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    contentType: "image/png",
  })),
}));
vi.mock("@/lib/vm/use-comment-actions", () => ({
  useCommentActions: () => ({ addComment: addCommentMock }),
}));

import { HtmlPreviewView } from "../HtmlPreviewView";
import { openExternalUrl, fetchRemoteAsset } from "@/lib/tauri-commands";
import { useStore } from "@/store";

beforeEach(() => {
  addCommentMock.mockClear();
  (openExternalUrl as unknown as { mockClear: () => void }).mockClear();
  (fetchRemoteAsset as unknown as { mockClear: () => void }).mockClear();
});

describe("HtmlPreviewView — sandbox toggles (H1)", () => {
  it("renders sandboxed iframe with default safe sandbox", () => {
    const { container } = render(<HtmlPreviewView content="<h1>Hello</h1>" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(screen.getByRole("button", { name: /allow external images/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enable scripts/i })).toBeInTheDocument();
    cleanup();
  });

  it("shows safety warning banner", () => {
    render(<HtmlPreviewView content="<p>test</p>" />);
    expect(screen.getByText(/sandboxed preview/i)).toBeInTheDocument();
    cleanup();
  });

  it("toggling 'Allow external images' keeps sandbox safe and flips aria-pressed", () => {
    const { container } = render(<HtmlPreviewView content="<p>test</p>" />);
    const btn = screen.getByRole("button", { name: /allow external images/i });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-same-origin");
    const btn2 = screen.getByRole("button", { name: /disallow external images/i });
    expect(btn2.getAttribute("aria-pressed")).toBe("true");
    cleanup();
  });

  it("toggling 'Enable scripts' switches sandbox to allow-scripts (no allow-same-origin)", () => {
    const { container } = render(<HtmlPreviewView content="<p>test</p>" />);
    fireEvent.click(screen.getByRole("button", { name: /enable scripts/i }));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("sandbox")).toContain("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
    cleanup();
  });

  it("invariant: sandbox NEVER combines allow-scripts and allow-same-origin", () => {
    const { container } = render(<HtmlPreviewView content="<p>test</p>" />);
    const imgBtn = () => screen.getByRole("button", { name: /(allow|disallow) external images/i });
    const scrBtn = () => screen.getByRole("button", { name: /(enable|disable) scripts/i });
    const sandboxOf = () => container.querySelector("iframe")!.getAttribute("sandbox") ?? "";
    const combos: [boolean, boolean][] = [[false,false],[true,false],[false,true],[true,true],[true,false],[false,false]];
    let curImg = false, curScr = false;
    for (const [wantImg, wantScr] of combos) {
      if (wantImg !== curImg) { fireEvent.click(imgBtn()); curImg = wantImg; }
      if (wantScr !== curScr) { fireEvent.click(scrBtn()); curScr = wantScr; }
      const sb = sandboxOf();
      const hasScripts = sb.includes("allow-scripts");
      const hasSameOrigin = sb.includes("allow-same-origin");
      expect(hasScripts && hasSameOrigin).toBe(false);
    }
    cleanup();
  });

  it("with images on + scripts off, fetches remote <img> via fetch_remote_asset", async () => {
    // jsdom URL.createObjectURL is not implemented by default — stub it.
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let next = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${++next}`) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    try {
      const html = '<p><img src="https://cdn.example.com/x.png" alt="x"></p>';
      const { container } = render(<HtmlPreviewView content={html} filePath="/wk/page.html" />);
      fireEvent.click(screen.getByRole("button", { name: /allow external images/i }));
      await waitFor(() => {
        expect(fetchRemoteAsset).toHaveBeenCalledWith("https://cdn.example.com/x.png");
      });
      await waitFor(() => {
        const srcdoc = container.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
        expect(srcdoc).toMatch(/src="blob:mock-\d+"/);
      });
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      cleanup();
    }
  });
});

// Helper: dispatch a synthetic MessageEvent that mimics what the bridge IIFE
// would post. The handler filters by `event.source` so we have to spoof the
// iframe contentWindow as the source.
function dispatchBridgeMsg(
  iframe: HTMLIFrameElement | null,
  data: Record<string, unknown>,
  sourceOverride?: Window | null,
) {
  const source = sourceOverride !== undefined ? sourceOverride : (iframe?.contentWindow ?? null);
  const ev = new MessageEvent("message", { data, source: source as Window | null });
  act(() => {
    window.dispatchEvent(ev);
  });
}

function nonceOf(iframe: HTMLIFrameElement): string {
  const srcdoc = iframe.getAttribute("srcdoc") ?? "";
  const m = srcdoc.match(/NONCE=("[^"]+")/);
  if (!m) throw new Error("no NONCE in srcdoc");
  return JSON.parse(m[1]) as string;
}

describe("HtmlPreviewView — comment-mode bridge", () => {
  it("selection event triggers addComment with html_range", async () => {
    const { container } = render(<HtmlPreviewView content="<p>hi</p>" filePath="/wk/page.html" />);
    fireEvent.click(screen.getByRole("button", { name: /enter comment mode/i }));
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);

    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge",
      nonce,
      type: "selection",
      selectorPath: "body > p",
      startOffset: 0,
      endOffset: 2,
      selectedText: "hi",
      clientX: 10,
      clientY: 20,
    });

    const composer = await screen.findByTestId("html-preview-composer");
    const textarea = composer.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "looks weird" } });
    fireEvent.click(composer.querySelector(".comment-btn-primary") as HTMLButtonElement);

    await waitFor(() => expect(addCommentMock).toHaveBeenCalledTimes(1));
    const call = addCommentMock.mock.calls[0];
    expect(call[0]).toBe("/wk/page.html");
    expect(call[1]).toBe("looks weird");
    const anchor = call[2] as { kind: string; selector_path: string; start_offset: number; end_offset: number; selected_text: string };
    expect(anchor.kind).toBe("html_range");
    expect(anchor.selector_path).toBe("body > p");
    expect(anchor.start_offset).toBe(0);
    expect(anchor.end_offset).toBe(2);
    expect(anchor.selected_text).toBe("hi");
    cleanup();
  });

  it("click event triggers addComment with html_element", async () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    fireEvent.click(screen.getByRole("button", { name: /enter comment mode/i }));
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);

    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge",
      nonce,
      type: "click",
      selectorPath: "body > p",
      tag: "p",
      textPreview: "x",
      clientX: 5,
      clientY: 5,
    });

    const composer = await screen.findByTestId("html-preview-composer");
    const textarea = composer.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "noted" } });
    fireEvent.click(composer.querySelector(".comment-btn-primary") as HTMLButtonElement);

    await waitFor(() => expect(addCommentMock).toHaveBeenCalledTimes(1));
    const anchor = addCommentMock.mock.calls[0][2] as { kind: string; selector_path: string; tag: string; text_preview: string };
    expect(anchor.kind).toBe("html_element");
    expect(anchor.selector_path).toBe("body > p");
    expect(anchor.tag).toBe("p");
    expect(anchor.text_preview).toBe("x");
    cleanup();
  });

  it("messages with wrong nonce are ignored", () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    fireEvent.click(screen.getByRole("button", { name: /enter comment mode/i }));
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge",
      nonce: "WRONG",
      type: "click",
      selectorPath: "body",
      tag: "body",
      textPreview: "",
      clientX: 0,
      clientY: 0,
    });
    expect(screen.queryByTestId("html-preview-composer")).toBeNull();
    expect(addCommentMock).not.toHaveBeenCalled();
    cleanup();
  });

  it("messages from other windows are ignored", () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    fireEvent.click(screen.getByRole("button", { name: /enter comment mode/i }));
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge",
      nonce,
      type: "click",
      selectorPath: "body",
      tag: "body",
      textPreview: "",
      clientX: 0,
      clientY: 0,
    }, window);
    expect(screen.queryByTestId("html-preview-composer")).toBeNull();
    cleanup();
  });

  it("comment-mode toggle gates message handling", () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;

    // Initially OFF — no nonce in srcdoc, dispatching anything is dropped.
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge",
      nonce: "anything",
      type: "click",
      selectorPath: "body",
      tag: "body",
      textPreview: "",
      clientX: 0,
      clientY: 0,
    });
    expect(screen.queryByTestId("html-preview-composer")).toBeNull();

    // Toggle ON.
    fireEvent.click(screen.getByRole("button", { name: /enter comment mode/i }));
    const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe2);
    dispatchBridgeMsg(iframe2, {
      source: "mdr-html-bridge", nonce, type: "click",
      selectorPath: "body", tag: "body", textPreview: "", clientX: 0, clientY: 0,
    });
    expect(screen.getByTestId("html-preview-composer")).toBeInTheDocument();

    // Toggle OFF — composer dismissed and further events ignored.
    fireEvent.click(screen.getByRole("button", { name: /exit comment mode/i }));
    expect(screen.queryByTestId("html-preview-composer")).toBeNull();
    dispatchBridgeMsg(iframe2, {
      source: "mdr-html-bridge", nonce, type: "click",
      selectorPath: "body", tag: "body", textPreview: "", clientX: 0, clientY: 0,
    });
    expect(screen.queryByTestId("html-preview-composer")).toBeNull();
    cleanup();
  });
});

describe("HtmlPreviewView — link bridge in scripts mode (H2)", () => {
  function enableScripts() {
    fireEvent.click(screen.getByRole("button", { name: /enable scripts/i }));
  }

  it("external link → openExternalUrl", () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    enableScripts();
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge", nonce, type: "link", href: "https://example.com",
    });
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com");
    cleanup();
  });

  it("workspace link → store.openFile with resolved path", () => {
    useStore.setState({ root: "/wk" });
    const openFileSpy = vi.spyOn(useStore.getState(), "openFile").mockImplementation(() => {});
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    enableScripts();
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge", nonce, type: "link", href: "./other.md",
    });
    expect(openFileSpy).toHaveBeenCalledWith("/wk/other.md");
    openFileSpy.mockRestore();
    cleanup();
  });

  it("javascript: link is blocked, openExternalUrl NOT called", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    enableScripts();
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge", nonce, type: "link", href: "javascript:alert(1)",
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    cleanup();
  });

  it("non-string href is blocked", () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    enableScripts();
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const nonce = nonceOf(iframe);
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge", nonce, type: "link", href: 42,
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
    cleanup();
  });

  it("link message with wrong nonce is ignored", () => {
    const { container } = render(<HtmlPreviewView content="<p>x</p>" filePath="/wk/page.html" />);
    enableScripts();
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    dispatchBridgeMsg(iframe, {
      source: "mdr-html-bridge", nonce: "WRONG", type: "link", href: "https://evil.example",
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
    cleanup();
  });
});

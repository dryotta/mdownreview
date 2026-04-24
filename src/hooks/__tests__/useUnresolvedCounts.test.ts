import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { getUnresolvedCounts } from "@/lib/tauri-commands";
import { useUnresolvedCounts } from "../useUnresolvedCounts";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_eventName: string, _callback: unknown) =>
    Promise.resolve(() => {})
  ),
}));

vi.mock("@/lib/tauri-commands", () => ({
  getUnresolvedCounts: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUnresolvedCounts", () => {
  it("returns {} for empty filePaths array", async () => {
    const { result } = renderHook(() => useUnresolvedCounts([]));
    await act(async () => {});
    expect(result.current).toEqual({});
    expect(getUnresolvedCounts).not.toHaveBeenCalled();
  });

  it("calls getUnresolvedCounts IPC with provided paths", async () => {
    const mockCounts = { "/a.md": 3, "/b.md": 1 };
    vi.mocked(getUnresolvedCounts).mockResolvedValueOnce(mockCounts);

    const { result } = renderHook(() =>
      useUnresolvedCounts(["/a.md", "/b.md"])
    );
    await act(async () => {});

    expect(getUnresolvedCounts).toHaveBeenCalledWith(["/a.md", "/b.md"]);
    expect(result.current).toEqual(mockCounts);
  });

  it("re-fires when comments-changed event is emitted", async () => {
    vi.mocked(getUnresolvedCounts)
      .mockResolvedValueOnce({ "/a.md": 1 })
      .mockResolvedValueOnce({ "/a.md": 5 });

    const { result } = renderHook(() => useUnresolvedCounts(["/a.md"]));
    await act(async () => {});
    expect(result.current).toEqual({ "/a.md": 1 });

    // Find the comments-changed listener and invoke it
    const commentsCall = vi.mocked(listen).mock.calls.find(
      (c) => c[0] === "comments-changed"
    );
    expect(commentsCall).toBeDefined();
    const commentsCallback = commentsCall![1] as () => void;

    await act(async () => {
      commentsCallback();
    });
    await act(async () => {});

    expect(getUnresolvedCounts).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ "/a.md": 5 });
  });

  it("re-fires when file-changed event with kind=review is emitted", async () => {
    vi.mocked(getUnresolvedCounts)
      .mockResolvedValueOnce({ "/a.md": 1 })
      .mockResolvedValueOnce({ "/a.md": 7 });

    const { result } = renderHook(() => useUnresolvedCounts(["/a.md"]));
    await act(async () => {});
    expect(result.current).toEqual({ "/a.md": 1 });

    // Find the file-changed listener and invoke with kind=review
    const fileCall = vi.mocked(listen).mock.calls.find(
      (c) => c[0] === "file-changed"
    );
    expect(fileCall).toBeDefined();
    const fileCallback = fileCall![1] as (event: {
      payload: { kind: string };
    }) => void;

    await act(async () => {
      fileCallback({ payload: { kind: "review" } });
    });
    await act(async () => {});

    expect(getUnresolvedCounts).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ "/a.md": 7 });
  });

  it("deduplicates when result is structurally equal", async () => {
    const counts = { "/a.md": 2 };
    vi.mocked(getUnresolvedCounts)
      .mockResolvedValueOnce({ "/a.md": 2 })
      .mockResolvedValueOnce({ "/a.md": 2 });

    const { result } = renderHook(() => useUnresolvedCounts(["/a.md"]));
    await act(async () => {});

    const firstRef = result.current;
    expect(firstRef).toEqual(counts);

    // Trigger reload via comments-changed
    const commentsCall = vi.mocked(listen).mock.calls.find(
      (c) => c[0] === "comments-changed"
    );
    const commentsCallback = commentsCall![1] as () => void;

    await act(async () => {
      commentsCallback();
    });
    await act(async () => {});

    // Should be the same reference since values are structurally equal
    expect(result.current).toBe(firstRef);
  });
});

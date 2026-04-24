import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTheme } from "../useTheme";

describe("useTheme", () => {
  it("returns 'light' when data-theme is not set (default)", () => {
    document.documentElement.removeAttribute("data-theme");
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current).toBe("light");
    unmount();
  });

  it("returns current data-theme value when set", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current).toBe("dark");
    unmount();
    document.documentElement.removeAttribute("data-theme");
  });

  it("reactively updates when data-theme attribute changes", async () => {
    document.documentElement.removeAttribute("data-theme");
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current).toBe("light");

    act(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    await waitFor(() => {
      expect(result.current).toBe("dark");
    });

    unmount();
    document.documentElement.removeAttribute("data-theme");
  });
});

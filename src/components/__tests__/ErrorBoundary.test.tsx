import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

vi.mock("@/logger");
import * as logger from "@/logger";

// A component that always throws during render
function ThrowingComponent({ message }: { message: string }): React.ReactNode {
  throw new Error(message);
}

// ─── 12.3: ErrorBoundary ─────────────────────────────────────────────────────

describe("12.3 – ErrorBoundary", () => {
  it("child throwing during render shows fallback", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent message="boom" />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("logger.error is called with the error message", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent message="render crashed" />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("render crashed")
    );

    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("custom fallback renders when provided", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error UI</div>}>
        <ThrowingComponent message="oops" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});

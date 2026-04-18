import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AboutDialog } from "../AboutDialog";

vi.mock("@tauri-apps/api/core");
vi.mock("@/logger");

// Mock tauri-commands to control getLogPath
vi.mock("@/lib/tauri-commands", () => ({
  getLogPath: vi.fn(),
}));

import { getLogPath } from "@/lib/tauri-commands";
const mockGetLogPath = getLogPath as ReturnType<typeof vi.fn>;

// Mock clipboard plugin
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
const mockWriteText = writeText as ReturnType<typeof vi.fn>;

const LOG_PATH = "/home/user/.local/share/markdown-review/app.log";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLogPath.mockResolvedValue(LOG_PATH);
});

// ─── 14.4: AboutDialog ───────────────────────────────────────────────────────

describe("14.4 – AboutDialog", () => {
  it("renders version text", async () => {
    await act(async () => {
      render(<AboutDialog onClose={vi.fn()} />);
    });
    expect(screen.getByText(/Version 0\.1\.0/)).toBeInTheDocument();
  });

  it("renders log path from mocked getLogPath", async () => {
    await act(async () => {
      render(<AboutDialog onClose={vi.fn()} />);
    });

    expect(screen.getByText(LOG_PATH)).toBeInTheDocument();
  });

  it("shows 'Loading…' before log path resolves", () => {
    // Return a promise that never resolves in this test
    mockGetLogPath.mockReturnValue(new Promise(() => {}));

    render(<AboutDialog onClose={vi.fn()} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows 'Unavailable' when getLogPath rejects", async () => {
    mockGetLogPath.mockRejectedValue(new Error("no path"));

    await act(async () => {
      render(<AboutDialog onClose={vi.fn()} />);
    });

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("'Copy path' button calls clipboard writeText with log path", async () => {
    await act(async () => {
      render(<AboutDialog onClose={vi.fn()} />);
    });

    expect(screen.getByText(LOG_PATH)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy path/i }));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(LOG_PATH);
    });
  });

  it("'Copy path' shows 'Copied!' after click", async () => {
    await act(async () => {
      render(<AboutDialog onClose={vi.fn()} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /copy path/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied!/i })).toBeInTheDocument();
    });
  });

  it("'Copy path' button is disabled when logPath is empty", () => {
    mockGetLogPath.mockReturnValue(new Promise(() => {}));

    render(<AboutDialog onClose={vi.fn()} />);

    const copyBtn = screen.getByRole("button", { name: /copy path/i });
    expect(copyBtn).toBeDisabled();
  });

  it("onClose is called when close button is clicked", async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<AboutDialog onClose={onClose} />);
    });

    fireEvent.click(screen.getByRole("button", { name: "×" }));
    expect(onClose).toHaveBeenCalled();
  });
});

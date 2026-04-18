import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MockedFunction } from "vitest";

// Explicitly mock @tauri-apps/plugin-log before any imports that use it.
// Vitest hoists vi.mock() calls, so logger.ts will receive the mocked module.
vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn().mockResolvedValue(undefined),
  info: vi.fn().mockResolvedValue(undefined),
  debug: vi.fn().mockResolvedValue(undefined),
  trace: vi.fn().mockResolvedValue(undefined),
}));

// Import the mocked module to assert on its stubs.
import * as pluginLog from "@tauri-apps/plugin-log";

// Import the real logger module under test — it will receive the mocked
// plugin-log because vi.mock() is hoisted above all imports.
import * as logger from "@/logger";

type AnyFn = MockedFunction<(msg: string) => Promise<void>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logger – [web] prefix delegation", () => {
  it("logger.error calls pluginLog.error with [web] prefix", async () => {
    await logger.error("something went wrong");
    expect((pluginLog.error as AnyFn)).toHaveBeenCalledOnce();
    expect((pluginLog.error as AnyFn)).toHaveBeenCalledWith("[web] something went wrong");
  });

  it("logger.warn calls pluginLog.warn with [web] prefix", async () => {
    await logger.warn("watch out");
    expect((pluginLog.warn as AnyFn)).toHaveBeenCalledOnce();
    expect((pluginLog.warn as AnyFn)).toHaveBeenCalledWith("[web] watch out");
  });

  it("logger.info calls pluginLog.info with [web] prefix", async () => {
    await logger.info("app started");
    expect((pluginLog.info as AnyFn)).toHaveBeenCalledOnce();
    expect((pluginLog.info as AnyFn)).toHaveBeenCalledWith("[web] app started");
  });

  it("logger.debug calls pluginLog.debug with [web] prefix", async () => {
    await logger.debug("rendering component");
    expect((pluginLog.debug as AnyFn)).toHaveBeenCalledOnce();
    expect((pluginLog.debug as AnyFn)).toHaveBeenCalledWith("[web] rendering component");
  });

  it("logger.trace calls pluginLog.trace with [web] prefix", async () => {
    await logger.trace("entering function");
    expect((pluginLog.trace as AnyFn)).toHaveBeenCalledOnce();
    expect((pluginLog.trace as AnyFn)).toHaveBeenCalledWith("[web] entering function");
  });
});

describe("logger – only the correct level is called", () => {
  it("calling logger.error does not call other levels", async () => {
    await logger.error("err");
    expect((pluginLog.warn as AnyFn)).not.toHaveBeenCalled();
    expect((pluginLog.info as AnyFn)).not.toHaveBeenCalled();
    expect((pluginLog.debug as AnyFn)).not.toHaveBeenCalled();
    expect((pluginLog.trace as AnyFn)).not.toHaveBeenCalled();
  });

  it("calling logger.info does not call other levels", async () => {
    await logger.info("info");
    expect((pluginLog.error as AnyFn)).not.toHaveBeenCalled();
    expect((pluginLog.warn as AnyFn)).not.toHaveBeenCalled();
    expect((pluginLog.debug as AnyFn)).not.toHaveBeenCalled();
    expect((pluginLog.trace as AnyFn)).not.toHaveBeenCalled();
  });
});

describe("logger – message passthrough fidelity", () => {
  it("passes empty string correctly", async () => {
    await logger.error("");
    expect((pluginLog.error as AnyFn)).toHaveBeenCalledWith("[web] ");
  });

  it("passes multi-line strings correctly", async () => {
    const msg = "line one\nline two\nline three";
    await logger.warn(msg);
    expect((pluginLog.warn as AnyFn)).toHaveBeenCalledWith(`[web] ${msg}`);
  });

  it("does not double-prefix messages", async () => {
    await logger.info("hello");
    const [[calledWith]] = (pluginLog.info as AnyFn).mock.calls;
    expect(calledWith).toBe("[web] hello");
    expect(calledWith).not.toBe("[web] [web] hello");
  });
});

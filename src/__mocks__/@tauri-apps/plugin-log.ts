import { vi } from "vitest";

export const error = vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined);
export const warn = vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined);
export const info = vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined);
export const debug = vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined);
export const trace = vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined);

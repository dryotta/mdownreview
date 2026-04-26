import { vi } from "vitest";
import { __IPC_MOCK_EMIT, __IPC_MOCK_REGISTER_LISTENER } from "./__bus";

// Tauri's real `listen` returns a Promise<UnlistenFn>. The bus is fully
// synchronous, but we keep the async signature so consumers' `await`
// patterns work unchanged.
export const listen = vi.fn(
  async (event: string, cb: (e: { event: string; payload: unknown; id: number }) => void) => {
    return __IPC_MOCK_REGISTER_LISTENER(event, cb);
  },
);

export const emit = vi.fn(async (event: string, payload?: unknown) => {
  __IPC_MOCK_EMIT(event, payload);
});

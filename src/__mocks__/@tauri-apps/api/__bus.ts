// Synchronous event bus shared between the `core.ts` invoke mock and the
// `event.ts` listen mock. Vitest tests register listeners via
// `listen("comments-changed", cb)`; mock invoke handlers (or test code)
// emit events into the bus via `__IPC_MOCK_EMIT`. Tests reset state
// between cases through `__IPC_MOCK_LISTENERS_RESET`. Mirrors the
// production Tauri event channel so consumers (`useComments`) don't
// need to know they're under jsdom.

type Listener = (event: { event: string; payload: unknown; id: number }) => void;

const listeners: Map<string, Set<Listener>> = new Map();
let nextEventId = 1;

export function __IPC_MOCK_REGISTER_LISTENER(event: string, cb: Listener): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

export function __IPC_MOCK_EMIT(event: string, payload: unknown): void {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  // Snapshot so a callback that unlistens itself doesn't perturb iteration.
  for (const cb of [...set]) {
    cb({ event, payload, id: nextEventId++ });
  }
}

export function __IPC_MOCK_LISTENERS_RESET(): void {
  listeners.clear();
  nextEventId = 1;
}

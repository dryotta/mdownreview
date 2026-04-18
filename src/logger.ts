import {
  error as _error,
  warn as _warn,
  info as _info,
  debug as _debug,
  trace as _trace,
} from "@tauri-apps/plugin-log";

export const error = (msg: string) => _error(`[web] ${msg}`);
export const warn = (msg: string) => _warn(`[web] ${msg}`);
export const info = (msg: string) => _info(`[web] ${msg}`);
export const debug = (msg: string) => _debug(`[web] ${msg}`);
export const trace = (msg: string) => _trace(`[web] ${msg}`);

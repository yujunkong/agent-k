/**
 * In-webview settings store (SET-* UI).
 * Mirrors v2.1 ConfigManager get/update for tab UIs; persists via config.update messages.
 */
import { getVsCodeApi } from '../vscodeApi';

const memory = new Map<string, unknown>();

export const configStore = {
  get(key: string): unknown {
    return memory.has(key) ? memory.get(key) : undefined;
  },
  update(values: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(values)) memory.set(k, v);
  },
  hydrate(values: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(values)) memory.set(k, v);
  },
  /** Flat snapshot for JSON tab */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(memory.entries());
  },
};

/** Persist agent-k.* values to extension host (HOST config.update per key). */
export function persistToHost(values: Record<string, unknown>): void {
  configStore.update(values);
  const api = getVsCodeApi();
  for (const [key, value] of Object.entries(values)) {
    // Strip agent-k. prefix for host protocol used by SET-002
    const short = key.startsWith('agent-k.') ? key.slice('agent-k.'.length) : key;
    api.postMessage({ type: 'config.update', key: short, value });
  }
}

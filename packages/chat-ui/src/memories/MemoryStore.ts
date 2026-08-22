/** Temporary webview stub (UI port). Host owns real impl. */
/** Webview stub — MemoryStore lives on host. */
export class MemoryStore {
  async getAllMemories() { return []; }
  async getRelevantMemories() { return []; }
}
export const memoryStore = new MemoryStore();

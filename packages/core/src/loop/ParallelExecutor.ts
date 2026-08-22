/**
 * AGENT-017 — ParallelExecutor with concurrency limit.
 * Read-like tools may run in parallel; writes should use executeSerial.
 */

export interface ParallelTask<T> {
  id: string;
  /** Higher runs first. */
  priority?: number;
  run: () => Promise<T>;
}

export class ParallelExecutor {
  private maxConcurrency: number;
  private running = 0;
  private waiters: Array<() => void> = [];

  constructor(maxConcurrency = 8) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  async map<T>(tasks: ParallelTask<T>[]): Promise<Map<string, T | { error: string }>> {
    const results = new Map<string, T | { error: string }>();
    const sorted = [...tasks].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    await Promise.all(
      sorted.map(async (task) => {
        await this.acquire();
        try {
          const value = await task.run();
          results.set(task.id, value);
        } catch (e) {
          results.set(task.id, {
            error: e instanceof Error ? e.message : String(e),
          });
        } finally {
          this.release();
        }
      })
    );

    return results;
  }

  /** Run one task only after all in-flight work drains (write/terminal). */
  async executeSerial<T>(run: () => Promise<T>): Promise<T> {
    await this.drain();
    await this.acquire();
    try {
      return await run();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  private release(): void {
    this.running--;
    const next = this.waiters.shift();
    if (next) next();
  }

  private drain(): Promise<void> {
    if (this.running === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.running === 0) resolve();
        else setTimeout(check, 5);
      };
      check();
    });
  }
}

/** Heuristic: tools safe to parallelize. */
export function isParallelSafeTool(name: string): boolean {
  return /^(read_file|grep|glob|codebase_search|list_dir|file_search|lsp_|web_fetch|web_search)/i.test(
    name
  );
}

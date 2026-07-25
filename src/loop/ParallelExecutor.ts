/**
 * ParallelExecutor - 병렬 읽기 실행기 (C1-T13)
 * 
 * Promise.all + concurrency limit(16) 병렬 읽기
 * 읽기 도구(grep/glob/read_file)만 병렬 실행, 쓰기/터미널 직렬
 */
import type { ToolInput, ToolOutput } from '../tools/types';

interface ExecutableTask {
  name: string;
  args: ToolInput;
  priority: number;
  executor: (args: ToolInput) => Promise<ToolOutput>;
}

export class ParallelExecutor {
  private maxConcurrency: number;
  private running = 0;
  private queue: ExecutableTask[] = [];
  private resolveQueue: Array<() => void> = [];

  constructor(maxConcurrency = 16) {
    this.maxConcurrency = maxConcurrency;
  }

  async execute(tasks: ExecutableTask[]): Promise<Map<string, ToolOutput>> {
    const results = new Map<string, ToolOutput>();

    // Sort by priority (higher first)
    const sorted = [...tasks].sort((a, b) => b.priority - a.priority);

    // Execute all with concurrency limit
    const executing: Promise<void>[] = sorted.map(async (task) => {
      await this.acquireSlot();
      try {
        const result = await task.executor(task.args);
        results.set(task.name, result);
      } catch (error: any) {
        results.set(task.name, { success: false, error: error.message, metadata: { duration: 0 } });
      } finally {
        this.releaseSlot();
      }
    });

    await Promise.all(executing);
    return results;
  }

  async executeRead(tasks: Array<{ name: string; args: ToolInput; executor: (args: ToolInput) => Promise<ToolOutput> }>): Promise<Map<string, ToolOutput>> {
    return this.execute(tasks.map(t => ({ ...t, priority: 50 })));
  }

  async executeWrite(task: { name: string; args: ToolInput; executor: (args: ToolInput) => Promise<ToolOutput> }): Promise<ToolOutput> {
    // Write tools execute serially
    await this.drainQueue();
    const result = await task.executor(task.args);
    return result;
  }

  private acquireSlot(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.resolveQueue.push(resolve);
    });
  }

  private releaseSlot(): void {
    this.running--;
    if (this.resolveQueue.length > 0) {
      const next = this.resolveQueue.shift();
      if (next) {
        this.running++;
        next();
      }
    }
  }

  private drainQueue(): Promise<void> {
    if (this.running === 0) return Promise.resolve();
    return new Promise(resolve => {
      const check = () => {
        if (this.running === 0) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  clear(): void {
    this.queue = [];
    this.resolveQueue = [];
    this.running = 0;
  }
}

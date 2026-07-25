/**
 * TaskTool — 병렬 서브에이전트 task 도구 (C7-T21)
 *
 * 별도 컨텍스트로 위임 (탐색/일반/디버그 타입)
 */
import { z } from 'zod';

// ===== Schema =====

export const taskSchema = z.object({
  description: z.string().describe('Short (3-5 words) description of the task for the sub-agent'),
  prompt: z.string().describe('Detailed task prompt for the sub-agent to execute'),
  type: z.enum(['search', 'general', 'debug']).optional().default('general')
    .describe('Type of sub-agent: search (read-only), general (read+write), debug (instrumentation)'),
  timeout: z.number().optional().default(120000)
    .describe('Timeout in milliseconds for the sub-agent (default 120s)')
});

// ===== Handler =====

export interface TaskResult {
  taskId: string;
  summary: string;
  status: 'completed' | 'timeout' | 'error';
  details?: string;
  duration: number;
}

export class TaskTool {
  private activeTasks: Map<string, { startTime: number; abortController: AbortController }> = new Map();
  private taskCounter: number = 0;

  /**
   * Execute a task by spawning a sub-agent
   */
  async execute(params: z.infer<typeof taskSchema>): Promise<TaskResult> {
    const taskId = `task-${++this.taskCounter}-${Date.now()}`;
    const startTime = Date.now();
    const abortController = new AbortController();

    this.activeTasks.set(taskId, { startTime, abortController });

    try {
      // Delegate to sub-agent (simulated here — real implementation
      // would create a new agent session with its own context)
      const result = await this.runSubAgent(params, abortController.signal);

      const duration = Date.now() - startTime;
      this.activeTasks.delete(taskId);

      return {
        taskId,
        summary: result.summary,
        status: 'completed',
        details: result.details,
        duration
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      this.activeTasks.delete(taskId);

      if ((err as Error)?.name === 'AbortError') {
        return { taskId, summary: 'Task timed out', status: 'timeout', duration };
      }

      return { taskId, summary: String(err), status: 'error', duration };
    }
  }

  /**
   * Cancel a running task
   */
  cancel(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;

    task.abortController.abort();
    this.activeTasks.delete(taskId);
    return true;
  }

  /**
   * Get active task count
   */
  get activeCount(): number {
    return this.activeTasks.size;
  }

  /**
   * List active task IDs
   */
  listActive(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  private async runSubAgent(
    params: z.infer<typeof taskSchema>,
    signal: AbortSignal
  ): Promise<{ summary: string; details?: string }> {
    // Simulate sub-agent execution
    // Real implementation would:
    // 1. Create a new agent session with fresh context
    // 2. Set appropriate tool access based on type
    // 3. Run the agent loop with the prompt
    // 4. Collect the result
    // 5. Return only the summary (to avoid parent context pollution)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new DOMException('Timeout', 'AbortError'));
      }, params.timeout);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException('Cancelled', 'AbortError'));
      });

      // Simulate async work
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({
          summary: `[${params.type}] Completed task: ${params.description}`,
          details: `Sub-agent type: ${params.type}\nTask: ${params.prompt.slice(0, 100)}...`
        });
      }, 500);
    });
  }
}

// ===== Tool Metadata =====

export const TASK_TOOL_META = {
  task: { name: 'task', description: 'Spawn a sub-agent with a separate context to execute a task in parallel', tierAccess: 'B', category: 'orchestration' }
};

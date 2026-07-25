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
    // ─── Real AgentLoop execution (RW-C7-04: setTimeout simulate 제거) ──
    // Map 'type' to mode
    const subMode = params.type === 'search' ? 'ask' : params.type === 'debug' ? 'debug' : 'agent';

    const { AgentLoopController } = await import('../../loop/AgentLoopController');
    const loop = new AgentLoopController({
      mode: subMode,
      maxTurns: 5,
      modelId: 'sub-agent',
      systemPrompt: `You are a sub-agent. Task: ${params.description}\n\n${params.prompt}\n\nComplete the task and report back a concise summary.`,
      onStatus: () => {},
      onError: () => {}
    });

    // Wrap in a promise that respects timeout + abort
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        loop.stop();
        reject(new DOMException('Timeout', 'AbortError'));
      }, params.timeout);

      // Nested abort: parent cancels → child stops
      const abortHandler = () => {
        clearTimeout(timeout);
        loop.stop();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });

      // Run the sub-agent loop
      loop.start(params.prompt).then(() => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abortHandler);
        const turnCount = loop.state.currentTurn;
        const status = loop.state.status;
        resolve({
          summary: `[${params.type}/${status}] ${params.description} (${turnCount} turns)`,
          details: `Sub-agent mode: ${subMode}\nTurns: ${turnCount}\nStatus: ${status}\nTask: ${params.prompt.slice(0, 200)}`
        });
      }).catch((err: Error) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abortHandler);
        if (err.name === 'AbortError') {
          reject(new DOMException('Cancelled', 'AbortError'));
        } else {
          resolve({
            summary: `[${params.type}/error] ${params.description}: ${err.message}`,
            details: `Error: ${err.message}\nTask: ${params.prompt.slice(0, 200)}`
          });
        }
      });
    });
  }
}

// ===== Tool Metadata =====

export const TASK_TOOL_META = {
  task: { name: 'task', description: 'Spawn a sub-agent with a separate context to execute a task in parallel', tierAccess: 'B', category: 'orchestration' }
};

/** Singleton TaskTool instance for AgentLoop dispatch (RW-C7-04-R2) */
let _taskTool: TaskTool | null = null;
export function getTaskTool(): TaskTool {
  if (!_taskTool) _taskTool = new TaskTool();
  return _taskTool;
}

/**
 * TaskTool — 병렬 서브에이전트 task 도구 (C7-T21 / ADDON-T09)
 *
 * 별도 컨텍스트로 위임 (탐색/일반/디버그 타입).
 * 자식 AgentLoopController는 매번 새 인스턴스라 부모 메시지 히스토리를
 * 절대 공유하지 않는다 — 부모에는 SubAgentResult가 요약한 결과만 반환.
 */
import { z } from 'zod';
import { SubAgentResult, type SubAgentRawResult, type SubAgentSummary } from './SubAgentResult';

// ===== Schema =====

export const taskSchema = z.object({
  description: z.string().describe('Short (3-5 words) description of the task for the sub-agent'),
  prompt: z.string().describe('Detailed task prompt for the sub-agent to execute'),
  type: z.enum(['search', 'general', 'debug']).optional().default('general')
    .describe('Type of sub-agent: search (read-only), general (read+write), debug (instrumentation)'),
  timeout: z.number().optional().default(120000)
    .describe('Timeout in milliseconds for the sub-agent (default 120s)'),
  maxTurns: z.number().optional().default(5)
    .describe('Max turns for the sub-agent loop (default 5)'),
  modelId: z.string().optional()
    .describe('Model id override for the sub-agent (default: sub-agent tier default)')
});

// ===== Handler =====

export type TaskStatus = 'completed' | 'timeout' | 'error' | 'cancelled';

export interface TaskResult {
  taskId: string;
  summary: string;
  status: TaskStatus;
  details?: string;
  duration: number;
}

/** UI progress event — running while the child loop executes, terminal state after */
export interface TaskProgressEvent {
  taskId: string;
  status: 'running' | 'completed' | 'error' | 'timeout' | 'cancelled';
}

export class TaskTool {
  private activeTasks: Map<
    string,
    { startTime: number; abortController: AbortController; cancelled: boolean }
  > = new Map();
  private taskCounter: number = 0;
  private subAgentResult = new SubAgentResult();

  /**
   * ADDON-T09: notified on task lifecycle transitions so the host UI can show
   * running/completed/error/timeout/cancelled badges on the task step.
   */
  onProgress?: (ev: TaskProgressEvent) => void;

  /**
   * Execute a task by spawning a sub-agent.
   * The sub-agent runs its own AgentLoopController instance with a fresh
   * message history — nothing from the parent's transcript is shared, and
   * only the summarized result (SubAgentResult.summarize) is returned here.
   */
  async execute(params: z.infer<typeof taskSchema>): Promise<TaskResult> {
    const taskId = `task-${++this.taskCounter}-${Date.now()}`;
    const startTime = Date.now();
    const abortController = new AbortController();
    const record = { startTime, abortController, cancelled: false };

    this.activeTasks.set(taskId, record);
    this.onProgress?.({ taskId, status: 'running' });

    try {
      const raw = await this.runSubAgent(params, abortController.signal);
      const duration = Date.now() - startTime;
      const summary = this.subAgentResult.summarize({
        taskId,
        fullLog: raw.fullLog,
        toolCalls: raw.toolCalls,
        tokensUsed: { input: 0, output: 0 },
        duration,
        status: 'completed'
      });

      this.onProgress?.({ taskId, status: 'completed' });
      return {
        taskId,
        summary: summary.summary,
        status: 'completed',
        details: raw.fullLog,
        duration
      };
    } catch (err) {
      const duration = Date.now() - startTime;

      if ((err as Error)?.name === 'AbortError') {
        // Both timeout and parent-initiated cancel abort the same signal —
        // `record.cancelled` (set by cancel()) is what tells them apart.
        const status: TaskStatus = record.cancelled ? 'cancelled' : 'timeout';
        const summary = status === 'cancelled'
          ? 'Sub-agent cancelled by parent before completion.'
          : 'Sub-agent timed out. Consider increasing timeout or simplifying the task.';
        this.onProgress?.({ taskId, status });
        return { taskId, summary, status, duration };
      }

      const raw: SubAgentRawResult = {
        taskId,
        fullLog: '',
        toolCalls: 0,
        tokensUsed: { input: 0, output: 0 },
        duration,
        status: 'error',
        error: String((err as Error)?.message ?? err)
      };
      const summary = this.subAgentResult.summarize(raw);
      this.onProgress?.({ taskId, status: 'error' });
      return { taskId, summary: summary.summary, status: 'error', duration };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Cancel a running task. Distinguished from timeout via the `cancelled`
   * flag consumed by execute()'s AbortError handler.
   */
  cancel(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;

    task.cancelled = true;
    task.abortController.abort();
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
  ): Promise<{ fullLog: string; toolCalls: number }> {
    // ─── Real AgentLoop execution (RW-C7-04: setTimeout simulate 제거) ──
    // Map 'type' to mode
    const subMode = params.type === 'search' ? 'ask' : params.type === 'debug' ? 'debug' : 'agent';

    const { AgentLoopController } = await import('../../loop/AgentLoopController');
    // Fresh controller = fresh `messages` array. Nothing from the parent's
    // loop/transcript is passed in — this is the isolation boundary (ADDON-T09).
    const loop = new AgentLoopController({
      mode: subMode,
      maxTurns: params.maxTurns || 5,
      modelId: params.modelId || 'sub-agent',
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
        const toolCalls = loop.getMessages().filter((m) => m.role === 'tool').length;
        // SubAgentResult.summarize only keeps lines starting with
        // '## Summary' / 'Result:' / '-' — keep the description on a '-' line.
        const fullLog = [
          '## Summary',
          `- ${params.description} — ${status} (${turnCount} turns, ${subMode} mode)`,
          `- Mode: ${subMode}`,
          `- Turns: ${turnCount}`,
          `- Status: ${status}`,
          `- Task: ${params.prompt.slice(0, 200)}`
        ].join('\n');
        resolve({ fullLog, toolCalls });
      }).catch((err: Error) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abortHandler);
        reject(err);
      });
    });
  }
}

// ===== Pure formatting helper (unit-testable, no vscode/loop deps) =====

/**
 * Format a SubAgentSummary as the tool_result text shown to the parent LLM.
 * Pure function — parent-facing text only, no raw sub-agent transcript.
 */
export function formatTaskToolResult(summary: SubAgentSummary): string {
  const duration = (summary.duration / 1000).toFixed(1);
  const lines = [
    `[task ${summary.taskId} · ${summary.status}] ${duration}s · ${summary.toolCalls} tool call(s)`,
    summary.summary
  ];
  if (summary.truncated) {
    lines.push('_(summary truncated)_');
  }
  return lines.join('\n');
}

/** Build a SubAgentSummary-shaped object from a TaskResult for formatting. */
export function taskResultToSummary(result: TaskResult): SubAgentSummary {
  return {
    taskId: result.taskId,
    summary: result.summary,
    toolCalls: 0,
    tokensUsed: { input: 0, output: 0 },
    duration: result.duration,
    status: result.status,
    truncated: false
  };
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

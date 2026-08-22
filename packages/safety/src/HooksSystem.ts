/**
 * SAFE-010 — HooksSystem (beforeTool / afterTool).
 * Hook failure or block → explicit R-005 error result (never silent).
 */

import { createSafetyError, type SafetyError, type SafetyResult } from './types';

export interface ToolHookContext {
  toolName: string;
  args?: Record<string, unknown>;
  /** Present on afterTool hooks. */
  result?: unknown;
  turnNumber?: number;
  mode?: string;
}

/** Hook handlers return ok or an explicit error/block. */
export type ToolHook = (
  context: ToolHookContext,
) => SafetyResult<void> | Promise<SafetyResult<void>>;

export interface HooksSystemLogEntry {
  phase: 'beforeTool' | 'afterTool';
  toolName: string;
  ok: boolean;
  error?: SafetyError;
}

/**
 * Lifecycle hooks around tool execution.
 * First failing / blocking hook short-circuits with an explicit error.
 */
export class HooksSystem {
  private readonly beforeHooks: ToolHook[] = [];
  private readonly afterHooks: ToolHook[] = [];
  private readonly logs: HooksSystemLogEntry[] = [];

  registerBeforeTool(hook: ToolHook): () => void {
    this.beforeHooks.push(hook);
    const index = this.beforeHooks.length - 1;
    return () => {
      this.beforeHooks.splice(index, 1);
    };
  }

  registerAfterTool(hook: ToolHook): () => void {
    this.afterHooks.push(hook);
    const index = this.afterHooks.length - 1;
    return () => {
      this.afterHooks.splice(index, 1);
    };
  }

  async runBeforeTool(context: ToolHookContext): Promise<SafetyResult<void>> {
    return this.runPhase('beforeTool', this.beforeHooks, context);
  }

  async runAfterTool(context: ToolHookContext): Promise<SafetyResult<void>> {
    return this.runPhase('afterTool', this.afterHooks, context);
  }

  getLogs(): readonly HooksSystemLogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs.length = 0;
  }

  clear(): void {
    this.beforeHooks.length = 0;
    this.afterHooks.length = 0;
    this.logs.length = 0;
  }

  private async runPhase(
    phase: 'beforeTool' | 'afterTool',
    hooks: ToolHook[],
    context: ToolHookContext,
  ): Promise<SafetyResult<void>> {
    for (const hook of hooks) {
      let result: SafetyResult<void>;
      try {
        result = await hook(context);
      } catch (err: unknown) {
        // Thrown exceptions become explicit HOOK_FAILED (R-005).
        const message = err instanceof Error ? err.message : 'Unknown hook failure';
        const error = createSafetyError('HOOK_FAILED', message, {
          toolName: context.toolName,
          phase,
        });
        this.logs.push({ phase, toolName: context.toolName, ok: false, error });
        return { ok: false, error };
      }

      if (!result.ok) {
        const error =
          result.error ??
          createSafetyError('HOOK_BLOCKED', `Hook blocked tool "${context.toolName}"`, {
            toolName: context.toolName,
            phase,
          });
        this.logs.push({ phase, toolName: context.toolName, ok: false, error });
        return { ok: false, error };
      }

      this.logs.push({ phase, toolName: context.toolName, ok: true });
    }

    return { ok: true, value: undefined };
  }
}

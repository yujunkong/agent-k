/**
 * TOOL-009 ExecutorAbstraction — executeTool(name, input, ctx) → ToolResult.
 * Applies contract timeoutMs via AbortSignal race when no external signal timeout.
 */

import type { ToolContext, ToolDefinition, ToolResult } from './types';
import type { ToolRegistry } from './ToolRegistry';

export interface ExecuteToolOptions {
  /** Override tool contract timeout (ms). */
  timeoutMs?: number;
}

/**
 * Look up `name` in registry and run execute with R-005 timeout / cancel.
 */
export async function executeTool(
  registry: ToolRegistry,
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  options?: ExecuteToolOptions
): Promise<ToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      metadata: { durationMs: 0 },
    };
  }

  const timeoutMs = options?.timeoutMs ?? tool.timeoutMs;
  return runWithTimeout(tool, input, ctx, timeoutMs);
}

async function runWithTimeout(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  ctx: ToolContext,
  timeoutMs: number
): Promise<ToolResult> {
  const t0 = Date.now();
  const controller = new AbortController();

  // Chain external abort into local controller.
  const onExternalAbort = () => controller.abort();
  if (ctx.signal) {
    if (ctx.signal.aborted) {
      return {
        success: false,
        error: 'Tool execution cancelled',
        metadata: { durationMs: 0, cancelled: true },
      };
    }
    ctx.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  const linkedCtx: ToolContext = { ...ctx, signal: controller.signal };

  try {
    const result = await tool.execute(input, linkedCtx);
    return {
      ...result,
      metadata: {
        durationMs: result.metadata?.durationMs ?? Date.now() - t0,
        truncated: result.metadata?.truncated,
        cancelled: result.metadata?.cancelled,
        denied: result.metadata?.denied,
      },
    };
  } catch (e) {
    const cancelled = controller.signal.aborted || Boolean(ctx.signal?.aborted);
    const timedOut = cancelled && !ctx.signal?.aborted;
    return {
      success: false,
      error: timedOut
        ? `Tool "${tool.name}" timed out after ${timeoutMs}ms`
        : e instanceof Error
          ? e.message
          : String(e),
      metadata: {
        durationMs: Date.now() - t0,
        cancelled,
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * AGENT-018 — StreamingToolExecutor.
 * Accepts partial/chunked tool results via callback while a tool runs.
 */

import type { ExecuteToolFn, ExecuteToolResult } from '../types';

export type ToolChunkHandler = (chunk: {
  callId: string;
  name: string;
  text: string;
  done: boolean;
}) => void;

export interface StreamingToolRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  signal?: AbortSignal;
}

/**
 * Wraps an injected executeTool and optionally streams stringified progress.
 * Emits an empty start chunk then a final chunk with the completed payload.
 */
export class StreamingToolExecutor {
  constructor(
    private readonly executeTool: ExecuteToolFn,
    private readonly onChunk?: ToolChunkHandler
  ) {}

  async execute(req: StreamingToolRequest): Promise<ExecuteToolResult> {
    this.onChunk?.({
      callId: req.callId,
      name: req.name,
      text: '',
      done: false,
    });

    const result = await this.executeTool({
      name: req.name,
      args: req.args,
      callId: req.callId,
      signal: req.signal,
    });

    const text =
      typeof result.data === 'string'
        ? result.data
        : result.error
          ? result.error
          : result.data != null
            ? JSON.stringify(result.data)
            : '';

    this.onChunk?.({
      callId: req.callId,
      name: req.name,
      text,
      done: true,
    });

    return result;
  }
}

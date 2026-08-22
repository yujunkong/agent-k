/**
 * TOOL-010 WriteExecutor — wrap write/edit with consistent result formatting.
 */

import type { ToolContext, ToolResult } from './types';
import { editTool } from './tools/EditTool';
import { writeTool } from './tools/WriteTool';

export interface FormattedWriteResult {
  ok: boolean;
  operation: 'write_file' | 'edit_file';
  path?: string;
  summary: string;
  details?: unknown;
  error?: string;
}

/** Format a raw ToolResult into a stable write/edit summary. */
export function formatWriteResult(
  operation: 'write_file' | 'edit_file',
  result: ToolResult
): FormattedWriteResult {
  if (!result.success) {
    return {
      ok: false,
      operation,
      summary: result.error || `${operation} failed`,
      error: result.error,
      details: result.data,
    };
  }

  const data = (result.data ?? {}) as Record<string, unknown>;
  const path = typeof data.path === 'string' ? data.path : undefined;
  const summary =
    operation === 'write_file'
      ? `Wrote ${path ?? 'file'}${data.created ? ' (created)' : ' (updated)'}`
      : `Edited ${path ?? 'file'} (${Number(data.replacements) || 0} replacements)`;

  return {
    ok: true,
    operation,
    path,
    summary,
    details: data,
  };
}

/** Execute write_file and return formatted result. */
export async function executeWriteFile(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<FormattedWriteResult> {
  const result = await writeTool.execute(input, ctx);
  return formatWriteResult('write_file', result);
}

/** Execute edit_file and return formatted result. */
export async function executeEditFile(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<FormattedWriteResult> {
  const result = await editTool.execute(input, ctx);
  return formatWriteResult('edit_file', result);
}

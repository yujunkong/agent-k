/**
 * toObservedToolCall — adapts AgentLoopController's onToolCall/onToolResult
 * callback shape (name, ToolInput args, ToolOutput result) to the
 * EvidenceEngine's ObservedToolCall.
 *
 * Field names (`path` for read_file/edit_file/write_file, `command` for
 * run_terminal_cmd) come from the actual tool schemas in
 * src/tools/readTools.ts / editTools.ts — see those files if a tool's
 * argument shape changes.
 */
import type { ObservedToolCall } from './EvidenceEngine';

export function toObservedToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  result: { success: boolean }
): ObservedToolCall {
  const a = args || {};
  // read_files takes `paths` (array) or the `path`/`files` aliases the tool
  // description mentions; normalize to the first path so at least one
  // correlation can happen. Multi-file batch reads only partially covered
  // here — acceptable for an 'in_progress' signal, which is best-effort by
  // design (see EvidenceEngine.ts).
  const filePath =
    (typeof a.path === 'string' && a.path) ||
    (Array.isArray(a.paths) && typeof a.paths[0] === 'string' ? (a.paths[0] as string) : undefined) ||
    (typeof a.filePath === 'string' && a.filePath) ||
    undefined;

  const command = typeof a.command === 'string' ? a.command : undefined;

  return {
    toolName: name,
    filePath,
    command,
    success: result.success,
    timestamp: Date.now()
  };
}

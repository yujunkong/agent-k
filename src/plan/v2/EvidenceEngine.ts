/**
 * EvidenceEngine — problem #9 from the original review, and the piece every
 * reviewer in this thread agreed was the most important idea to keep:
 *
 * Don't tell the agent "finish Task 1 before touching Task 2" — it won't
 * reliably obey that, and enforcing it server-side just means false
 * failures when the agent's actual (reasonable) behavior doesn't match a
 * rigid step order. Instead, observe what tools actually did and derive
 * task status from that evidence.
 *
 * Correlation is intentionally simple and file/command-path based:
 *  - a read-ish tool touching one of a task's files -> in_progress
 *  - an edit/write tool touching one of a task's files -> satisfied
 *  - a terminal/test tool whose command matches one of the task's
 *    verification strings, and which succeeded -> verified
 *  - a terminal/test tool matching a verification string that failed -> failed
 *
 * This is a heuristic correlation layer, not a guarantee — it's meant to
 * replace *enforced* step order with *observed* progress, which is strictly
 * better even when the correlation itself is approximate.
 */
import type { PlanTask, TaskStatus } from './schema';
import type { ToolEvidence } from './PlanEvent';

export interface ObservedToolCall {
  toolName: string;
  /** File path for read/edit/write tools. */
  filePath?: string;
  /** Shell command for terminal/test tools. */
  command?: string;
  success: boolean;
  timestamp: number;
}

const READ_TOOLS = new Set(['read_file', 'read_files', 'grep', 'glob', 'file_search', 'codebase_search', 'list_dir', 'lsp_definition', 'lsp_references']);
const WRITE_TOOLS = new Set(['edit_file', 'write_file', 'delete_file']);
const RUN_TOOLS = new Set(['run_terminal_cmd']);

export interface TaskStatusUpdate {
  taskId: string;
  to: TaskStatus;
  evidence: ToolEvidence;
}

/**
 * Given one observed tool call and the set of tasks in the current plan,
 * return zero or more task-status updates implied by that evidence.
 * A single ambiguous tool call must NOT silently satisfy multiple tasks.
 * If more than one task is an equally good match, no task-status update is
 * emitted; the next evidence event can disambiguate it.
 */
export function deriveTaskUpdates(
  call: ObservedToolCall,
  tasks: PlanTask[]
): TaskStatusUpdate[] {
  const updates: TaskStatusUpdate[] = [];
  const evidence: ToolEvidence = {
    toolName: call.toolName,
    target: call.filePath ?? call.command,
    success: call.success,
    timestamp: call.timestamp
  };

  if (call.filePath && (READ_TOOLS.has(call.toolName) || WRITE_TOOLS.has(call.toolName))) {
    const isWrite = WRITE_TOOLS.has(call.toolName);
    const candidates = tasks.filter((task) => task.files.some((f) => {
      if (!pathsMatch(f.path, call.filePath!)) return false;
      // Reads are valid evidence for every file intent. Writes are only
      // evidence for files the plan explicitly allows to be created/modified.
      return !isWrite || f.intent === 'modify' || f.intent === 'create';
    }));

    // A shared file is not enough to know which task the agent was working
    // on. Do not let one write falsely satisfy multiple tasks.
    if (candidates.length === 1) {
      const task = candidates[0];
      let to: TaskStatus;
      if (!isWrite) {
        to = 'in_progress';
      } else if (!call.success) {
        to = 'failed';
      } else if (task.verification.length === 0) {
        to = 'awaiting_verification';
      } else {
        to = 'satisfied';
      }
      updates.push({ taskId: task.id, to, evidence });
    }
  }

  if (call.filePath && WRITE_TOOLS.has(call.toolName)) {
    // An ambiguous shared-file write is deliberately represented by no state
    // update. The evidence remains observable to callers via the raw tool
    // event, but it cannot claim completion for multiple tasks.
  }

  if (call.command && RUN_TOOLS.has(call.toolName)) {
    const candidates = tasks.filter((task) =>
      task.verification.some((v) => commandsMatch(v, call.command!))
    );
    // The same broad verification command can be declared by several tasks.
    // Until verification is represented as an explicit artifact/group, do not
    // mark all of them verified from one ambiguous command.
    if (candidates.length === 1) {
      const task = candidates[0];
      updates.push({
        taskId: task.id,
        to: call.success ? 'verified' : 'failed',
        evidence
      });
    }
  }

  return updates;
}

function pathsMatch(taskPath: string, toolPath: string): boolean {
  const norm = (p: string) => p
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .join('/');
  const a = norm(taskPath);
  const b = norm(toolPath);
  if (!a || !b) return false;
  if (a === b) return true;
  // A bare basename (no '/', e.g. "foo.ts") is NEVER matched by suffix —
  // that would match any unrelated nested file with the same name (the
  // exact false-positive this function used to allow: taskPath "foo.ts"
  // matching toolPath "/workspace/a/foo.ts"). Bare basenames only match
  // on exact equality with the normalized tool path.
  if (!a.includes('/')) return false;
  // A multi-segment task path may still match a longer absolute/workspace
  // tool path as long as it lines up on a real path-segment boundary.
  return b.endsWith(`/${a}`);
}

/** Match the declared verification command or a safe suffix of it. This
 * avoids the old substring behavior where `npm test-old` could satisfy
 * `npm test`. A common `cd ... && <command>` wrapper is also accepted. */
function commandsMatch(verification: string, command: string): boolean {
  const v = verification.trim().toLowerCase();
  const c = command.trim().toLowerCase();
  if (!v || !c) return false;
  if (c === v || c.startsWith(`${v} `) || c.startsWith(`${v}\n`)) return true;
  const shell = c.match(/^(?:cd\s+[^&]+&&\s*)+(.+)$/);
  return Boolean(shell && (shell[1] === v || shell[1].startsWith(`${v} `)));
}

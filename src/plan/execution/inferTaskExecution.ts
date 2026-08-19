import type { PlanTask } from '../v2/schema';
import type { TaskExecutionDelegate } from './types';

const VERIFICATION_TITLE = /\b(verify|verification|validate|run tests?|test suite|smoke test)\b/i;

/**
 * Heuristic delegate assignment until the planner LLM emits an explicit field.
 * - File create/modify work → subagent (isolated worktree).
 * - Read-only / verification-only steps → main agent.
 */
export function inferTaskExecution(task: PlanTask): TaskExecutionDelegate {
  const hasWriteIntent = task.files.some(
    (file) => file.intent === 'modify' || file.intent === 'create'
  );
  if (hasWriteIntent) return 'subagent';

  const verificationOnly =
    task.verification.length > 0 &&
    task.files.every((file) => file.intent === 'read');
  if (verificationOnly || VERIFICATION_TITLE.test(task.title)) return 'main';

  return 'main';
}

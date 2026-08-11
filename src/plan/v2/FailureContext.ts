/**
 * FailureContext — the thing that makes retries actually converge instead
 * of just re-rolling the dice.
 *
 * A validation failure (schema or semantic) is turned into a small,
 * structured `ValidationIssue[]`, then rendered as an explicit "fix ONLY
 * these problems" instruction that gets appended to the next Planner call.
 */

export type ValidationIssueCode =
  | 'JSON_PARSE_ERROR'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'DUPLICATE_TASK_ID'
  | 'FILE_NOT_FOUND'
  | 'DEPENDENCY_MISSING'
  | 'DEPENDENCY_CYCLE'
  | 'NO_VERIFICATION'
  | 'EMPTY_TASK_LIST'
  | 'MODEL_REQUEST_FAILED'
  | 'FILE_CHECK_FAILED';

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
  severity: 'error' | 'warning';
  taskId?: string;
  path?: string;
}

export interface FailureContext {
  type: 'schema_validation_failed' | 'semantic_validation_failed';
  attempt: number;
  errors: ValidationIssue[];
  /** warnings never block a retry loop, but are worth surfacing to the user
   *  once a plan is accepted (e.g. in the Review UI). */
  warnings: ValidationIssue[];
}

export function buildFailureContext(
  type: FailureContext['type'],
  attempt: number,
  issues: ValidationIssue[]
): FailureContext {
  return {
    type,
    attempt,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning')
  };
}

/**
 * Render a FailureContext as a prompt block for the next Planner attempt.
 * Deliberately narrow: "fix ONLY these problems" — a full re-explanation of
 * the whole task invites the model to regenerate everything from scratch
 * and reintroduce a different set of mistakes.
 */
export function failureContextToPrompt(ctx: FailureContext): string {
  if (ctx.errors.length === 0) return '';
  const lines = [
    `Previous plan (attempt ${ctx.attempt}) failed ${ctx.type === 'schema_validation_failed' ? 'schema' : 'semantic'} validation.`,
    'Problems:',
    ...ctx.errors.map((e, i) => `${i + 1}. [${e.code}]${e.taskId ? ` (task: ${e.taskId})` : ''} ${e.message}`),
    '',
    'Regenerate the plan while correcting ONLY these issues. Keep everything else the same.'
  ];
  return lines.join('\n');
}

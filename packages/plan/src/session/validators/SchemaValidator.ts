/**
 * SchemaValidator — layer 1 of Plan V2 validation.
 *
 * Deterministic. Never calls the LLM. Responsible only for:
 *  - is this valid JSON?
 *  - does it match PlanLLMOutputSchema (types / required fields / enums)?
 *  - are task ids unique? (cheap, deterministic, worth catching here rather
 *    than pushing into SemanticValidator)
 *
 * Anything requiring repository knowledge (file existence, dependency
 * resolution against *other* tasks, verification plausibility) belongs in
 * SemanticValidator.ts, not here.
 */
import { PlanLLMOutputSchema, type PlanLLMOutput } from '../schema';
import type { ValidationIssue } from '../FailureContext';

export interface SchemaValidationResult {
  ok: boolean;
  data?: PlanLLMOutput;
  issues: ValidationIssue[];
}

/** Parse raw model output text into a JS value.
 *  Handles the common "```json ... ```" fence wrapping some providers still
 *  emit even under constrained decoding (thinking-mode preambles etc). */
export function parseModelJson(raw: string): { ok: true; value: unknown } | { ok: false; issue: ValidationIssue } {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (err) {
    return {
      ok: false,
      issue: {
        code: 'JSON_PARSE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to parse JSON',
        severity: 'error'
      }
    };
  }
}

export function validateSchema(raw: string): SchemaValidationResult {
  const parsed = parseModelJson(raw);
  if (!parsed.ok) {
    return { ok: false, issues: [parsed.issue] };
  }

  const result = PlanLLMOutputSchema.safeParse(parsed.value);
  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      code: 'SCHEMA_VALIDATION_FAILED',
      message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      severity: 'error'
    }));
    return { ok: false, issues };
  }

  const data = result.data;
  const issues: ValidationIssue[] = [];

  // Cross-field invariant: task ids must be unique within the plan.
  const seen = new Map<string, number>();
  data.tasks.forEach((t) => seen.set(t.id, (seen.get(t.id) || 0) + 1));
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({
        code: 'DUPLICATE_TASK_ID',
        message: `Task id "${id}" is used ${count} times.`,
        severity: 'error',
        taskId: id
      });
    }
  }

  return { ok: issues.length === 0, data, issues };
}

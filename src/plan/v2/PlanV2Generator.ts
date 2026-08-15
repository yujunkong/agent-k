/**
 * PlanV2Generator — the actual "make a plan" pipeline:
 *
 *   Planner LLM (constrained decoding)
 *        -> SchemaValidator   (deterministic, no LLM)
 *        -> SemanticValidator (deterministic, repository-aware)
 *        -> PASS -> PlanDocument
 *        -> FAIL -> FailureContext -> retry (max 3 attempts) -> STOP
 *
 * No JSON-repair-via-LLM step, no legacy-heuristic fallback, no shadow
 * comparison logging. On a self-hosted stack with grammar-constrained
 * decoding, schema failures should be rare; when they (or semantic
 * failures) happen repeatedly, further LLM-based repair attempts tend to
 * reproduce the same mistake rather than fix it — so we stop and surface
 * the problem instead of hiding it behind more automatic retries.
 */
import type { PlanDocument } from './schema';
import { PLAN_JSON_SCHEMA } from './schema';
import { validateSchema } from './validators/SchemaValidator';
import { validateSemantics, type FileExistenceChecker } from './validators/SemanticValidator';
import { buildFailureContext, failureContextToPrompt, type FailureContext, type ValidationIssue } from './FailureContext';

export interface PlanGenerationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Minimal model interface PlanV2Generator depends on — deliberately not
 *  LLMProviderInterface directly, so this stays unit-testable with a fake
 *  and reusable if the provider layer changes shape later. */
export interface PlanGenerationModel {
  /** Return the full completion text for one turn. Streaming, if any,
   *  should already be collected by the caller (see LiteLLMPlanModel). */
  complete(messages: PlanGenerationMessage[]): Promise<string>;
}

export interface PlanV2GenerationParams {
  goal: string;
  researchContext: string;
  rejectionFeedback?: string;
  maxAttempts?: number;
}

export interface PlanV2GenerationResult {
  ok: boolean;
  plan?: PlanDocument;
  attempts: number;
  failures: FailureContext[];
}

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 5;

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null && 'name' in error) {
    if (String((error as { name?: string }).name) === 'AbortError') return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /aborted|AbortError/i.test(message);
}

export class PlanV2Generator {
  constructor(
    private readonly model: PlanGenerationModel,
    private readonly fileExists: FileExistenceChecker
  ) {}

  async generate(params: PlanV2GenerationParams): Promise<PlanV2GenerationResult> {
    const maxAttempts = Math.max(1, Math.min(params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, MAX_ALLOWED_ATTEMPTS));
    const failures: FailureContext[] = [];

    const baseMessages: PlanGenerationMessage[] = [
      { role: 'system', content: buildPlannerSystemPrompt() },
      { role: 'user', content: buildPlannerUserPrompt(params) }
    ];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const messages = [...baseMessages, ...failures.map((f) => ({ role: 'user' as const, content: failureContextToPrompt(f) }))];

      let raw: string;
      try {
        raw = await this.model.complete(messages);
      } catch (error) {
        if (isAbortError(error)) throw error;
        const message = error instanceof Error ? error.message : 'Planner model request failed.';
        failures.push(
          buildFailureContext('schema_validation_failed', attempt, [{
            code: 'MODEL_REQUEST_FAILED',
            message,
            severity: 'error'
          }])
        );
        continue;
      }

      const schemaResult = validateSchema(raw);
      if (!schemaResult.ok || !schemaResult.data) {
        failures.push(buildFailureContext('schema_validation_failed', attempt, schemaResult.issues));
        continue;
      }

      let semanticIssues: ValidationIssue[];
      try {
        semanticIssues = await validateSemantics(schemaResult.data, { fileExists: this.fileExists });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Repository file validation failed.';
        failures.push(buildFailureContext('semantic_validation_failed', attempt, [{
          code: 'FILE_CHECK_FAILED',
          message,
          severity: 'error'
        }]));
        continue;
      }
      const semanticErrors = semanticIssues.filter((i) => i.severity === 'error');
      if (semanticErrors.length > 0) {
        failures.push(buildFailureContext('semantic_validation_failed', attempt, semanticIssues));
        continue;
      }

      const plan: PlanDocument = {
        id: `plan_${Date.now().toString(36)}`,
        goal: params.goal,
        summary: schemaResult.data.summary,
        tasks: schemaResult.data.tasks.map((t) => ({ ...t })),
        risks: schemaResult.data.risks,
        createdAt: Date.now()
      };

      return { ok: true, plan, attempts: attempt, failures };
    }

    return { ok: false, attempts: maxAttempts, failures };
  }
}

function buildPlannerSystemPrompt(): string {
  return [
    'You are the Planner for Agent K. Produce an implementation plan as JSON matching the provided schema.',
    'Each task must list the files it touches with an accurate intent (read/modify/create), its dependencies on other task ids in this plan, and concrete verification steps (commands or checks) whenever the task result can be automatically checked.',
    'Do not invent files that are unrelated to the goal. Do not mark an existing file as "create".',
    `JSON schema: ${JSON.stringify(PLAN_JSON_SCHEMA.schema)}`
  ].join('\n');
}

function buildPlannerUserPrompt(params: PlanV2GenerationParams): string {
  const lines = [`Goal: ${params.goal}`, '', 'Research findings:', params.researchContext || '(none)'];
  if (params.rejectionFeedback) {
    lines.push('', 'The user previously rejected a plan for this goal with this feedback:', `"${params.rejectionFeedback}"`, 'Address it explicitly.');
  }
  return lines.join('\n');
}

/**
 * Plan V2 — schema.ts
 *
 * PlanDocument is the source of truth (not Markdown). Markdown is a render
 * target — see renderPlanMarkdown.ts.
 *
 * This file defines two parallel things that MUST be kept in sync:
 *  1. `PlanLLMOutputSchema` (zod) — used at runtime to validate whatever the
 *     model actually returned (SchemaValidator.ts).
 *  2. `PLAN_JSON_SCHEMA` (plain JSON Schema) — passed to the provider as
 *     `response_format` / `guided_json` so vLLM / SGLang can constrain
 *     decoding at the token level. This is what makes "the model didn't
 *     follow the schema" mostly a non-issue on a self-hosted stack.
 *
 * IMPORTANT: constrained decoding only guarantees *shape* (valid JSON,
 * required fields, types, enums). It does NOT guarantee the content is
 * correct (real files, real deps, sane verification). That's what
 * SemanticValidator.ts is for. Never treat "schema passed" as "plan is
 * usable" — see FailureContext.ts / PlanV2Generator.ts.
 */
import { z } from 'zod';

/** How a task relates to a file. Lets SemanticValidator know whether a
 *  missing file is an error (existing file expected) or expected (new file). */
export const FileIntentSchema = z.enum(['read', 'modify', 'create']);
export type FileIntent = z.infer<typeof FileIntentSchema>;

export const PlanFileRefSchema = z.object({
  path: z.string().min(1),
  intent: FileIntentSchema
});
export type PlanFileRef = z.infer<typeof PlanFileRefSchema>;

/** Task id format kept loose (free string) but must be non-empty and unique
 *  within a plan — uniqueness is checked in SchemaValidator, not here,
 *  because zod object-level refinement is easier to unit test standalone. */
export const PlanTaskLLMSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  files: z.array(PlanFileRefSchema).default([]),
  dependencies: z.array(z.string()).default([]),
  verification: z.array(z.string()).default([])
});
export type PlanTaskLLM = z.infer<typeof PlanTaskLLMSchema>;

export const PlanRiskLLMSchema = z.object({
  id: z.string().min(1),
  risk: z.string().min(1),
  mitigation: z.string().min(1)
});
export type PlanRiskLLM = z.infer<typeof PlanRiskLLMSchema>;

/** What we ask the Planner LLM to produce (constrained-decoded). */
export const PlanLLMOutputSchema = z.object({
  summary: z.string().min(1),
  tasks: z.array(PlanTaskLLMSchema).min(1),
  risks: z.array(PlanRiskLLMSchema).default([])
});
export type PlanLLMOutput = z.infer<typeof PlanLLMOutputSchema>;

/** Runtime task status. `satisfied` = evidence of an edit exists;
 *  `verified` = a verification command actually passed. Never conflate the
 *  two — see EvidenceEngine.ts. */
export const TaskStatusValues = [
  'pending',
  'in_progress',
  'blocked',
  'satisfied',
  'awaiting_verification',
  'verified',
  'failed'
] as const;
export type TaskStatus = (typeof TaskStatusValues)[number];

export type PlanTask = PlanTaskLLM;

export interface PlanRisk extends PlanRiskLLM {}

/** PlanDocument — the runtime source of truth. Markdown is derived from
 *  this, never the other way around (see renderPlanMarkdown.ts). */
export interface PlanDocument {
  id: string;
  goal: string;
  summary: string;
  tasks: PlanTask[];
  risks: PlanRisk[];
  createdAt: number;
}

/**
 * Plain JSON Schema mirror of PlanLLMOutputSchema, for `response_format` /
 * guided-decoding on OpenAI-compatible endpoints (vLLM --guided-decoding,
 * SGLang, etc). Keep this in sync with PlanLLMOutputSchema by hand — there's
 * no zod-to-json-schema dependency in this project, and hand-writing it also
 * makes deliberate omissions (e.g. no additionalProperties surprises) explicit.
 */
export const PLAN_JSON_SCHEMA = {
  name: 'agent_k_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'tasks', 'risks'],
    properties: {
      summary: { type: 'string', minLength: 1 },
      tasks: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'description', 'files', 'dependencies', 'verification'],
          properties: {
            id: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            files: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['path', 'intent'],
                properties: {
                  path: { type: 'string', minLength: 1 },
                  intent: { type: 'string', enum: ['read', 'modify', 'create'] }
                }
              }
            },
            dependencies: { type: 'array', items: { type: 'string' } },
            verification: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      risks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'risk', 'mitigation'],
          properties: {
            id: { type: 'string', minLength: 1 },
            risk: { type: 'string', minLength: 1 },
            mitigation: { type: 'string', minLength: 1 }
          }
        }
      }
    }
  }
} as const;

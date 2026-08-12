/**
 * LiteLLMPlanModel — adapts the project's existing LLMProviderInterface
 * (LiteLLMProvider, DGXProvider-backed endpoints, etc.) to the minimal
 * PlanGenerationModel interface PlanV2Generator depends on.
 *
 * Strategy:
 *  1. Prefer constrained decoding (`response_format: json_schema`).
 *     vLLM / SGLang / OpenAI models that support it keep the original path
 *     — no behavior change for those providers.
 *  2. If the provider *rejects* json_schema (common on OpenCode Zen free,
 *     MLX, and other gateways), retry once *without* response_format.
 *     SchemaValidator still enforces shape; only the wire constraint is relaxed.
 *  3. Network / auth / model-not-found errors are NOT retried this way —
 *     they surface as MODEL_REQUEST_FAILED unchanged.
 */
import type { LLMProviderInterface } from '../../providers/types';
import type { PlanGenerationMessage, PlanGenerationModel } from './PlanV2Generator';
import { PLAN_JSON_SCHEMA } from './schema';

export interface LiteLLMPlanModelOptions {
  model?: string;
  signal?: AbortSignal;
  /**
   * Force unconstrained mode (skip json_schema entirely).
   * Default: try constrained first, fallback only on unsupported-format errors.
   */
  forceUnconstrained?: boolean;
}

const JSON_SCHEMA_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: PLAN_JSON_SCHEMA.name,
    strict: PLAN_JSON_SCHEMA.strict,
    schema: PLAN_JSON_SCHEMA.schema as unknown as Record<string, unknown>
  }
};

/** Errors that mean "this endpoint cannot honor response_format", not a
 *  general transport failure. Conservative: only match when the message
 *  clearly points at structured-output / schema parameters. */
export function isUnsupportedResponseFormatError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  if (!msg) return false;

  // Transport / auth — never treat as schema-unsupported
  if (
    /econnrefused|enotfound|etimedout|network|fetch failed|unauthorized|401|403|api key|invalid.?api/.test(
      msg
    )
  ) {
    return false;
  }

  const mentionsFormat =
    /response[_ ]?format|json[_ ]?schema|guided[_ ]?json|structured[_ ]?output|constrained[_ ]?decoding/.test(
      msg
    );
  const mentionsRejection =
    /unsupported|not supported|unknown|invalid|unexpected|unrecognized|ignored|does not support|not valid|400|422/.test(
      msg
    );

  if (mentionsFormat && mentionsRejection) return true;
  if (mentionsFormat && /\b(400|422)\b/.test(msg)) return true;

  return false;
}

export class LiteLLMPlanModel implements PlanGenerationModel {
  constructor(
    private readonly provider: LLMProviderInterface,
    private readonly opts: LiteLLMPlanModelOptions = {}
  ) {}

  async complete(messages: PlanGenerationMessage[]): Promise<string> {
    if (this.opts.forceUnconstrained) {
      return this.completeOnce(messages, /* withSchema */ false);
    }

    try {
      return await this.completeOnce(messages, /* withSchema */ true);
    } catch (error) {
      if (!isUnsupportedResponseFormatError(error)) {
        throw error;
      }
      // Provider rejected json_schema (e.g. OpenCode Zen free). Retry once
      // without response_format so other models that succeed on the first
      // attempt never enter this path.
      return this.completeOnce(messages, /* withSchema */ false);
    }
  }

  private async completeOnce(
    messages: PlanGenerationMessage[],
    withSchema: boolean
  ): Promise<string> {
    let full = '';
    for await (const chunk of this.provider.streamChat({
      // PlanGenerationMessage ({role, content}) has no index signature, so
      // it isn't structurally assignable to StreamChatOptions.messages
      // (Array<Record<string, unknown>>) under strict mode — same class of
      // cast already used below for `schema`. Safe: both are plain JSON-
      // serializable objects; the provider only reads role/content off them.
      messages: messages as unknown as Array<Record<string, unknown>>,
      model: this.opts.model,
      signal: this.opts.signal,
      // Planning is a one-shot structured task, not open-ended reasoning —
      // keep temperature low for reproducibility of task decomposition.
      temperature: 0.2,
      // Keep thinking off for plan turns — reduces unknown-param failures on
      // gateways that do not implement enable_thinking (Plan path only).
      enableThinking: false,
      thinkingEffort: 'off',
      ...(withSchema ? { responseFormat: JSON_SCHEMA_RESPONSE_FORMAT } : {})
    })) {
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.content) full += chunk.content;
    }
    return full;
  }
}

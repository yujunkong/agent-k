/**
 * LiteLLMPlanModel — adapts the project's existing LLMProviderInterface
 * (LiteLLMProvider, DGXProvider-backed endpoints, etc.) to the minimal
 * PlanGenerationModel interface PlanV2Generator depends on.
 *
 * Requests constrained JSON decoding via `responseFormat` (see
 * providers/types.ts + LiteLLMProvider.ts). On a vLLM/SGLang endpoint this
 * becomes guided/grammar-constrained decoding — the model literally cannot
 * emit tokens outside the schema. On providers that ignore response_format,
 * this degrades gracefully to "we asked nicely"; SchemaValidator still
 * catches whatever comes back either way.
 *
 * Gateways that reject unknown/unsupported request params outright (rather
 * than ignoring them) are a different case from "ignores gracefully" above —
 * e.g. free-tier models behind OpenCode Zen. A 4xx from
 * response_format: json_schema there isn't a real generation failure, so a
 * single param-scoped retry without response_format follows before giving
 * up (see complete() below). The Planner system prompt already embeds the
 * full JSON schema as text (PlanV2Generator.buildPlannerSystemPrompt), so
 * the retry still has real odds of producing schema-shaped output even
 * without guided decoding; SchemaValidator still checks it either way.
 */
import type { LLMProviderInterface } from '../../providers/types';
import type { PlanGenerationMessage, PlanGenerationModel } from './PlanV2Generator';
import { PLAN_JSON_SCHEMA } from './schema';

/** 4xx-shaped error text from LiteLLMProvider ("API Error (400): ...") that
 *  suggests the gateway rejected the request itself — not a generation
 *  failure. Only retry-without-schema for this class; a network error
 *  (ECONNREFUSED, timeout, "fetch failed" — no "API Error (" prefix from
 *  LiteLLMProvider's catch path) means the schema was never the issue and a
 *  bare retry would just fail again for the same reason, one request later. */
function looksLikeRejectedRequestParam(message: string): boolean {
  return /API Error \(4\d\d\)/.test(message) ||
    /response_format|json_schema|unsupported|unknown param|invalid.*param/i.test(message);
}

export class LiteLLMPlanModel implements PlanGenerationModel {
  constructor(
    private readonly provider: LLMProviderInterface,
    private readonly opts: { model?: string; signal?: AbortSignal } = {}
  ) {}

  async complete(messages: PlanGenerationMessage[]): Promise<string> {
    try {
      return await this.completeOnce(messages, /* useResponseFormat */ true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!looksLikeRejectedRequestParam(message)) throw error;
      // Gateway likely rejected response_format/json_schema itself (common
      // on free-tier proxies) — one retry without it, relying on the
      // schema-in-prompt + SchemaValidator instead of guided decoding.
      try {
        return await this.completeOnce(messages, /* useResponseFormat */ false);
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        throw new Error(
          `${retryMessage} (also failed without response_format after the first attempt was rejected: ${message})`
        );
      }
    }
  }

  private async completeOnce(
    messages: PlanGenerationMessage[],
    useResponseFormat: boolean
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
      ...(useResponseFormat
        ? {
            responseFormat: {
              type: 'json_schema' as const,
              json_schema: {
                name: PLAN_JSON_SCHEMA.name,
                strict: PLAN_JSON_SCHEMA.strict,
                schema: PLAN_JSON_SCHEMA.schema as unknown as Record<string, unknown>
              }
            }
          }
        : {})
    })) {
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.content) full += chunk.content;
    }
    return full;
  }
}

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
 */
import type { LLMProviderInterface } from '../../providers/types';
import type { PlanGenerationMessage, PlanGenerationModel } from './PlanV2Generator';
import { PLAN_JSON_SCHEMA } from './schema';

export class LiteLLMPlanModel implements PlanGenerationModel {
  constructor(
    private readonly provider: LLMProviderInterface,
    private readonly opts: { model?: string; signal?: AbortSignal } = {}
  ) {}

  async complete(messages: PlanGenerationMessage[]): Promise<string> {
    let full = '';
    for await (const chunk of this.provider.streamChat({
      messages,
      model: this.opts.model,
      signal: this.opts.signal,
      // Planning is a one-shot structured task, not open-ended reasoning —
      // keep temperature low for reproducibility of task decomposition.
      temperature: 0.2,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: PLAN_JSON_SCHEMA.name,
          strict: PLAN_JSON_SCHEMA.strict,
          schema: PLAN_JSON_SCHEMA.schema as unknown as Record<string, unknown>
        }
      }
    })) {
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.content) full += chunk.content;
    }
    return full;
  }
}

/**
 * PLAN2-005 — Adapts LLMProviderInterface to PlanGenerationModel.
 */

import type { LLMProviderInterface } from '@agent-k/providers';
import type { PlanGenerationMessage, PlanGenerationModel } from './PlanSchemaGenerator';
import { PLAN_JSON_SCHEMA } from './schema';

function looksLikeRejectedRequestParam(message: string): boolean {
  return (
    /API Error \(4\d\d\)/.test(message) ||
    /response_format|json_schema|unsupported|unknown param|invalid.*param/i.test(
      message,
    )
  );
}

export class LiteLLMPlanModel implements PlanGenerationModel {
  constructor(
    private readonly provider: LLMProviderInterface,
    private readonly opts: { model?: string; signal?: AbortSignal } = {},
  ) {}

  async complete(messages: PlanGenerationMessage[]): Promise<string> {
    try {
      return await this.completeOnce(messages, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!looksLikeRejectedRequestParam(message)) throw error;
      try {
        return await this.completeOnce(messages, false);
      } catch (retryError) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : String(retryError);
        throw new Error(
          `${retryMessage} (also failed without response_format after the first attempt was rejected: ${message})`,
        );
      }
    }
  }

  private async completeOnce(
    messages: PlanGenerationMessage[],
    useResponseFormat: boolean,
  ): Promise<string> {
    let full = '';
    for await (const chunk of this.provider.streamChat({
      messages: messages as unknown as Array<Record<string, unknown>>,
      model: this.opts.model,
      signal: this.opts.signal,
      temperature: 0.2,
      ...(useResponseFormat
        ? {
            responseFormat: {
              type: 'json_schema' as const,
              json_schema: {
                name: PLAN_JSON_SCHEMA.name,
                strict: PLAN_JSON_SCHEMA.strict,
                schema: PLAN_JSON_SCHEMA.schema as unknown as Record<
                  string,
                  unknown
                >,
              },
            },
          }
        : {}),
    })) {
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.content) full += chunk.content;
    }
    return full;
  }
}

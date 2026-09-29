/**
 * V31-TOOL-01 — ToolCallNormalizer (ISSUE-08).
 *
 * Native tool_calls win; when the provider returned none but the assistant
 * prose looks like a broken tool payload (XML / JSON fence / bare JSON),
 * fall back to ToolCallParser with a confidence floor.
 *
 * Pure host logic — no vscode import.
 */

import { ToolCallParser } from '@agent-k/tools';
import { looksLikeBrokenToolPayload } from '@agent-k/core';

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallNormalizer {
  normalize(raw: unknown, content: string): ToolCallRequest[];
}

export class NativeThenFallbackNormalizer implements ToolCallNormalizer {
  constructor(
    private readonly parser: ToolCallParser = new ToolCallParser(),
    private readonly opts: { minConfidence?: number } = {},
  ) {}

  normalize(raw: unknown, content: string): ToolCallRequest[] {
    const native = this.toRequests(raw);
    if (native.length > 0) return native;
    if (!looksLikeBrokenToolPayload(content)) return [];
    const min = this.opts.minConfidence ?? 0.9;
    return this.parser
      .parse(content)
      .filter((p) => p.confidence >= min)
      .map((p) => ({ id: p.id, name: p.name, arguments: p.arguments }));
  }

  /** Accept [{id?, name, arguments}] objects; skip entries without a name. */
  private toRequests(raw: unknown): ToolCallRequest[] {
    if (!Array.isArray(raw)) return [];
    const out: ToolCallRequest[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) continue;
      let args: Record<string, unknown> = {};
      const rawArgs = rec.arguments;
      if (typeof rawArgs === 'string') {
        try {
          args = JSON.parse(rawArgs) as Record<string, unknown>;
        } catch {
          args = { raw: rawArgs };
        }
      } else if (rawArgs && typeof rawArgs === 'object') {
        args = rawArgs as Record<string, unknown>;
      }
      out.push({
        id:
          typeof rec.id === 'string' && rec.id
            ? rec.id
            : `call_${out.length + 1}`,
        name,
        arguments: args,
      });
    }
    return out;
  }
}

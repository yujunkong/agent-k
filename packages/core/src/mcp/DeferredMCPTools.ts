/**
 * MCP-006 — Deferred MCP tools by schema token budget.
 */
import type { McpToolDescriptor } from '@agent-k/shared';

export interface DeferredDecision {
  connectNow: boolean;
  estimatedTokens: number;
  reason?: string;
}

/** Decide whether a server's tool schemas fit the budget. */
export function shouldDeferMcpServer(
  tools: McpToolDescriptor[],
  maxSchemaTokens: number,
  estimateTokens: (tools: McpToolDescriptor[]) => number,
): DeferredDecision {
  const estimatedTokens = estimateTokens(tools);
  if (estimatedTokens <= maxSchemaTokens) {
    return { connectNow: true, estimatedTokens };
  }
  return {
    connectNow: false,
    estimatedTokens,
    reason: `schema ~${estimatedTokens} tokens exceeds budget ${maxSchemaTokens}`,
  };
}

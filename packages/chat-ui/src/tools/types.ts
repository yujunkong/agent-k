/**
 * Tool I/O types for chat-ui's legacy v2.1-port tool executors
 * (RequestReproduceTool / AskQuestionTool — live, used by useChatDebugMode /
 * useChatPlanMode). Shape mirrors @agent-k/tools `ToolResult` (R-005) so the
 * webview-side executors stay contract-compatible without a cross-package dep.
 *
 * Pure types only — no runtime logic (B-1: shared/type surface).
 */

/** Loose tool arguments record — executors validate fields at runtime. */
export type ToolInput = Record<string, unknown>;

/** Result contract returned by every chat-ui tool executor. */
export interface ToolOutput {
  success: boolean;
  error?: string;
  data?: unknown;
}

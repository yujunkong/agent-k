/**
 * Project rules formatting — UI-only surface (HARNESS-005).
 * Runtime loader lives in @agent-k/core (`ProjectRulesLoader`); the host
 * injects project rules into the API payload. The webview only formats an
 * explicitly provided rules string (no fs / vscode access).
 */

/** Format a pre-loaded rules string as the PROJECT RULES block. */
export function formatProjectRulesBlock(content: string): string {
  const trimmed = (content || '').trim();
  if (!trimmed) return '';
  return `## PROJECT RULES\n${trimmed}`;
}

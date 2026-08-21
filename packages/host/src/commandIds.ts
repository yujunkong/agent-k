/**
 * EXT-003 — canonical Agent-K command id catalog (mirrors contributes.commands).
 * Keep in sync with extensions/agent-k/package.json.
 */

/** Stable command ids registered by the extension assembler. */
export const AGENT_K_COMMAND_IDS = [
  'agent-k.chat.new',
  'agent-k.openSettings',
  'agent-k.openProjectConfig',
  'agent-k.provider.add',
  'agent-k.mode.switch',
  'agent-k.chat.focusInput',
  'agent-k.chat.attachSelection',
  'agent-k.inlineEdit',
  'agent-k.plan.open',
  'agent-k.plan.build',
  'agent-k.plan.openReview',
  'agent-k.debug.open',
  'agent-k.review.open',
  'agent-k.browser.open',
  'agent-k.artifacts.open',
  'agent-k.mcp.reload',
  'agent-k.mcp.connect',
  'agent-k.mcp.disconnect',
  'agent-k.bestOfN.run',
] as const;

export type AgentKCommandId = (typeof AGENT_K_COMMAND_IDS)[number];

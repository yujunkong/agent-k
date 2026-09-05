/**
 * AgentMessage — canonical chat message shape shared by the webview send flow
 * (useChatSendFlow) and resynthesize instructions (synthesizeInstructions).
 *
 * Extracted from the retired v2.1-port AgentLoopController (the real agent
 * loop lives in packages/core). Type-only module — no runtime behavior.
 */

import type { ToolInput } from '../tools/types';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: ToolInput;
  }>;
  toolCallId?: string;
  name?: string;
  /**
   * HARB-T26-FIX2: the loop turn this message was produced in. Needed so
   * compaction's "protect last N turns" window looks at each message's own
   * turn instead of assuming every message belongs to the current turn.
   * system/user seed messages may omit this — they're always protected by role.
   */
  turn?: number;
}

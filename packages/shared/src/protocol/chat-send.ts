/**
 * SHARED-001 — chat.send / chat.stop payload shapes.
 * Transplanted as contracts from v2.1 protocol catalog (not a file copy).
 */

import type { AgentMode, PlanStage, ThinkingEffort } from '../common/mode';
import type { RequestId } from '../common/ids';

/** Single chat message in a send batch. */
export interface ChatMessagePayload {
  role: string;
  content: string;
}

/** Image attached for vision (CHAT-012) — host reads path → multimodal part. */
export interface ChatSendImagePayload {
  path: string;
  mimeType: string;
}

/**
 * Webview → Host: tool-mediated agent send.
 * Provider fields are optional until PROVIDER-* / HOST-002 wire them.
 */
export interface ChatSendPayload {
  requestId: RequestId;
  messages: ChatMessagePayload[];
  mode: AgentMode;
  /** Plan FSM stage for stage-specific prompts (PLAN-*). */
  planStage?: PlanStage;
  /** Debug FSM stage for stage-specific prompts (DEBUG-*). */
  debugStage?: string;
  thinkingEffort?: ThinkingEffort;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** CHAT-012 — screenshot / image chips for the current user turn. */
  images?: ChatSendImagePayload[];
}

/** Webview → Host: stop in-flight chat.send for a request. */
export interface ChatStopPayload {
  requestId?: RequestId;
}

/**
 * SHARED-001 — opaque string id aliases for protocol correlation.
 * Not branded at runtime; aliases document intent for callers.
 */

/** Correlates chat.send ↔ chat.stream envelopes. */
export type RequestId = string;

/** Conversation / agent turn index or id. */
export type TurnId = string;

/** Tool invocation id when present on the wire. */
export type ToolCallId = string;

/** Work event id (timeline row). */
export type WorkEventId = string;

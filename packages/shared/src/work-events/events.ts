/**
 * SHARED-002 — Typed Work Event discriminated union (R-002).
 *
 * Replaces v2.1 ConversationWorkEvent (all-optional strings + UI `includes()` guessing).
 * Host/core emit closed `kind`; chat-ui only narrows on discriminant.
 */

import type { WorkEventId } from '../common/ids';
import type { WorkEventKind, WorkEventStatus } from './kinds';

/** Fields common to every Typed Work Event. */
export interface TypedWorkEventBase {
  id: WorkEventId;
  /** 1-based or runtime turn index; host/core owns numbering. */
  turn: number;
  status: WorkEventStatus;
  /** Display label already chosen by host/core — UI must not re-parse for kind. */
  label: string;
  detail?: string;
  /** Optional metadata; UI must not re-derive `kind` from toolName. */
  toolName?: string;
  thoughtRole?: 'opening' | 'mid';
  durationMs?: number;
}

type KindOnly =
  | 'thinking'
  | 'planning'
  | 'done'
  | 'error'
  | 'session'
  | 'asking'
  | 'task'
  | 'verify';

/** Discriminated by `kind` — extend per Feature, do not grow a bag of strings. */
export type TypedWorkEvent =
  | (TypedWorkEventBase & { kind: KindOnly })
  | (TypedWorkEventBase & { kind: 'searching'; query?: string; path?: string })
  | (TypedWorkEventBase & {
      kind: 'reading';
      path?: string;
      lineRange?: { start: number; end: number };
    })
  | (TypedWorkEventBase & {
      kind: 'editing';
      path?: string;
      additions?: number;
      deletions?: number;
    })
  | (TypedWorkEventBase & {
      kind: 'running';
      command?: string;
      cwd?: string;
      exitCode?: number | null;
    })
  | (TypedWorkEventBase & { kind: 'browsing'; url?: string });

/**
 * Exhaustiveness helper for switch(kind) in consumers.
 * Throws at runtime if a new kind is added without updating the switch.
 */
export function assertNeverWorkEvent(event: never): never {
  const kind =
    typeof event === 'object' && event !== null && 'kind' in event
      ? String((event as { kind: unknown }).kind)
      : 'unknown';
  throw new Error(`Unhandled TypedWorkEvent kind: ${kind}`);
}

/** Narrow helper: returns true when `kind` matches (no string heuristics). */
export function workEventHasKind<K extends WorkEventKind>(
  event: TypedWorkEvent,
  kind: K,
): event is Extract<TypedWorkEvent, { kind: K }> {
  return event.kind === kind;
}

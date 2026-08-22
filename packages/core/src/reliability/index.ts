/**
 * REL-001…008 — Reliability helpers (pure runtime, no UI).
 */

import type { AgentMessage } from '../types';
import { validateToolCallPairIntegrity } from '../context/CompactionEngine';
import { ClassifierDiagnostics } from '../loop/ClassifierDiagnostics';
import { looksLikeBrokenToolPayload } from '../loop/classifiers';

/** REL-001 — Alias of AGENT-016 classifier diagnostics. */
export { ClassifierDiagnostics as ReliabilityClassifierDiagnostics } from '../loop/ClassifierDiagnostics';
export type { ClassifyEvent, ClassifyListener } from '../loop/ClassifierDiagnostics';

export function createClassifierDiagnostics(
  capacity = 200,
  enabled = true
): ClassifierDiagnostics {
  return new ClassifierDiagnostics(capacity, enabled);
}

/** REL-002 — Plan generation watchdog timer. */
export const PLAN_GENERATE_TIMEOUT_MS = 180_000;

export const PLAN_GENERATE_TIMEOUT_MESSAGE =
  'Plan generation exceeded timeout and was cancelled.';

export interface PlanWatchdog {
  beginGenerateTimeout: () => void;
  clear: () => void;
}

export function createPlanWatchdog(opts: {
  timeoutMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  onTimeout: () => void;
}): PlanWatchdog {
  const timeoutMs = opts.timeoutMs ?? PLAN_GENERATE_TIMEOUT_MS;
  const setT = opts.setTimeoutFn ?? setTimeout;
  const clearT =
    opts.clearTimeoutFn ??
    ((id: unknown) => {
      clearTimeout(id as ReturnType<typeof setTimeout>);
    });
  let timer: unknown;
  let settled = false;

  const arm = () => {
    if (settled) return;
    if (timer != null) clearT(timer);
    timer = setT(() => {
      if (settled) return;
      settled = true;
      timer = undefined;
      opts.onTimeout();
    }, timeoutMs);
  };

  arm();

  return {
    beginGenerateTimeout() {
      arm();
    },
    clear() {
      settled = true;
      if (timer != null) clearT(timer);
      timer = undefined;
    },
  };
}

/** REL-003 — Streaming stabilization buffer (debounce incomplete deltas). */
export class StreamingStabilizationBuffer {
  private buf = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private readonly onFlush: (text: string) => void;

  constructor(onFlush: (text: string) => void, debounceMs = 32) {
    this.onFlush = onFlush;
    this.debounceMs = Math.max(0, debounceMs);
  }

  push(delta: string): void {
    this.buf += delta;
    if (this.debounceMs === 0) {
      this.flush();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.buf) return;
    const out = this.buf;
    this.buf = '';
    this.onFlush(out);
  }

  pending(): string {
    return this.buf;
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buf = '';
  }
}

/** REL-004 — Explicit turn state machine. */
export type TurnState =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'tool_exec'
  | 'completed'
  | 'cancelled'
  | 'error';

const TURN_TRANSITIONS: Record<TurnState, TurnState[]> = {
  idle: ['sending'],
  sending: ['streaming', 'tool_exec', 'completed', 'cancelled', 'error'],
  streaming: ['tool_exec', 'completed', 'cancelled', 'error'],
  tool_exec: ['streaming', 'completed', 'cancelled', 'error'],
  completed: ['idle', 'sending'],
  cancelled: ['idle', 'sending'],
  error: ['idle', 'sending'],
};

export class TurnStateMachine {
  private state: TurnState = 'idle';

  get(): TurnState {
    return this.state;
  }

  canTransition(to: TurnState): boolean {
    return TURN_TRANSITIONS[this.state].includes(to);
  }

  transition(to: TurnState): boolean {
    if (!this.canTransition(to)) return false;
    this.state = to;
    return true;
  }

  reset(): void {
    this.state = 'idle';
  }
}

/** REL-005 — Per-session send epoch (stale response protection). */
export class SendEpochMap {
  private readonly epochs = new Map<string, number>();

  bump(sessionId: string): number {
    const id = String(sessionId || '');
    const next = (this.epochs.get(id) || 0) + 1;
    this.epochs.set(id, next);
    return next;
  }

  get(sessionId: string): number {
    return this.epochs.get(String(sessionId || '')) || 0;
  }

  isStale(sessionId: string, epoch: number): boolean {
    return epoch !== this.get(sessionId);
  }

  clear(sessionId: string): void {
    this.epochs.delete(String(sessionId || ''));
  }
}

/** REL-006 — Regeneration safety: block overlapping regenerate for same turn. */
export class RegenerationSafety {
  private lockedTurnIds = new Set<string>();

  tryBegin(turnId: string): boolean {
    const id = String(turnId || '');
    if (!id || this.lockedTurnIds.has(id)) return false;
    this.lockedTurnIds.add(id);
    return true;
  }

  end(turnId: string): void {
    this.lockedTurnIds.delete(String(turnId || ''));
  }

  isLocked(turnId: string): boolean {
    return this.lockedTurnIds.has(String(turnId || ''));
  }
}

/** REL-007 — Tool payload validation. */
export interface ToolPayloadValidation {
  ok: boolean;
  reason?: string;
  looksBroken: boolean;
}

export function validateToolPayload(input: {
  name?: string;
  arguments?: unknown;
  rawContent?: string;
}): ToolPayloadValidation {
  if (input.rawContent && looksLikeBrokenToolPayload(input.rawContent)) {
    return {
      ok: false,
      looksBroken: true,
      reason: 'Content looks like a raw/broken tool payload dump',
    };
  }
  if (!input.name || !String(input.name).trim()) {
    return { ok: false, looksBroken: false, reason: 'Missing tool name' };
  }
  if (input.arguments === undefined) {
    return { ok: true, looksBroken: false };
  }
  if (typeof input.arguments === 'string') {
    try {
      JSON.parse(input.arguments);
    } catch {
      return {
        ok: false,
        looksBroken: true,
        reason: 'arguments is not valid JSON',
      };
    }
  } else if (
    typeof input.arguments !== 'object' ||
    input.arguments === null
  ) {
    return {
      ok: false,
      looksBroken: false,
      reason: 'arguments must be object or JSON string',
    };
  }
  return { ok: true, looksBroken: false };
}

/** REL-008 — Compaction integrity check (tool-call pairs). */
export function checkCompactionIntegrity(messages: AgentMessage[]): {
  ok: boolean;
  orphanToolResults: string[];
  missingResults: string[];
} {
  return validateToolCallPairIntegrity(messages);
}

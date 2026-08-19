/**
 * PlanPhaseTransitions — explicit session-phase edge table + validation.
 *
 * Pattern: event-driven FSM with an explicit transition table.
 *   1. Map event → target phase (or no phase change)
 *   2. Look up PLAN_PHASE_TRANSITIONS[from]
 *  3. Accept only listed edges (self-loops always ok)
 *   4. Optional guards (e.g. approve requires structured plan)
 *
 * Scope: PlanSession.phase only — NOT taskStatus (evidence-driven).
 */
import type { PlanPhase } from './PlanSession';
import type { PlanEvent, PlanEventType } from './PlanEvent';

/** Legal phase edges (from -> to[]). Same-phase self-loops are always
 *  allowed implicitly (see isLegalPhaseTransition). */
export const PLAN_PHASE_TRANSITIONS: Record<PlanPhase, readonly PlanPhase[]> = {
  idle: ['research'],
  research: ['planning', 'research'],
  planning: ['review', 'planning', 'research', 'failed'],
  review: ['executing', 'planning'],
  executing: ['completed', 'failed', 'review'],
  completed: ['planning', 'research'],
  failed: ['planning', 'review', 'research']
};

export type PhaseTransitionErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'GUARD_NO_PLAN'
  | 'GUARD_NOT_IN_REVIEW'
  | 'UNKNOWN_PHASE';

export interface PhaseTransitionOk {
  ok: true;
  from: PlanPhase;
  to: PlanPhase;
  /** True when from === to (explicit self-loop / no-op). */
  self: boolean;
}

export interface PhaseTransitionFail {
  ok: false;
  code: PhaseTransitionErrorCode;
  from: PlanPhase;
  to: PlanPhase;
  /** Phases currently allowed from `from` (excluding self). */
  allowed: readonly PlanPhase[];
  /** Korean user/dev-facing hint. */
  hint: string;
  message: string;
}

export type PhaseTransitionResult = PhaseTransitionOk | PhaseTransitionFail;

/** Optional runtime context for guards beyond the pure edge table. */
export interface PhaseTransitionContext {
  /** True when PlanSession holds a structured PlanDocument. */
  hasStructuredPlan?: boolean;
}

/**
 * Pure edge-table check. Does not apply business guards (plan loaded, etc.).
 */
export function isLegalPhaseTransition(from: PlanPhase, to: PlanPhase): boolean {
  if (from === to) return true;
  const edges = PLAN_PHASE_TRANSITIONS[from];
  if (!edges) return false;
  return edges.includes(to);
}

export function getAllowedPhases(from: PlanPhase): readonly PlanPhase[] {
  return PLAN_PHASE_TRANSITIONS[from] ?? [];
}

/**
 * Validate a from → to jump against the transition table (+ optional guards).
 * Prefer this over bare isLegal* when callers need structured errors/hints.
 */
export function validatePhaseTransition(
  from: PlanPhase,
  to: PlanPhase,
  ctx: PhaseTransitionContext = {}
): PhaseTransitionResult {
  if (!(from in PLAN_PHASE_TRANSITIONS)) {
    return fail(from, to, 'UNKNOWN_PHASE', `Unknown phase: ${from}`);
  }
  if (!(to in PLAN_PHASE_TRANSITIONS) && from !== to) {
    return fail(from, to, 'UNKNOWN_PHASE', `Unknown target phase: ${to}`);
  }

  if (from === to) {
    return { ok: true, from, to, self: true };
  }

  if (!isLegalPhaseTransition(from, to)) {
    const allowed = getAllowedPhases(from);
    return {
      ok: false,
      code: 'ILLEGAL_TRANSITION',
      from,
      to,
      allowed,
      message: `Illegal PlanSession phase transition: ${from} -> ${to}`,
      hint: buildIllegalHint(from, to, allowed)
    };
  }

  // Business guards (edge is legal, but contract may still block).
  if (to === 'executing') {
    if (from !== 'review') {
      // Table should already reject non-review → executing; belt-and-suspenders.
      return fail(
        from,
        to,
        'GUARD_NOT_IN_REVIEW',
        'Executing is only allowed after approve from review.'
      );
    }
    if (ctx.hasStructuredPlan === false) {
      return {
        ok: false,
        code: 'GUARD_NO_PLAN',
        from,
        to,
        allowed: getAllowedPhases(from),
        message: 'Cannot enter executing without a structured plan.',
        hint:
          'No structured Plan in PlanSession. Call ensureStructuredPlan() or approve after plan.generated.'
      };
    }
  }

  return { ok: true, from, to, self: false };
}

export class IllegalPhaseTransitionError extends Error {
  readonly code: PhaseTransitionErrorCode;
  readonly from: PlanPhase;
  readonly to: PlanPhase;
  readonly allowed: readonly PlanPhase[];
  readonly hint: string;

  constructor(result: PhaseTransitionFail) {
    super(result.message);
    this.name = 'IllegalPhaseTransitionError';
    this.code = result.code;
    this.from = result.from;
    this.to = result.to;
    this.allowed = result.allowed;
    this.hint = result.hint;
  }
}

/** Throw IllegalPhaseTransitionError when the edge (or guard) fails. */
export function assertLegalPhaseTransition(
  from: PlanPhase,
  to: PlanPhase,
  ctx: PhaseTransitionContext = {}
): void {
  const result = validatePhaseTransition(from, to, ctx);
  if (!result.ok) {
    throw new IllegalPhaseTransitionError(result);
  }
}

// ─── Event → phase mapping (single source of truth) ─────────────────

/**
 * Which phase an event would move the session to.
 * `undefined` = event does not change phase (e.g. task.status.changed).
 */
export function phaseForEvent(
  eventType: PlanEventType,
  from?: PlanPhase
): PlanPhase | undefined {
  switch (eventType) {
    case 'plan.started':
      return 'research';
    case 'research.completed':
    case 'plan.generation.attempt':
      // Findings / attempt logs must not rewind an approved or finished run.
      if (from === 'executing' || from === 'completed') return undefined;
      return 'planning';
    case 'plan.generation.failed':
      // Stay in planning while retries remain; exhausted path uses plan.failed.
      return undefined;
    case 'plan.generated':
    case 'plan.review.opened':
      return 'review';
    case 'plan.approved':
      return 'executing';
    case 'plan.rejected':
      return 'planning';
    case 'plan.completed':
      return 'completed';
    case 'plan.failed':
      return 'failed';
    case 'task.status.changed':
      return undefined;
    case 'plan.execution.started':
    case 'plan.execution.updated':
    case 'task.execution.started':
    case 'task.execution.completed':
    case 'task.execution.failed':
    case 'plan.execution.cancelled':
      return undefined;
    default: {
      const _exhaustive: never = eventType;
      void _exhaustive;
      return undefined;
    }
  }
}

/**
 * Validate "apply this event in the current phase".
 * Returns ok with target phase, or a structured failure (no throw).
 */
export function validateEventPhaseTransition(
  from: PlanPhase,
  event: PlanEvent | PlanEventType,
  ctx: PhaseTransitionContext = {}
): PhaseTransitionResult & { eventType: PlanEventType } {
  const eventType = typeof event === 'string' ? event : event.type;
  const to = phaseForEvent(eventType, from);

  if (to === undefined) {
    // No phase change — always legal from the FSM table's point of view.
    return { ok: true, from, to: from, self: true, eventType };
  }

  const result = validatePhaseTransition(from, to, {
    ...ctx,
    // Approve path: if caller didn't pass hasStructuredPlan, leave guard off
    // unless event is plan.approved and we can infer from the event payload.
    hasStructuredPlan:
      ctx.hasStructuredPlan ??
      (eventType === 'plan.approved' && typeof event !== 'string'
        ? undefined
        : ctx.hasStructuredPlan)
  });

  return { ...result, eventType };
}

/** Assert variant used by PlanSession.recordEvent. */
export function assertEventPhaseTransition(
  from: PlanPhase,
  event: PlanEvent,
  ctx: PhaseTransitionContext = {}
): void {
  const result = validateEventPhaseTransition(from, event, ctx);
  if (!result.ok) {
    throw new IllegalPhaseTransitionError(result);
  }
}

// ─── helpers ────────────────────────────────────────────────────────

function fail(
  from: PlanPhase,
  to: PlanPhase,
  code: PhaseTransitionErrorCode,
  message: string
): PhaseTransitionFail {
  const allowed = getAllowedPhases(from);
  return {
    ok: false,
    code,
    from,
    to,
    allowed,
    message,
    hint: code === 'ILLEGAL_TRANSITION' ? buildIllegalHint(from, to, allowed) : message
  };
}

function buildIllegalHint(
  from: PlanPhase,
  to: PlanPhase,
  allowed: readonly PlanPhase[]
): string {
  const list = allowed.length > 0 ? allowed.join(', ') : '(none)';
  return (
    `Cannot go from phase "${from}" to "${to}". ` +
    `Allowed: ${list}. ` +
    `Check event order (plan.started → research.completed → plan.generated → plan.approved).`
  );
}

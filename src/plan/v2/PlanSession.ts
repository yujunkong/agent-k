/**
 * PlanSession — the single object both the Plan UI and Agent execution
 * read from. This is the fix for problem #1 from the original review:
 * "Plan exists as both a conversation and a separate workflow, and they
 * have to be kept in sync by hand."
 *
 * Every state change happens through `recordEvent()`. Nothing mutates
 * `state` directly from outside — that's what made the old Chat/Plan split
 * possible to fall out of sync in the first place.
 */
import type { PlanDocument, PlanTask, TaskStatus } from './schema';
import type { PlanEvent } from './PlanEvent';
import {
  assertEventPhaseTransition,
  phaseForEvent
} from './PlanPhaseTransitions';

export type PlanPhase =
  | 'idle'
  | 'research'
  | 'planning'
  | 'review'
  | 'executing'
  | 'completed'
  | 'failed';

export interface PlanSessionState {
  id: string;
  phase: PlanPhase;
  goal: string;
  researchFindings: string;
  plan: PlanDocument | null;
  /** taskId -> status, kept separately from plan.tasks so PlanDocument stays
   *  an immutable record of "what was approved" while execution progresses. */
  taskStatus: Record<string, TaskStatus>;
  /** Merge note: subset approval, borrowed from the other implementation's
   *  `approvedTaskIds`. Undefined/empty = "all tasks approved" (the
   *  original all-or-nothing behavior); non-empty = only these tasks are
   *  in scope for execution / isAllTasksVerified(). */
  approvedTaskIds: string[];
  rejectionFeedback: string[];
  events: PlanEvent[];
}

const TERMINAL_STATUSES: TaskStatus[] = ['verified'];
const NON_SUGGESTIBLE_STATUSES: TaskStatus[] = ['blocked', 'awaiting_verification'];
/** Completion-like statuses require all dependencies to be verified first.
 *  Evidence cannot override the plan contract (deps). */
const COMPLETION_LIKE_STATUSES: TaskStatus[] = [
  'satisfied',
  'awaiting_verification',
  'verified'
];

export class PlanSession {
  private state: PlanSessionState;
  private listeners: Array<(event: PlanEvent) => void> = [];

  constructor(id: string) {
    this.state = {
      id,
      phase: 'idle',
      goal: '',
      researchFindings: '',
      plan: null,
      taskStatus: {},
      approvedTaskIds: [],
      rejectionFeedback: [],
      events: []
    };
  }

  getState(): Readonly<PlanSessionState> {
    return this.state;
  }

  getPhase(): PlanPhase {
    return this.state.phase;
  }

  /** Explicitly discard the current planning session. This is different from
   * plan.failed: the user intentionally abandoned the plan and a future
   * Plan run must start from a clean state. */
  reset(): void {
    this.state = {
      id: this.state.id,
      phase: 'idle',
      goal: '',
      researchFindings: '',
      plan: null,
      taskStatus: {},
      approvedTaskIds: [],
      rejectionFeedback: [],
      events: []
    };
  }

  getPlan(): PlanDocument | null {
    return this.state.plan;
  }

  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.state.taskStatus[taskId];
  }

  /** All events recorded so far, in order. Useful for debugging /
   *  reconstructing "what happened" without scraping chat messages. */
  getEvents(): readonly PlanEvent[] {
    return this.state.events;
  }

  /** Merge note: pub/sub borrowed from the other implementation's
   *  PlanSessionStore.onEvent — lets ChatApp/UI react to state changes
   *  instead of polling getState() after every call. */
  onEvent(listener: (event: PlanEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: PlanEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // a listener throwing must never break session state changes
      }
    }
  }

  /** Which tasks are actually in scope for execution / completion.
   *  Empty approvedTaskIds means "all tasks" (default, all-or-nothing). */
  private scopedTaskIds(): string[] {
    if (this.state.approvedTaskIds.length > 0) return this.state.approvedTaskIds;
    return this.state.plan?.tasks.map((t) => t.id) ?? [];
  }

  /**
   * The only way state changes. Each event type has a narrow, explicit
   * effect — no heuristic inference about what a message "probably means".
   *
   * Merge note: phase changes are validated against PLAN_PHASE_TRANSITIONS
   * before being applied (throws IllegalPhaseTransitionError on an illegal
   * jump) — borrowed from the other implementation's PlanTransitions.ts.
   * Task-status changes (task.status.changed) are NOT subject to this
   * guard — see PlanPhaseTransitions.ts for why.
   */
  recordEvent(event: PlanEvent): void {
    // FSM: event → target phase → edge table.
    // plan.approved additionally requires a structured plan already in session.
    assertEventPhaseTransition(this.state.phase, event, {
      hasStructuredPlan:
        event.type === 'plan.approved' ? this.state.plan != null : undefined
    });

    const nextPhase = phaseForEvent(event.type, this.state.phase);
    this.state.events.push(event);

    switch (event.type) {
      case 'plan.started':
        this.state.goal = event.goal;
        this.state.researchFindings = '';
        this.state.plan = null;
        this.state.taskStatus = {};
        this.state.approvedTaskIds = [];
        this.state.rejectionFeedback = [];
        break;

      case 'research.completed':
        this.state.researchFindings = event.findings;
        break;

      case 'plan.generation.attempt':
        break;

      case 'plan.generation.failed':
        // Stay in 'planning' — the caller is expected to retry or give up
        // (see PlanV2Generator's maxAttempts). We don't move to 'failed'
        // here because a retry is still in flight.
        break;

      case 'plan.generated':
        this.state.plan = event.plan;
        this.state.taskStatus = Object.fromEntries(
          event.plan.tasks.map((t) => [t.id, 'pending' as TaskStatus])
        );
        this.state.approvedTaskIds = [];
        break;

      case 'plan.review.opened':
        break;

      case 'plan.approved':
        this.state.approvedTaskIds = event.taskIds && event.taskIds.length > 0
          ? this.expandApprovalScope(event.taskIds)
          : [];
        break;

      case 'plan.rejected':
        this.state.rejectionFeedback.push(event.feedback);
        break;

      case 'task.status.changed': {
        // Contract > observation: completion-like transitions require verified deps.
        // If unmet, force `blocked` and rewrite the logged event so the audit
        // trail matches runtime state.
        let effectiveTo = event.to;
        if (
          COMPLETION_LIKE_STATUSES.includes(event.to) &&
          !this.areDependenciesVerified(event.taskId)
        ) {
          effectiveTo = 'blocked';
          this.state.events[this.state.events.length - 1] = {
            ...event,
            to: effectiveTo
          };
        }
        this.applyTaskTransition(event.taskId, effectiveTo);
        break;
      }

      case 'plan.completed':
        break;

      case 'plan.failed':
        break;
    }

    if (nextPhase !== undefined) {
      this.state.phase = nextPhase;
    }

    this.emit(event);
  }

  /**
   * Rejection feedback rendered as prompt text for the next planning
   * attempt — first-class input, not lost context (problem #7 from the
   * original review).
   */
  getRejectionContextPrompt(): string {
    if (this.state.rejectionFeedback.length === 0) return '';
    const latest = this.state.rejectionFeedback[this.state.rejectionFeedback.length - 1];
    return [
      'The previous plan was rejected by the user with this feedback:',
      `"${latest}"`,
      '',
      'Address this feedback explicitly in the new plan.'
    ].join('\n');
  }

  /** Explicit/manual verification is the safe completion path for tasks
   * that have no machine-checkable verification rule. The UI can call this
   * after the user confirms the result. */
  verifyTaskManually(taskId: string): void {
    const current = this.state.taskStatus[taskId];
    if (current === undefined) throw new Error(`Unknown task: ${taskId}`);
    if (current !== 'satisfied' && current !== 'awaiting_verification') {
      throw new Error(`Task ${taskId} is not awaiting verification (current: ${current}).`);
    }
    this.recordEvent({
      type: 'task.status.changed',
      taskId,
      from: current,
      to: 'verified',
      timestamp: Date.now()
    });
  }

  /** Task-level summary for a "current task" execution context, avoiding
   *  dumping the entire plan into the agent's context on every turn. */
  getTaskContext(taskId: string): { task: PlanTask; status: TaskStatus } | null {
    const task = this.state.plan?.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    return { task, status: this.state.taskStatus[taskId] || 'pending' };
  }

  /** Next task with unmet dependencies excluded — a suggestion, not an
   *  enforced order (Evidence Engine still governs actual status changes).
   *  Only considers tasks in the approved scope (see scopedTaskIds()).
   *  Returns the task augmented with its current status — PlanTask itself
   *  has no status field (see schema.ts; status lives in taskStatus). */
  getNextSuggestedTask(): (PlanTask & { status: TaskStatus }) | null {
    if (!this.state.plan) return null;
    const scope = new Set(this.scopedTaskIds());
    for (const task of this.state.plan.tasks) {
      if (!scope.has(task.id)) continue;
      const status = this.state.taskStatus[task.id] || 'pending';
      if (TERMINAL_STATUSES.includes(status) || NON_SUGGESTIBLE_STATUSES.includes(status)) continue;
      const depsVerified = task.dependencies.every(
        (dep) => this.state.taskStatus[dep] === 'verified'
      );
      if (depsVerified) return { ...task, status };
    }
    return null;
  }

  /** Partial approval cannot deadlock on an unapproved dependency. When
   * a task is approved, its transitive dependencies are automatically added
   * to the execution scope as prerequisites. */
  private expandApprovalScope(taskIds: string[]): string[] {
    const plan = this.state.plan;
    if (!plan) return [];
    const byId = new Map(plan.tasks.map((task) => [task.id, task]));
    const scope = new Set<string>();
    const visit = (id: string) => {
      if (scope.has(id)) return;
      const task = byId.get(id);
      if (!task) return;
      scope.add(id);
      task.dependencies.forEach(visit);
    };
    taskIds.forEach(visit);
    return plan.tasks.map((task) => task.id).filter((id) => scope.has(id));
  }

  /** True once every task in the approved scope is verified. Merge note:
   *  the scope narrows to approvedTaskIds when a partial approval was
   *  recorded (plan.approved with taskIds), so an out-of-scope task being
   *  unfinished doesn't block "done" for the tasks that were approved. */
  isAllTasksVerified(): boolean {
    if (!this.state.plan || this.state.plan.tasks.length === 0) return false;
    const scope = this.scopedTaskIds();
    if (scope.length === 0) return false;
    return scope.every((id) => this.state.taskStatus[id] === 'verified');
  }

  /** True when every declared dependency of `taskId` is verified. */
  private areDependenciesVerified(taskId: string): boolean {
    const task = this.state.plan?.tasks.find((t) => t.id === taskId);
    if (!task || task.dependencies.length === 0) return true;
    return task.dependencies.every((dep) => this.state.taskStatus[dep] === 'verified');
  }

  /**
   * Evidence is still accepted without an edge table (agent may touch files
   * out of order). Completion-like statuses, however, are gated on the plan
   * contract: unmet dependencies force `blocked` (handled in recordEvent
   * before this is called). When a task becomes verified, dependents that
   * were blocked solely for that reason are moved back to `pending`.
   */
  private applyTaskTransition(taskId: string, to: TaskStatus): void {
    const from = this.state.taskStatus[taskId];
    if (from === undefined) {
      // Evidence referenced a task not in the plan — ignore rather than throw.
      return;
    }
    this.state.taskStatus[taskId] = to;
    if (to === 'verified') {
      this.unblockDependentsOf(taskId);
    }
  }

  /** After a task is verified, any dependent that is currently `blocked`
   *  and whose full dependency set is now verified returns to `pending`. */
  private unblockDependentsOf(verifiedTaskId: string): void {
    if (!this.state.plan) return;
    for (const task of this.state.plan.tasks) {
      if (!task.dependencies.includes(verifiedTaskId)) continue;
      if (this.state.taskStatus[task.id] !== 'blocked') continue;
      if (!this.areDependenciesVerified(task.id)) continue;
      this.state.taskStatus[task.id] = 'pending';
      const unblockEvent: PlanEvent = {
        type: 'task.status.changed',
        taskId: task.id,
        from: 'blocked',
        to: 'pending',
        timestamp: Date.now()
      };
      this.state.events.push(unblockEvent);
      this.emit(unblockEvent);
    }
  }

  /** Serialize for persistence (PlanStorage) / hydration (tab switch). */
  toJSON(): PlanSessionState {
    return JSON.parse(JSON.stringify(this.state));
  }

  static fromJSON(state: PlanSessionState): PlanSession {
    const session = new PlanSession(state.id);
    session.state = state;
    return session;
  }
}

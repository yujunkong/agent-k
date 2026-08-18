/**
 * PlanModeControllerAdapter — the seam between the old world and Plan V2.
 *
 * Per the migration plan agreed on for this refactor: don't delete
 * PlanModeController, PlanGenerator, PlanReview.tsx, or PlanEditor.tsx.
 * Instead, run PlanSession / PlanV2Generator / EvidenceEngine underneath,
 * and mirror their state into the shapes the existing UI already expects.
 */
import { PlanModeController } from '../PlanModeController';
import type { PlanDocument as LegacyPlanDocument } from '../PlanGenerator';
import { PlanSession } from './PlanSession';
import type { PlanDocument as PlanDocumentV2, TaskStatus } from './schema';
import { renderPlanMarkdown } from './renderPlanMarkdown';
import { PlanV2Generator, type PlanGenerationModel } from './PlanV2Generator';
import type { FileExistenceChecker } from './validators/SemanticValidator';
import { deriveTaskUpdates, type ObservedToolCall } from './EvidenceEngine';
import type { FailureContext } from './FailureContext';
type FailureLike = FailureContext;

function toLegacyPlanDocument(
  plan: PlanDocumentV2,
  researchContext: string,
  taskStatus: Readonly<Record<string, TaskStatus>> = {}
): LegacyPlanDocument {
  const content = renderPlanMarkdown(plan, researchContext, taskStatus);
  return {
    slug: plan.id,
    title: plan.summary.slice(0, 60) || plan.goal.slice(0, 60),
    content,
    sections: [],
    todoCount: plan.tasks.length,
    createdAt: plan.createdAt
  };
}

export class PlanModeControllerAdapter {
  readonly legacy: PlanModeController;
  readonly session: PlanSession;

  constructor(sessionId: string, legacy?: PlanModeController) {
    this.legacy = legacy ?? new PlanModeController();
    this.session = new PlanSession(sessionId);
  }

  async start(goal: string): Promise<void> {
    this.session.recordEvent({ type: 'plan.started', goal, timestamp: Date.now() });
    await this.legacy.run(goal);
  }

  async completeResearch(findings: string): Promise<void> {
    // `research.completed` is also the legal edge into `planning`.
    this.session.recordEvent({ type: 'research.completed', findings, timestamp: Date.now() });
    await this.legacy.completeResearch(findings);
  }

  /**
   * Normalize the session lifecycle before generation. The UI historically
   * had paths that could call generatePlan directly, without going through
   * start() / completeResearch(). Plan V2 has an explicit FSM, so generation
   * must never attempt `idle -> planning`.
   */
  private async ensureGenerationPhase(): Promise<void> {
    let phase = this.session.getPhase();
    const legacyState = this.legacy.getState();
    const goal = this.session.getState().goal || legacyState.researchResults || 'Plan';
    const findings = this.session.getState().researchFindings || legacyState.researchResults || '';

    if (phase === 'idle') {
      this.session.recordEvent({ type: 'plan.started', goal, timestamp: Date.now() });
      await this.legacy.run(goal);
      phase = this.session.getPhase();
    }

    if (phase === 'research') {
      this.session.recordEvent({ type: 'research.completed', findings, timestamp: Date.now() });
      await this.legacy.completeResearch(findings);
    }
  }

  /** Generate through V2 (schema + semantic validation + bounded retry). */
  async generatePlan(
    model: PlanGenerationModel,
    fileExists: FileExistenceChecker
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    await this.ensureGenerationPhase();

    const state = this.session.getState();
    const legacyState = this.legacy.getState();
    const generator = new PlanV2Generator(model, fileExists);
    const result = await generator.generate({
      goal: state.goal || legacyState.researchResults || 'Plan',
      researchContext: state.researchFindings || legacyState.researchResults || '',
      rejectionFeedback: state.rejectionFeedback.slice(-1)[0]
    });

    if (!result.ok || !result.plan) {
      for (let attempt = 1; attempt <= result.attempts; attempt++) {
        this.session.recordEvent({ type: 'plan.generation.attempt', attempt, timestamp: Date.now() });
        const failure = result.failures.find((item) => item.attempt === attempt);
        if (failure) this.session.recordEvent({ type: 'plan.generation.failed', attempt, failure, timestamp: Date.now() });
      }
      this.session.recordEvent({ type: 'plan.failed', reason: `Plan generation failed after ${result.attempts} attempt(s).`, timestamp: Date.now() });
      const lastFailure = result.failures[result.failures.length - 1];
      const problems = lastFailure?.errors.map((e) => `- [${e.code}] ${e.message}`).join('\n') ?? '(no details)';
      return { ok: false, message: `The plan could not be validated automatically. Issues:\n${problems}` };
    }

    await this.acceptGeneratedPlan(result.plan, {
      attempts: result.attempts,
      failures: result.failures,
      researchContext: state.researchFindings || legacyState.researchResults || ''
    });
    return { ok: true };
  }

  async acceptGeneratedPlan(
    plan: PlanDocumentV2,
    options: { attempts?: number; failures?: Array<FailureLike>; researchContext?: string } = {}
  ): Promise<void> {
    const attempts = Math.max(1, options.attempts ?? 1);
    const failures = options.failures ?? [];
    const failuresByAttempt = new Map(failures.map((failure) => [failure.attempt, failure]));
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.session.recordEvent({ type: 'plan.generation.attempt', attempt, timestamp: Date.now() });
      const failure = failuresByAttempt.get(attempt);
      if (failure) this.session.recordEvent({ type: 'plan.generation.failed', attempt, failure, timestamp: Date.now() });
    }
    this.session.recordEvent({ type: 'plan.generated', plan, attempt: attempts, timestamp: Date.now() });
    const researchContext = options.researchContext ?? this.session.getState().researchFindings;
    await this.legacy.setPlanDocument(toLegacyPlanDocument(plan, researchContext, this.session.getState().taskStatus));
    await this.legacy.moveToReview();
    this.session.recordEvent({ type: 'plan.review.opened', timestamp: Date.now() });
  }

  async ensureStructuredPlan(params: {
    generate: () => Promise<{ ok: boolean; plan?: PlanDocumentV2; attempts: number; failures: FailureLike[] }>;
    researchContext?: string;
    goalFallback?: string;
  }): Promise<PlanDocumentV2> {
    const existing = this.session.getPlan();
    if (existing) return existing;

    let phase = this.session.getPhase();
    const goal = this.session.getState().goal || params.goalFallback || 'Plan';
    const findings = params.researchContext ?? this.session.getState().researchFindings ?? '';

    if (phase === 'idle') {
      this.session.recordEvent({ type: 'plan.started', goal, timestamp: Date.now() });
      phase = this.session.getPhase();
    }
    if (phase === 'research') {
      this.session.recordEvent({ type: 'research.completed', findings, timestamp: Date.now() });
    }

    const result = await params.generate();
    if (!result.ok || !result.plan) {
      const last = result.failures[result.failures.length - 1];
      const problems = last?.errors.map((e) => `- [${e.code}] ${e.message}`).join('\n') ?? '(no details)';
      throw new Error(`Cannot approve without a structured Plan. Regeneration also failed.\n${problems}`);
    }

    await this.acceptGeneratedPlan(result.plan, {
      attempts: result.attempts,
      failures: result.failures,
      researchContext: findings
    });

    const loaded = this.session.getPlan();
    if (!loaded) throw new Error('Failed to load the structured Plan into the session.');
    return loaded;
  }

  async approve(taskIds?: string[]): Promise<void> {
    const plan = this.session.getPlan();
    if (!plan) throw new Error('Cannot approve: no structured plan is loaded. Approve only accepts a structured Plan in PlanSession. Call ensureStructuredPlan() and retry.');
    const requested = taskIds && taskIds.length > 0 ? [...new Set(taskIds)] : undefined;
    if (requested) {
      const known = new Set(plan.tasks.map((task) => task.id));
      const unknown = requested.filter((id) => !known.has(id));
      if (unknown.length > 0) throw new Error(`Cannot approve unknown task(s): ${unknown.join(', ')}`);
    }
    this.session.recordEvent({ type: 'plan.approved', taskIds: requested, timestamp: Date.now() });
    await this.legacy.approvePlan();
  }

  async reject(feedback: string): Promise<void> {
    this.session.recordEvent({ type: 'plan.rejected', feedback, timestamp: Date.now() });
    await this.legacy.rejectPlan(feedback);
  }

  verifyTaskManually(taskId: string): void {
    this.session.verifyTaskManually(taskId);
    const plan = this.session.getPlan();
    if (plan) void this.legacy.setPlanDocument(toLegacyPlanDocument(plan, this.session.getState().researchFindings, this.session.getState().taskStatus));
    if (this.session.getPhase() === 'executing' && this.session.isAllTasksVerified()) {
      this.session.recordEvent({ type: 'plan.completed', timestamp: Date.now() });
    }
  }

  discard(): void {
    this.legacy.discardPlan();
    this.session.reset();
  }

  recordToolEvent(call: ObservedToolCall): void {
    const plan = this.session.getPlan();
    if (!plan) return;
    const updates = deriveTaskUpdates(call, plan.tasks);
    for (const update of updates) {
      const from = this.session.getTaskStatus(update.taskId) as TaskStatus;
      if (from === update.to) continue;
      this.session.recordEvent({ type: 'task.status.changed', taskId: update.taskId, from, to: update.to, evidence: update.evidence, timestamp: Date.now() });
    }
    if (this.session.getPhase() === 'executing' && this.session.isAllTasksVerified()) {
      this.session.recordEvent({ type: 'plan.completed', timestamp: Date.now() });
    }
    void this.legacy.setPlanDocument(toLegacyPlanDocument(plan, this.session.getState().researchFindings, this.session.getState().taskStatus));
  }

  getCurrentTaskContext(): string {
    const task = this.session.getNextSuggestedTask();
    if (!task) return this.session.isAllTasksVerified() ? 'All tasks verified. Nothing left to do.' : 'No task is currently unblocked (check dependencies / task list).';
    return [
      `## Plan: ${this.session.getState().id}`,
      `## Current Task: ${task.id} — ${task.title}`,
      '', task.description, '',
      task.files.length > 0 ? `Files: ${task.files.map((f) => `${f.path} (${f.intent})`).join(', ')}` : '',
      task.dependencies.length > 0 ? `Dependencies (must be verified first): ${task.dependencies.join(', ')}` : '',
      task.verification.length > 0 ? `Verification: ${task.verification.join('; ')}` : 'No automatic verification defined for this task.'
    ].filter(Boolean).join('\n');
  }

  getFullPlanContext(): string {
    const plan = this.session.getPlan();
    if (!plan) return '';
    return renderPlanMarkdown(plan, this.session.getState().researchFindings, this.session.getState().taskStatus);
  }
}

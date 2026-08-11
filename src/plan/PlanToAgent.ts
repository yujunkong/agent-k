/**
 * PlanToAgent — Confirm → Build handoff (C5-T07), OpenCode-aligned
 *
 * OpenCode `plan_exit` pattern:
 * 1. Switch agent to build (write tools on)
 * 2. Inject a short synthetic user kickoff — NOT the full plan body
 * 3. Plan lives in system addon (or on disk); chat history must not re-dump Review chrome
 *
 * agent-k mapping:
 * - UI Confirm → PlanModeController.advanceToBuild → onBuildReady
 * - mode=agent + planStage=build
 * - systemAddon = approved plan + research + Q&A
 * - api user = short kickoff only (skip harness prefetch on this turn)
 */
import type { Mode } from '../agent/types';
import type { PlanDocument } from './PlanGenerator';
import { planGenerator } from './PlanGenerator';

export interface AgentTransitionContext {
  mode: Mode;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  planDocument: PlanDocument;
  currentStep: number;
}

/**
 * OpenCode-style synthetic kickoff after approval.
 * Keep short — long kickoffs + prefetch made weak models re-plan.
 */
export function buildKickoffUserMessage(planRef?: string): string {
  const ref = (planRef || '').trim();
  if (ref) {
    return (
      `The plan at ${ref} has been approved, you can now edit files. ` +
      `Execute the plan step by step, starting with Step 1. ` +
      `Do not re-plan or reprint the Review summary.`
    );
  }
  return (
    `The plan has been approved, you can now edit files. ` +
    `Execute the plan step by step, starting with Step 1. ` +
    `Do not re-plan or reprint the Review summary.`
  );
}

/** @deprecated use buildKickoffUserMessage() */
export const PLAN_EXECUTE_KICKOFF = buildKickoffUserMessage();

/** Detect model echoing internal handoff stubs into the chat bubble. */
export function looksLikePlanHandoffLeak(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return (
    /\[Earlier:\s*plan drafted for Review/i.test(t) ||
    /Full plan is in the system prompt/i.test(t) ||
    /do not reprint Review chrome/i.test(t) ||
    /planMarkdown|systemAddon|PLAN_EXECUTE/i.test(t)
  );
}

function shouldDropAssistantForBuild(content: string, planMarkdown?: string): boolean {
  const c = String(content || '');
  if (planMarkdown) return true;
  if (/View Plans\s*\/\s*Reject\s*\/\s*Confirm/i.test(c)) return true;
  if (/Review 창/.test(c) && /진행 순서|TODO/i.test(c)) return true;
  if (
    /You are Agent K in AGENT mode/.test(c) &&
    /Approved Implementation Plan/.test(c)
  ) {
    return true;
  }
  if (looksLikePlanHandoffLeak(c)) return true;
  return false;
}

/**
 * Drop Review-summary chrome from API history (OpenCode: don't re-feed plan UI).
 * Never replace with an echoable English stub — omit the turn instead.
 */
export function compactMessagesForPlanExecute(
  messages: Array<{ role: string; content: string; planMarkdown?: string }>
): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  for (const m of messages) {
    if (m.role !== 'assistant') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (shouldDropAssistantForBuild(m.content, m.planMarkdown)) continue;
    out.push({ role: m.role, content: String(m.content || '') });
  }
  return out;
}

/**
 * Confirm→Build handoff: drop Review chrome AND long Plan-phase research essays.
 * Q&A + plan body are already in systemAddon — keeping huge digests in history
 * makes small models restart exploration.
 */
export function compactHistoryForBuildHandoff(
  messages: Array<{ role: string; content: string; planMarkdown?: string }>
): Array<{ role: string; content: string }> {
  const base = compactMessagesForPlanExecute(messages);
  return base.filter((m) => {
    if (m.role !== 'assistant') return true;
    const c = String(m.content || '');
    // Long research / findings dumps from Plan phase
    if (c.length > 1200) return false;
    return true;
  });
}

export class PlanToAgent {
  private currentStep = 0;
  private totalSteps = 0;
  private planDoc: PlanDocument | null = null;

  /**
   * System-prompt addon only — plan + research + Q&A + ordered TODO checklist.
   * Must NOT be pasted into the user chat turn.
   */
  buildHandoffSystemAddon(
    planDocument: PlanDocument,
    researchContext: string,
    answers: Array<{ question: string; answer: string }>
  ): string {
    const todos = planGenerator.extractTodos(planDocument.content);
    this.totalSteps = todos.length;
    this.currentStep = 0;
    this.planDoc = planDocument;

    const planRef =
      planDocument.slug && planDocument.slug !== 'plan_pending'
        ? `.agentk/plans/${planDocument.slug}.md`
        : planDocument.title || 'approved plan';

    return [
      '## Approved plan execution (Build / Agent mode)',
      '',
      `The user approved the plan (${planRef}). You are now in BUILD mode with write tools.`,
      '',
      'Rules (OpenCode-style):',
      '- Execute steps in order (Step 1, then 2, …). Do not skip ahead.',
      '- For each step: read relevant files, then write_file/edit_file in the same run.',
      '- Do not restart research/planning. Do not reprint Review UI chrome',
      '  ("View Plans / Reject / Confirm", "Review 창", full TODO-only summaries).',
      '- Never output internal markers like "[Earlier: plan drafted…]" or',
      '  "Full plan is in the system prompt".',
      '- After edits: report what changed + next TODO. Do NOT reprint',
      '  "Planning next moves" or a fresh numbered "I need to:" plan under the diff.',
      '- Never end with "Proceeding to write…" — call the write tools instead.',
      '',
      '## Approved Implementation Plan',
      '',
      planDocument.content,
      '',
      '## Research Context',
      '',
      researchContext || '(none)',
      '',
      '## Answers to Clarifying Questions',
      ...(answers.length
        ? answers.map((a) => `- ${a.question}: ${a.answer}`)
        : ['(none)']),
      '',
      `## Progress (0/${todos.length} steps completed)`,
      ...todos.map((todo, i) => `- [${i === 0 ? '>' : ' '}] Step ${i + 1}: ${todo}`),
      '',
      'Begin with Step 1.'
    ].join('\n');
  }

  buildKickoffUserMessage(planRef?: string): string {
    if (planRef) return buildKickoffUserMessage(planRef);
    const slug = this.planDoc?.slug;
    const ref =
      slug && slug !== 'plan_pending'
        ? `.agentk/plans/${slug}.md`
        : this.planDoc?.title;
    return buildKickoffUserMessage(ref);
  }

  /**
   * @deprecated Prefer buildHandoffSystemAddon + buildKickoffUserMessage.
   */
  buildTransitionContext(
    planDocument: PlanDocument,
    researchContext: string,
    answers: Array<{ question: string; answer: string }>
  ): AgentTransitionContext {
    const systemPrompt = this.buildHandoffSystemAddon(
      planDocument,
      researchContext,
      answers
    );

    return {
      mode: 'agent',
      systemPrompt,
      messages: [{ role: 'user', content: this.buildKickoffUserMessage() }],
      planDocument,
      currentStep: 0
    };
  }

  advanceStep(): { step: number; todo: string; total: number } {
    const todos = planGenerator.extractTodos(this.planDoc?.content || '');
    this.currentStep = Math.min(this.currentStep + 1, todos.length);

    return {
      step: this.currentStep,
      todo: todos[this.currentStep - 1] || '',
      total: this.totalSteps
    };
  }

  setPlanDocument(doc: PlanDocument): void {
    this.planDoc = doc;
    const todos = planGenerator.extractTodos(doc.content);
    this.totalSteps = todos.length;
    this.currentStep = 0;
  }

  getStepContext(): string {
    const todos = planGenerator.extractTodos(this.planDoc?.content || '');
    const step = this.currentStep;
    const todo = todos[step] || 'Unknown step';

    return [
      `---`,
      `### Plan Progress: Step ${step + 1}/${this.totalSteps}`,
      ``,
      `**Current step**: ${todo}`,
      ``,
      step + 1 < this.totalSteps
        ? `**Next step**: ${todos[step + 1]}`
        : '**This is the final step.**',
      ``,
      `**Completed steps**: ${step}/${this.totalSteps}`,
      `---`
    ].join('\n');
  }
}

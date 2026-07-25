/**
 * PlanToAgent - 승인 시 Agent 모드 전환 (C5-T07)
 * 
 * 승인 시:
 * 1. switch_mode('agent')
 * 2. Plan 컨텍스트 (Q&A + Mermaid + TODOs) 주입
 * 3. edit_file/write_file 스키마 노출 (쓰기 도구 활성화)
 * 4. Per-plan-step 진행 상황 추적
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

export class PlanToAgent {
  private currentStep = 0;
  private totalSteps = 0;

  /**
   * Build the transition context for switching from Plan → Agent mode
   */
  buildTransitionContext(
    planDocument: PlanDocument,
    researchContext: string,
    answers: Array<{ question: string; answer: string }>
  ): AgentTransitionContext {
    const todos = planGenerator.extractTodos(planDocument.content);
    this.totalSteps = todos.length;
    this.currentStep = 0;

    const systemPrompt = [
      'You are Agent K in AGENT mode. You have been given an approved implementation plan.',
      '',
      'Follow the plan steps in order. Do not skip ahead.',
      'For each step, read relevant files first, then make the necessary changes.',
      'After completing each step, verify the changes work.',
      '',
      'You can use all tools: read, edit, write, and terminal.',
    ].join('\n');

    const planContext = [
      '## Approved Implementation Plan',
      '',
      planDocument.content,
      '',
      '## Research Context',
      '',
      researchContext,
      '',
      '## Answers to Clarifying Questions',
      ...answers.map(a => `- ${a.question}: ${a.answer}`),
      '',
      `## Progress (0/${this.totalSteps} steps completed)`,
      ...todos.map((todo, i) => `- [${i === 0 ? '>' : ' '}] Step ${i + 1}: ${todo}`),
      '',
      'Begin with Step 1.'
    ].join('\n');

    return {
      mode: 'agent',
      systemPrompt,
      messages: [{ role: 'system', content: systemPrompt + '\n\n' + planContext }],
      planDocument,
      currentStep: 0
    };
  }

  /**
   * Advance to the next step in the plan
   */
  advanceStep(): { step: number; todo: string; total: number } {
    const todos = planGenerator.extractTodos(this.planDoc?.content || '');
    this.currentStep = Math.min(this.currentStep + 1, todos.length);
    
    return {
      step: this.currentStep,
      todo: todos[this.currentStep - 1] || '',
      total: this.totalSteps
    };
  }

  private planDoc: PlanDocument | null = null;

  setPlanDocument(doc: PlanDocument): void {
    this.planDoc = doc;
    const todos = planGenerator.extractTodos(doc.content);
    this.totalSteps = todos.length;
    this.currentStep = 0;
  }

  /**
   * Generate a "Per plan step N" context injection string
   */
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
      step + 1 < this.totalSteps ? `**Next step**: ${todos[step + 1]}` : '**This is the final step.**',
      ``,
      `**Completed steps**: ${step}/${this.totalSteps}`,
      `---`
    ].join('\n');
  }
}

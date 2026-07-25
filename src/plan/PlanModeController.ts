/**
 * PlanModeController - Plan 모드 5단계 오케스트레이터 (C5-T01)
 * 
 * 플로우: Research → Questions → Plan → Review → Build (Agent 전환)
 * PLAN whitelist: 읽기 도구 + ask_question + todo_write + switch_mode
 * 쓰기/터미널/browser 도구는 스키마 미노출 또는 호출 시 즉시 deny
 */
import type { Mode } from '../agent/types';
import { modeRegistry } from '../agent/modeRegistry';
import type { ResearchPhase } from './ResearchPhase';
import type { ClarifyingQuestions } from './ClarifyingQuestions';
import type { PlanDocument } from './PlanGenerator';
import type { PlanEditor } from './PlanEditor';

export type PlanStage = 'research' | 'questions' | 'planning' | 'review' | 'build';

export interface PlanFlowState {
  stage: PlanStage;
  researchResults: string;
  questions: Array<{ id: string; question: string; answer: string }>;
  planDocument: PlanDocument | null;
  approved: boolean;
  error?: string;
}

export class PlanModeController {
  private state: PlanFlowState;
  private onStageChange: ((stage: PlanStage) => void) | null = null;

  constructor() {
    this.state = {
      stage: 'research',
      researchResults: '',
      questions: [],
      planDocument: null,
      approved: false
    };
  }

  getStage(): PlanStage { return this.state.stage; }
  getState(): PlanFlowState { return { ...this.state }; }

  onStageChangeCallback(cb: (stage: PlanStage) => void): void {
    this.onStageChange = cb;
  }

  private setStage(stage: PlanStage): void {
    this.state.stage = stage;
    this.onStageChange?.(stage);
  }

  /**
   * Stage 1: Codebase Research (읽기 전용)
   */
  async startResearch(): Promise<void> {
    this.setStage('research');
    this.state.researchResults = '';
    this.state.planDocument = null;
    this.state.approved = false;
  }

  async completeResearch(results: string): Promise<void> {
    this.state.researchResults = results;
  }

  /**
   * Stage 2: Clarifying Questions
   */
  getQuestions(): Array<{ id: string; question: string; answer: string }> {
    return [...this.state.questions];
  }

  addQuestion(q: { id: string; question: string; answer?: string }): void {
    this.state.questions.push({ ...q, answer: q.answer || '' });
  }

  answerQuestion(id: string, answer: string): boolean {
    const q = this.state.questions.find(q => q.id === id);
    if (!q) return false;
    q.answer = answer;
    return true;
  }

  areAllQuestionsAnswered(): boolean {
    return this.state.questions.length > 0 && 
      this.state.questions.every(q => q.answer && q.answer.trim().length > 0);
  }

  async moveToPlanning(): Promise<void> {
    if (!this.areAllQuestionsAnswered()) {
      throw new Error('All required questions must be answered before planning');
    }
    this.setStage('planning');
  }

  /**
   * Stage 3: Plan Generation
   */
  async setPlanDocument(doc: PlanDocument): Promise<void> {
    this.state.planDocument = doc;
  }

  async moveToReview(): Promise<void> {
    if (!this.state.planDocument) {
      throw new Error('Plan document must be generated before review');
    }
    this.setStage('review');
  }

  /**
   * Stage 4: Review & Approval
   */
  async approvePlan(): Promise<void> {
    if (!this.state.planDocument) {
      throw new Error('Cannot approve without a plan document');
    }
    if (!this.areAllQuestionsAnswered()) {
      throw new Error('All questions must be answered before approval');
    }
    this.state.approved = true;
  }

  async rejectPlan(reason?: string): Promise<void> {
    this.state.approved = false;
    this.state.error = reason;
    this.setStage('planning'); // Go back to planning
  }

  /**
   * Stage 5: Build (switch to Agent mode)
   * Returns the context that should be injected when switching to Agent mode
   */
  getBuildContext(): string {
    if (!this.state.approved || !this.state.planDocument) {
      throw new Error('Plan must be approved before building');
    }

    return [
      '## Implementation Plan',
      '',
      'The following plan has been approved. Follow each step in order:',
      '',
      this.state.planDocument.content,
      '',
      '## Research Context',
      '',
      this.state.researchResults,
      '',
      '## Answers to Questions',
      ...this.state.questions.map(q => `- ${q.question}: ${q.answer}`)
    ].join('\n');
  }

  /**
   * Reset the entire flow
   */
  reset(): void {
    this.state = {
      stage: 'research',
      researchResults: '',
      questions: [],
      planDocument: null,
      approved: false
    };
  }

  /**
   * Check if a tool is allowed in Plan mode
   */
  isToolAllowed(toolName: string): boolean {
    return modeRegistry.isToolAllowed('plan', toolName);
  }
}

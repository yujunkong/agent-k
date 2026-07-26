/**
 * PlanModeController - Plan 모드 5단계 오케스트레이터 (C5-T01)
 * 
 * 플로우: Research → Questions → Plan → Review → Build (Agent 전환)
 * PLAN whitelist: 읽기 도구 + ask_question + todo_write + switch_mode
 * 쓰기/터미널/browser 도구는 스키마 미노출 또는 호출 시 즉시 deny
 * 
 * RW-C5-01: run() 진입점 추가 → AgentLoop+Chat 연결
 * RW-C5-02: ask_question → ClarifyingQuestions UI 브리지
 * RW-C5-03: PlanEditor에 실제 Mermaid 렌더 연결
 * RW-C5-04: Approve→Agent 핸드오프
 */
import type { Mode } from '../agent/types';
import { modeRegistry } from '../agent/modeRegistry';
import type { PlanDocument } from './PlanGenerator';

export type PlanStage = 'research' | 'questions' | 'planning' | 'review' | 'build';

export interface PlanFlowState {
  stage: PlanStage;
  researchResults: string;
  questions: Array<{ id: string; question: string; answer: string }>;
  planDocument: PlanDocument | null;
  approved: boolean;
  error?: string;
}

/** 스테이지별 시스템 프롬프트 */
export const PLAN_STAGE_PROMPTS: Record<PlanStage, string> = {
  research: `You are Agent K in PLAN mode — RESEARCH stage.

Your ONLY task: explore the codebase to understand the current state.
Use read-only tools (grep, glob, read_file, list_dir, codebase_search, lsp_*).
After exploration, summarize findings and generate 3-5 clarifying questions.

RULES:
- Do NOT edit any files.
- Do NOT run terminal commands (except read-only utils).
- Output: exploration summary followed by questions.`,

  questions: `You are Agent K in PLAN mode — QUESTIONS stage.

The user is answering clarifying questions about the plan scope.
Wait for all questions to be answered before proceeding.
You may use ask_question to ask additional questions if needed.

RULES:
- Do NOT edit files or run terminal commands.
- Only ask questions or provide clarifications.`,

  planning: `You are Agent K in PLAN mode — PLANNING stage.

Generate a comprehensive plan document with:
1. Context — what was found during exploration
2. Architecture — Mermaid diagrams showing before/after
3. TODOs — numbered implementation steps
4. Risks — potential issues and mitigations

RULES:
- Do NOT implement anything. This is a planning-only stage.
- Include at least one Mermaid diagram.
- Be specific about file paths and code changes.`,

  review: `You are Agent K in PLAN mode — REVIEW stage.

The plan document has been generated. Present it for user review.
The user can edit the plan, approve it, or request changes.

RULES:
- Wait for user decision (approve/reject/edit).
- If rejected, revise the plan based on feedback.
- If approved, call switch_mode('agent') to start implementation.`,

  build: `You are Agent K — BUILD mode.

The plan has been approved. Execute the implementation steps in order.
Follow the plan precisely. If you discover issues, report them.
Start with TODO #1 and proceed sequentially.`
};

export class PlanModeController {
  private state: PlanFlowState;
  private onStageChange: ((stage: PlanStage) => void) | null = null;
  private onBuildReady: ((context: string) => void) | null = null;

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

  /** 빌드 준비 콜백 (Agent 모드 전환용) */
  onBuildReadyCallback(cb: (context: string) => void): void {
    this.onBuildReady = cb;
  }

  /** 현재 스테이지에 맞는 시스템 프롬프트 반환 */
  getSystemPrompt(): string {
    return PLAN_STAGE_PROMPTS[this.state.stage];
  }

  private setStage(stage: PlanStage): void {
    this.state.stage = stage;
    this.onStageChange?.(stage);
  }

  // ─── Run orchestration ──────────────────────────────────

  /**
   * Plan 모드 전체 오케스트레이션 진입점 (RW-C5-01)
   * stageManager 콜백을 통해 외부에서 단계 전환을 제어합니다.
   * 
   * @param goal 사용자 목표/요청사항
   */
  async run(goal: string): Promise<void> {
    this.reset();
    this.state.researchResults = goal; // Store initial goal
    this.setStage('research');
  }

  /**
   * AgentLoop에서 리서치 완료 후 질문 생성 단계로 전환
   */
  async advanceAfterResearch(questions: Array<{ id: string; question: string; answer?: string }>): Promise<void> {
    for (const q of questions) {
      this.addQuestion(q);
    }
    this.setStage('questions');
  }

  /**
   * 질문 완료 → Planning 단계로 전환
   */
  async advanceToPlanning(): Promise<void> {
    if (!this.areAllQuestionsAnswered()) {
      throw new Error('All required questions must be answered before planning');
    }
    this.setStage('planning');
  }

  /**
   * Plan 문서 생성 완료 → Review 단계로 전환
   */
  async advanceToReview(): Promise<void> {
    if (!this.state.planDocument) {
      throw new Error('Plan document must be generated before review');
    }
    this.setStage('review');
  }

  /**
   * 승인 → Build (Agent 모드 전환) 
   */
  async advanceToBuild(): Promise<void> {
    if (!this.state.planDocument) {
      throw new Error('Cannot build without a plan document');
    }
    if (!this.areAllQuestionsAnswered()) {
      throw new Error('All questions must be answered before building');
    }
    this.state.approved = true;
    this.setStage('build');
    // Fire build-ready callback so ChatApp can switch mode
    if (this.onBuildReady) {
      this.onBuildReady(this.getBuildContext());
    }
  }

  /**
   * UI에서 단계 배지 클릭 시 이동.
   * 이전 단계로는 항상 가능. 앞으로 가기는 최소 조건만 검사.
   */
  goToStage(stage: PlanStage): { ok: boolean; error?: string } {
    const order: PlanStage[] = ['research', 'questions', 'planning', 'review', 'build'];
    if (!order.includes(stage)) {
      return { ok: false, error: `Unknown stage: ${stage}` };
    }
    const currentIdx = order.indexOf(this.state.stage);
    const targetIdx = order.indexOf(stage);

    // Backward / same: always OK
    if (targetIdx <= currentIdx) {
      this.setStage(stage);
      return { ok: true };
    }

    if (stage === 'questions') {
      this.setStage('questions');
      return { ok: true };
    }
    if (stage === 'planning') {
      this.setStage('planning');
      return { ok: true };
    }
    if (stage === 'review') {
      if (!this.state.planDocument) {
        return {
          ok: false,
          error: '아직 Plan 문서가 없습니다. Planning에서 먼저 계획을 생성하세요.'
        };
      }
      this.setStage('review');
      return { ok: true };
    }
    if (stage === 'build') {
      if (!this.state.planDocument) {
        return { ok: false, error: 'Plan 문서가 없어 Build로 갈 수 없습니다.' };
      }
      if (!this.state.approved) {
        return {
          ok: false,
          error: 'Plan을 Review에서 승인한 뒤에 Build로 진행할 수 있습니다.'
        };
      }
      if (!this.areAllQuestionsAnswered()) {
        return {
          ok: false,
          error: '질문에 모두 답한 뒤에 Build로 진행할 수 있습니다.'
        };
      }
      this.setStage('build');
      if (this.onBuildReady) {
        try {
          this.onBuildReady(this.getBuildContext());
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : 'Build 전환 실패'
          };
        }
      }
      return { ok: true };
    }

    this.setStage(stage);
    return { ok: true };
  }

  // ─── Stage 1: Research ──────────────────────────────────
  async startResearch(): Promise<void> {
    this.setStage('research');
    this.state.researchResults = '';
    this.state.planDocument = null;
    this.state.approved = false;
  }

  async completeResearch(results: string): Promise<void> {
    this.state.researchResults = results;
  }

  // ─── Stage 2: Questions ─────────────────────────────────
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

  // ─── Stage 3: Planning ──────────────────────────────────
  async setPlanDocument(doc: PlanDocument): Promise<void> {
    this.state.planDocument = doc;
  }

  async moveToReview(): Promise<void> {
    if (!this.state.planDocument) {
      throw new Error('Plan document must be generated before review');
    }
    this.setStage('review');
  }

  // ─── Stage 4: Review & Approval ─────────────────────────
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

  // ─── Stage 5: Build ─────────────────────────────────────
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

  // ─── Lifecycle ──────────────────────────────────────────
  reset(): void {
    this.state = {
      stage: 'research',
      researchResults: '',
      questions: [],
      planDocument: null,
      approved: false
    };
  }

  isToolAllowed(toolName: string): boolean {
    return modeRegistry.isToolAllowed('plan', toolName);
  }
}

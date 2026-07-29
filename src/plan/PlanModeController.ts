/**
 * PlanModeController - Plan 모드 5단계 오케스트레이터 (C5-T01)
 * 
 * 플로우: Research → Questions → Plan → Review → Build (Agent 전환)
 * PLAN whitelist: 읽기 도구 + ask_question + todo_write (switch_mode 없음 — UI Approve만 Build)
 * 쓰기/터미널/browser 도구는 스키마 미노출 또는 호출 시 즉시 deny
 * 
 * RW-C5-01: run() 진입점 추가 → AgentLoop+Chat 연결
 * RW-C5-02: ask_question → ClarifyingQuestions UI 브리지
 * RW-C5-03: PlanReview에서 리뷰 + Approve→Agent 핸드오프
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

CASUAL FIRST: greetings / small talk → brief reply, no tools, do not resume old plans unless asked.

For a real planning request — ONE pass only:
1. Explore read-only once. Summarize what you learned (short).
2. Deliberate hard (goals, constraints, trade-offs, risks, UX/API, success criteria).
3. Then call \`ask_question\` ONCE with \`questions: [{question, options, allow_multiple?}]\` covering EVERY material decision you need — as many questions as needed (no small cap). Prefer allow_multiple when several options may apply.
4. STOP and wait for the user. Do NOT start another explore round. Do NOT drip one question per turn.

If nothing material is undecided after research → draft the plan document (full markdown with \`- [ ]\` TODOs) and stop for Review. Do not invent filler questions.

RULES: no product-code edits; no implementation menus; no solo research↔question loops.`,

  questions: `You are Agent K in PLAN mode — QUESTIONS stage.

You already researched. Ask EVERY remaining material REQUIREMENT decision in ONE \`ask_question\` call with a large \`questions: [...]\` batch (no max count). Do not explore the tree again.
After the user answers (UI Complete Questions), write the plan — do not re-research.
Do not spam serial single questions.`,

  planning: `You are Agent K in PLAN mode — PLANNING stage.

Research and clarifying answers are DONE. Tools for explore/ask_question are UNAVAILABLE.
Do NOT explore. Do NOT call ask_question. Do NOT say you will "파악" the structure.

Your FIRST visible line MUST be: "계획 문서 작성을 시작합니다."
Then immediately output the COMPLETE plan markdown for Review:
1. Context
2. Questions & Answers
3. Architecture (mermaid before/after)
4. TODOs (\`- [ ]\` — ordered work, not done)
5. Risks
6. Approval

Output the full markdown **once**. The UI shows "작성 중", saves \`.agentk/plans/tmp/plan_*.md\`, then shows a short summary + TODO list and opens Review.
Then **STOP and wait** for user 승인 / 반려.
Do NOT implement. Do NOT call switch_mode.
Mermaid: quote labels with ( ), /, or <br/> — always close \`\`\`mermaid fences.`,

  review: `You are Agent K in PLAN mode — REVIEW stage.

The plan is in the review UI. Respond to feedback only.
If the user feedback requires a clarifying decision, you may call \`ask_question\` (batch when possible, no max count).
Do NOT implement. Do NOT call switch_mode. Do NOT re-explore the whole tree.
Build starts only when the user clicks 승인 (Approve).`,

  build: `You are Agent K — BUILD mode.

The plan has been approved. Execute the TODOs in order.`
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
  getState(): PlanFlowState {
    return {
      ...this.state,
      questions: this.state.questions.map((q) => ({ ...q })),
      planDocument: this.state.planDocument
        ? { ...this.state.planDocument }
        : null
    };
  }

  /**
   * Restore a parked per-session plan snapshot (tab switch).
   * emit:false avoids UI stage callbacks overwriting Review open/closed.
   */
  hydrate(state: PlanFlowState, opts?: { emit?: boolean }): void {
    this.state = {
      stage: state.stage || 'research',
      researchResults: state.researchResults || '',
      questions: (state.questions || []).map((q) => ({
        id: q.id,
        question: q.question,
        answer: q.answer || ''
      })),
      planDocument: state.planDocument ? { ...state.planDocument } : null,
      approved: Boolean(state.approved),
      error: state.error
    };
    if (opts?.emit !== false) {
      this.onStageChange?.(this.state.stage);
    }
  }

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
    // No questions yet → not blocking Approve once a plan exists (research-only paths).
    return this.state.questions.every(q => q.answer && q.answer.trim().length > 0);
  }

  /**
   * ask_question tool fired — move header to Questions (progress indicator).
   */
  enterQuestionsStage(): void {
    if (this.state.stage === 'research' || this.state.stage === 'questions') {
      this.setStage('questions');
    }
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

  /** Discard current plan document and return to research */
  discardPlan(): void {
    this.state.planDocument = null;
    this.state.approved = false;
    this.state.error = undefined;
    this.state.questions = [];
    this.setStage('research');
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

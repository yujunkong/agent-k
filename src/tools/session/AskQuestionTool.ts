/**
 * AskQuestionTool - ask_question 도구 실행기 (C5-T02 / RW-C5-02)
 *
 * Host AgentLoop blocks on RuntimeServices.waitForQuestion.
 * Extension notifier → webview ClarifyingQuestions → chat.answer resolves the wait.
 * (Webview and host are separate bundles — never rely on in-process callbacks alone.)
 */
import type { ToolInput, ToolOutput } from '../types';
import { RuntimeServices, type PendingAskQuestion } from '../../core/RuntimeServices';

export type PendingQuestion = PendingAskQuestion & {
  answer?: string;
  answered: boolean;
};

export class AskQuestionTool {
  private pendingQuestions: Map<string, PendingQuestion> = new Map();
  /** Legacy in-process callback (tests / same-bundle); host path uses RuntimeServices notifier */
  private onNewQuestion: ((q: PendingQuestion) => void) | null = null;

  onNewQuestionCallback(cb: (q: PendingQuestion) => void): void {
    this.onNewQuestion = cb;
  }

  /**
   * Register question and wait for user answer via host↔webview bridge.
   */
  async execute(input: ToolInput): Promise<ToolOutput> {
    const questionText = String(input.question || '').trim();
    if (!questionText) {
      return { success: false, error: 'ask_question requires a non-empty "question" string' };
    }

    const optionsRaw = input.options;
    const options = Array.isArray(optionsRaw)
      ? (optionsRaw as unknown[]).map((o) => String(o)).filter(Boolean)
      : undefined;

    const qid = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pending: PendingQuestion = {
      id: qid,
      question: questionText,
      options: options && options.length > 0 ? options : undefined,
      required: true,
      answered: false,
    };

    this.pendingQuestions.set(qid, pending);
    this.onNewQuestion?.(pending);

    try {
      const answer = await RuntimeServices.waitForQuestion(
        {
          id: pending.id,
          question: pending.question,
          options: pending.options,
          required: pending.required,
        },
        typeof input.timeoutMs === 'number' ? (input.timeoutMs as number) : 600_000
      );

      pending.answer = answer;
      pending.answered = true;

      return {
        success: true,
        data: {
          question: questionText,
          answer,
          qid,
        },
      };
    } catch (err: any) {
      this.pendingQuestions.delete(qid);
      const msg = err?.message || String(err);
      return {
        success: false,
        error: msg,
        data: { question: questionText, qid, status: 'cancelled' },
      };
    }
  }

  /**
   * User answer from webview (also resolves RuntimeServices waiter on host).
   */
  answerQuestion(qid: string, answer: string): boolean {
    const pending = this.pendingQuestions.get(qid);
    if (pending) {
      pending.answer = answer;
      pending.answered = true;
    }
    RuntimeServices.resolveQuestion(qid, answer);
    return true;
  }

  getQuestion(qid: string): PendingQuestion | undefined {
    return this.pendingQuestions.get(qid);
  }

  getUnansweredQuestions(): PendingQuestion[] {
    return Array.from(this.pendingQuestions.values()).filter((q) => !q.answered);
  }

  getAllQuestions(): PendingQuestion[] {
    return Array.from(this.pendingQuestions.values());
  }

  /** Cancel pending wait + clear local state */
  clear(): void {
    RuntimeServices.cancelQuestion('ask_question cleared');
    this.pendingQuestions.clear();
  }
}

/** Singleton for AgentLoop (host) — webview must use postMessage, not this instance alone */
export const askQuestionTool = new AskQuestionTool();

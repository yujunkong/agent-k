/**
 * AskQuestionTool - ask_question 도구 실행기 (C5-T02 / RW-C5-02)
 *
 * Host AgentLoop blocks on RuntimeServices.waitForQuestion.
 * Supports a single question or a questions[] batch (parallel waiters).
 * allow_multiple → checkbox UI.
 */
import type { ToolInput, ToolOutput } from '../types';
import { RuntimeServices, type PendingAskQuestion } from '../../core/RuntimeServices';
import { normalizeMcqQuestion } from '../../chat/normalizeAskQuestion';

export type PendingQuestion = PendingAskQuestion & {
  answer?: string;
  answered: boolean;
};

type ParsedAskItem = {
  question: string;
  options?: unknown[];
  allowMultiple: boolean;
};

function truthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    return /^(true|1|yes|multi|multiple)$/i.test(v.trim());
  }
  return false;
}

function parseAskItems(input: ToolInput): ParsedAskItem[] {
  const batch = Array.isArray(input.questions) ? input.questions : null;
  if (batch && batch.length > 0) {
    const items: ParsedAskItem[] = [];
    for (const raw of batch) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const q = String(row.question || row.prompt || row.text || '').trim();
      if (!q) continue;
      items.push({
        question: q,
        options: Array.isArray(row.options) ? (row.options as unknown[]) : undefined,
        allowMultiple: truthyFlag(
          row.allow_multiple ?? row.allowMultiple ?? row.multiple
        )
      });
    }
    if (items.length) return items;
  }

  let questionText = String(
    input.question || input.prompt || input.text || input.query || input.message || ''
  ).trim();
  let optionsRaw = input.options as unknown;
  if (
    !questionText &&
    Array.isArray(input.questions) &&
    input.questions[0] &&
    typeof input.questions[0] === 'object'
  ) {
    const first = input.questions[0] as Record<string, unknown>;
    questionText = String(first.question || first.prompt || first.text || '').trim();
    if (optionsRaw == null && Array.isArray(first.options)) {
      optionsRaw = first.options;
    }
  }
  if (!questionText) {
    questionText =
      '전환 범위나 우선순위에 대해 확인이 필요합니다. 아래에서 선택하거나 기타에 적어 주세요.';
  }
  return [
    {
      question: questionText,
      options: Array.isArray(optionsRaw) ? (optionsRaw as unknown[]) : undefined,
      allowMultiple: truthyFlag(
        input.allow_multiple ?? input.allowMultiple ?? input.multiple
      )
    }
  ];
}

export class AskQuestionTool {
  private pendingQuestions: Map<string, PendingQuestion> = new Map();
  private onNewQuestion: ((q: PendingQuestion) => void) | null = null;

  onNewQuestionCallback(cb: (q: PendingQuestion) => void): void {
    this.onNewQuestion = cb;
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const items = parseAskItems(input);
    const timeoutMs =
      typeof input.timeoutMs === 'number' ? (input.timeoutMs as number) : 3_600_000;

    const prepared: PendingQuestion[] = [];
    for (const item of items) {
      const normalized = normalizeMcqQuestion(item.question, item.options);
      const normKey = normalized.question.replace(/\s+/g, ' ').trim().toLowerCase();
      let dup: PendingQuestion | undefined;
      for (const existing of this.pendingQuestions.values()) {
        if (
          !existing.answered &&
          String(existing.question || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase() === normKey
        ) {
          dup = existing;
          break;
        }
      }
      if (dup) {
        // Skip duplicate prompts in the same batch / pending set
        continue;
      }
      const qid = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const pending: PendingQuestion = {
        id: qid,
        question: normalized.question,
        options: normalized.options,
        required: true,
        allowMultiple: item.allowMultiple,
        answered: false
      };
      this.pendingQuestions.set(qid, pending);
      this.onNewQuestion?.(pending);
      prepared.push(pending);
    }

    if (prepared.length === 0) {
      return {
        success: false,
        error:
          'Duplicate ask_question: the same prompt(s) are already waiting for the user. Do not ask again.'
      };
    }

    try {
      const answers = await Promise.all(
        prepared.map(async (pending) => {
          const answer = await RuntimeServices.waitForQuestion(
            {
              id: pending.id,
              question: pending.question,
              options: pending.options,
              required: pending.required,
              allowMultiple: pending.allowMultiple
            },
            timeoutMs
          );
          pending.answer = answer;
          pending.answered = true;
          return {
            qid: pending.id,
            question: pending.question,
            answer,
            allowMultiple: Boolean(pending.allowMultiple)
          };
        })
      );

      if (answers.length === 1) {
        return {
          success: true,
          data: {
            question: answers[0].question,
            answer: answers[0].answer,
            qid: answers[0].qid,
            allowMultiple: answers[0].allowMultiple
          }
        };
      }
      return {
        success: true,
        data: {
          answers,
          count: answers.length
        }
      };
    } catch (err: any) {
      for (const p of prepared) {
        this.pendingQuestions.delete(p.id);
      }
      const msg = err?.message || String(err);
      const timedOut = /timed out/i.test(msg);
      return {
        success: false,
        error: timedOut
          ? `USER_WAITING: ${msg}. Stop now. Do not invent answers or rewrite the plan. Wait for the next user message.`
          : msg,
        data: {
          status: timedOut ? 'waiting' : 'cancelled',
          count: prepared.length
        }
      };
    }
  }

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

  clear(): void {
    RuntimeServices.cancelQuestion('ask_question cleared');
    this.pendingQuestions.clear();
  }
}

export const askQuestionTool = new AskQuestionTool();

/**
 * HOST — ask_question waiters (webview Confirm/Skip → resume AgentLoop).
 */

export type AskQuestionWaiter = {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  question: string;
  requestId?: string;
};

const waiters = new Map<string, AskQuestionWaiter>();

/** Block until chat.answer / chat.question.cancel for this qid. */
export function waitForAskAnswer(
  qid: string,
  question: string,
  opts?: { timeoutMs?: number; requestId?: string },
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 0; // 0 = no host-side idle timeout (UI owns 20s skip)
  return new Promise((resolve, reject) => {
    const existing = waiters.get(qid);
    if (existing) {
      if (existing.timer) clearTimeout(existing.timer);
      existing.reject(new Error('Superseded by new ask_question'));
      waiters.delete(qid);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        waiters.delete(qid);
        reject(new Error(`ask_question timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }
    waiters.set(qid, {
      resolve: (answer: string) => {
        if (timer) clearTimeout(timer);
        waiters.delete(qid);
        resolve(answer);
      },
      reject: (err: Error) => {
        if (timer) clearTimeout(timer);
        waiters.delete(qid);
        reject(err);
      },
      timer,
      question,
      requestId: opts?.requestId,
    });
  });
}

export function resolveAskAnswer(qid: string, answer: string): boolean {
  const w = waiters.get(qid);
  if (!w) {
    if (waiters.size === 1) {
      const only = waiters.values().next().value as AskQuestionWaiter | undefined;
      only?.resolve(answer);
      return Boolean(only);
    }
    return false;
  }
  w.resolve(answer);
  return true;
}

export function cancelAskQuestion(
  qid: string,
  reason = 'ask_question skipped',
): boolean {
  const w = waiters.get(qid);
  if (!w) return false;
  w.reject(new Error(reason));
  return true;
}

export function cancelAskQuestionsForRequest(
  requestId: string,
  reason = 'ask_question cancelled',
): void {
  for (const [id, w] of [...waiters.entries()]) {
    if (w.requestId && w.requestId !== requestId) continue;
    w.reject(new Error(reason));
    waiters.delete(id);
  }
}

/** Parse ask_question tool args into one or more prompts. */
export function parseAskQuestionItems(args: Record<string, unknown>): Array<{
  qid: string;
  question: string;
  options?: string[];
  allowMultiple?: boolean;
}> {
  const batch = Array.isArray(args.questions) ? args.questions : null;
  const out: Array<{
    qid: string;
    question: string;
    options?: string[];
    allowMultiple?: boolean;
  }> = [];
  if (batch && batch.length > 0) {
    batch.forEach((raw, i) => {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Record<string, unknown>;
      const question = String(row.question ?? row.prompt ?? row.text ?? '').trim();
      if (!question) return;
      out.push({
        qid: String(row.id ?? `q-${Date.now()}-${i}`),
        question,
        options: Array.isArray(row.options)
          ? row.options.map((o) => String(o))
          : undefined,
        allowMultiple: Boolean(
          row.allow_multiple ?? row.allowMultiple ?? row.multiple
        ),
      });
    });
    if (out.length) return out;
  }
  const question = String(
    args.question ?? args.prompt ?? args.text ?? args.query ?? ''
  ).trim();
  if (!question) return [];
  return [
    {
      qid: `q-${Date.now()}`,
      question,
      options: Array.isArray(args.options)
        ? args.options.map((o) => String(o))
        : undefined,
      allowMultiple: Boolean(
        args.allow_multiple ?? args.allowMultiple ?? args.multiple
      ),
    },
  ];
}

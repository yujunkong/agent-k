/**
 * AskQuestionCard ↔ ChatApp bridge — avoid prop-drilling through MessageSteps.
 * Comment: one card Confirm/Skip delivers the whole question batch.
 */

export type AskCardSelectPayload = {
  qid: string;
  answer: string;
  question: string;
};

export type AskCardAnswerItem = {
  qid: string;
  answer: string;
  question: string;
};

/** Confirm all questions in the card at once. */
export type AskCardConfirmPayload = {
  answers: AskCardAnswerItem[];
};

export type AskCardSkipPayload = {
  items: Array<{ qid: string; question: string }>;
  reason: 'timeout' | 'user';
};

type AskCardHandlers = {
  onSelect?: (p: AskCardSelectPayload) => void;
  onConfirm?: (p: AskCardConfirmPayload) => void;
  onSkip?: (p: AskCardSkipPayload) => void;
};

let handlers: AskCardHandlers = {};

/** Register from useChatPlanMode (or ChatApp). */
export function setAskQuestionCardHandlers(next: AskCardHandlers): void {
  handlers = next;
}

export function askCardSelect(p: AskCardSelectPayload): void {
  handlers.onSelect?.(p);
}

export function askCardConfirm(p: AskCardConfirmPayload): void {
  handlers.onConfirm?.(p);
}

export function askCardSkip(p: AskCardSkipPayload): void {
  handlers.onSkip?.(p);
}

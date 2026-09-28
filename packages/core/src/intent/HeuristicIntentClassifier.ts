/**
 * V31-INTENT-01 — Heuristic intent classifier (conservative; default = task).
 * Rule chain: inline-edit > conversation > question > default-task.
 */

import type { IntentGates, IntentVerdict } from '@agent-k/shared';
import type { IntentClassifier, IntentClassifierInput } from './IntentClassifier';
import type { IntentRule } from './IntentRule';

/** Greeting / small-talk ONLY — must match the whole trimmed text. */
const CONVERSATION_RE =
  /^(hi|hello|hey|yo|hiya)( there)?[!.\s~ㅋㅎ🙂👋]*$|^(good (morning|afternoon|evening))[!.\s]*$|^(thanks|thank you|thx|ty)[!.\s]*$|^(how are you|how's it going|what's up|sup)[?!.\s]*$|^(안녕|안녕하세요|안녕하십니까|ㅎㅇ|하이|반가워|반갑습니다|고마워|고맙습니다|감사합니다|감사|잘 지내|잘지내)[!.\s~ㅋㅎ🙂👋]*$/i;

/** Question markers (EN word-boundary + KO substring). */
const QUESTION_RE =
  /\b(what|where|how|why|which|who|explain|describe|tell me|show me)\b|뭐야|뭐지|뭐예요|무엇|설명|어디|어떻게|왜|알려줘|찾아줘|보여줘/i;

/** Action verbs disqualify the question rule (task wins). */
const ACTION_VERB_RE =
  /\b(fix|implement|write|edit|create|add|refactor|build|make|update|remove|delete|rename|migrate)\b|고쳐|구현|작성|수정|만들어|추가|삭제|리팩터|변경/i;

const FULL_GATES: IntentGates = {
  prefetch: true,
  verificationFirst: true,
  harnessBlocks: true,
  toolSchemas: 'full',
};

const NO_GATES: IntentGates = {
  prefetch: false,
  verificationFirst: false,
  harnessBlocks: false,
  toolSchemas: 'none',
};

const READONLY_GATES: IntentGates = {
  prefetch: false,
  verificationFirst: false,
  harnessBlocks: false,
  toolSchemas: 'readonly',
};

/** INLINE-003 — explicit inline edit is always a task. */
const inlineEditRule: IntentRule = {
  id: 'inline-edit',
  priority: 100,
  match: (input) =>
    input.hasInlineEdit === true
      ? {
          kind: 'task',
          confidence: 0.95,
          reason: 'inline edit request',
          gates: { ...FULL_GATES },
        }
      : null,
};

/** Pure greeting / small-talk — no action content allowed. */
const conversationRule: IntentRule = {
  id: 'conversation',
  priority: 80,
  match: (input) => {
    const text = input.userText.trim();
    if (!text || !CONVERSATION_RE.test(text)) return null;
    return {
      kind: 'conversation',
      confidence: 0.9,
      reason: 'greeting / small talk',
      gates: { ...NO_GATES },
    };
  },
};

/** Question intent without action verbs → read-only surface. */
const questionRule: IntentRule = {
  id: 'question',
  priority: 60,
  match: (input) => {
    const text = input.userText.trim();
    if (!text || !QUESTION_RE.test(text) || ACTION_VERB_RE.test(text)) {
      return null;
    }
    return {
      kind: 'question',
      confidence: 0.7,
      reason: 'question / read-only intent',
      gates: { ...READONLY_GATES },
    };
  },
};

/** Fallback — current behavior (full pipeline). */
const defaultTaskRule: IntentRule = {
  id: 'default-task',
  priority: 0,
  match: () => ({
    kind: 'task',
    confidence: 0.6,
    reason: 'default task',
    gates: { ...FULL_GATES },
  }),
};

/** Priority-ordered default rule chain (first non-null wins). */
export const DEFAULT_INTENT_RULES: IntentRule[] = [
  inlineEditRule,
  conversationRule,
  questionRule,
  defaultTaskRule,
];

const DEFAULT_TASK_VERDICT: IntentVerdict = {
  kind: 'task',
  confidence: 0.6,
  reason: 'default task',
  gates: { ...FULL_GATES },
};

export class HeuristicIntentClassifier implements IntentClassifier {
  readonly id = 'heuristic-v1';

  constructor(private readonly rules: IntentRule[] = DEFAULT_INTENT_RULES) {}

  classify(input: IntentClassifierInput): IntentVerdict {
    const ordered = [...this.rules].sort((a, b) => b.priority - a.priority);
    for (const rule of ordered) {
      const verdict = rule.match(input);
      if (verdict) return verdict;
    }
    return { ...DEFAULT_TASK_VERDICT, gates: { ...DEFAULT_TASK_VERDICT.gates } };
  }
}

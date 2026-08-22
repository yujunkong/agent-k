/**
 * Mode auto-classifier: sticky → heuristic → fallback.
 *
 * LLM router (`classifyModeWithLLM`) is still a stub — hybrid falls back
 * to the same heuristic until a router model is wired.
 */
import type { Mode } from '../agent/types';
import type {
  ClassifyInput,
  ConversationTurn,
  ModeDecision,
  ModePicker
} from './types';

const EXPLICIT_SWITCH_PATTERNS = [
  /그만|중지|stop|cancel/i,
  /계획만|설계만|plan only|switch to plan/i,
  /질문만|물어보|ask only|switch to ask/i,
  /디버깅만|debug only|switch to debug/i,
  /직접 해줘|수정해줘|실행해|switch to agent/i
];

const DEBUG_KEYWORDS = [
  /왜\s*안\s*돼|에러|오류|버그|깨졌|안\s*됨|실패|exception|crash|stack\s*trace/i,
  /고쳐|수정해|디버깅|재현/i,
  /\bbug\b|\berror\b|\bdebug\b|\bfix this\b/i
];

const PLAN_KEYWORDS = [
  /계획|설계|아키텍처|구조|어떻게\s*하면|전략|로드맵|단계적으로/i,
  /분석해\s*주고|개선\s*방안|리팩토링\s*방향/i,
  /\barchitecture\b|\broadmap\b|how should we|write a plan/i
];

const AGENT_KEYWORDS = [
  /해줘|수정하고|테스트까지|전부\s*처리|구현해|적용해|실행해\s*줘/i,
  /고쳐주고\s*테스트|코드\s*작성해|변경해\s*줘/i,
  /\bimplement\b|\bapply this\b|write the code|make the change/i
];

function explicitSwitch(msg: string): boolean {
  return EXPLICIT_SWITCH_PATTERNS.some((p) => p.test(msg));
}

/**
 * Heuristic + sticky classifier. Sync — safe to call on the send path.
 */
export function classifyMode(input: ClassifyInput): ModeDecision {
  const { userMessage, previousMode, previousWasActive, planSessionActive } =
    input;
  const msg = userMessage.trim();

  if (planSessionActive && !explicitSwitch(msg)) {
    return {
      mode: 'plan',
      confidence: 0.93,
      reason: 'Plan session is still in research/planning/review',
      sticky: true,
      source: 'sticky'
    };
  }

  if (
    previousMode &&
    (previousMode === 'agent' || previousMode === 'debug') &&
    previousWasActive &&
    !explicitSwitch(msg)
  ) {
    return {
      mode: previousMode,
      confidence: 0.92,
      reason: `Keeping ${previousMode} — previous turn was still using tools`,
      sticky: true,
      source: 'sticky'
    };
  }

  if (DEBUG_KEYWORDS.some((p) => p.test(msg))) {
    return {
      mode: 'debug',
      confidence: 0.85,
      reason: 'Debug/error keywords',
      sticky: false,
      source: 'heuristic'
    };
  }

  if (PLAN_KEYWORDS.some((p) => p.test(msg))) {
    return {
      mode: 'plan',
      confidence: 0.82,
      reason: 'Plan/design keywords',
      sticky: false,
      source: 'heuristic'
    };
  }

  if (AGENT_KEYWORDS.some((p) => p.test(msg))) {
    return {
      mode: 'agent',
      confidence: 0.8,
      reason: 'Implement/edit keywords',
      sticky: false,
      source: 'heuristic'
    };
  }

  return {
    mode: previousMode ?? 'ask',
    confidence: 0.55,
    reason: 'No strong signal — keep previous mode or ask',
    sticky: !!previousMode,
    source: 'fallback'
  };
}

export const ROUTER_SYSTEM_PROMPT = `You are a mode router for a coding agent.
Classify the user message into exactly one of: ask, plan, debug, agent.

Output ONLY valid JSON:
{
  "mode": "debug",
  "confidence": 0.91,
  "reason": "short reason"
}

Rules:
- debug: error, bug, why not working, fix this
- plan: design, architecture, how should we, strategy
- agent: implement, change code, run tests, do it
- ask: pure question, explanation
- If previous mode was agent/debug and no explicit switch, prefer keeping it.`;

export async function classifyModeWithLLM(
  userMessage: string,
  previousMode?: Mode | null
): Promise<ModeDecision> {
  // TODO: wire a small router model (ROUTER_SYSTEM_PROMPT + JSON parse).
  return classifyMode({ userMessage, previousMode });
}

export async function classifyModeHybrid(
  input: ClassifyInput,
  llmThreshold = 0.65
): Promise<ModeDecision> {
  const heuristic = classifyMode(input);
  if (heuristic.confidence >= llmThreshold) {
    return heuristic;
  }
  return classifyModeWithLLM(input.userMessage, input.previousMode);
}

function manualDecision(mode: Mode, reason: string): ModeDecision {
  return {
    mode,
    confidence: 1,
    reason,
    sticky: false,
    source: 'manual'
  };
}

/** Resolve the loop mode for one user send. */
export function resolveSendMode(opts: {
  userMessage: string;
  picker: ModePicker;
  lastTurn: ConversationTurn | null;
  planSessionActive: boolean;
  modeOverride?: Mode;
}): { mode: Mode; decision: ModeDecision } {
  if (opts.modeOverride) {
    return {
      mode: opts.modeOverride,
      decision: manualDecision(opts.modeOverride, 'Caller override')
    };
  }
  if (opts.picker !== 'auto') {
    return {
      mode: opts.picker,
      decision: manualDecision(opts.picker, 'Mode selector')
    };
  }
  const decision = classifyMode({
    userMessage: opts.userMessage,
    previousMode: opts.lastTurn?.mode,
    previousWasActive: opts.lastTurn?.hadToolCalls ?? false,
    planSessionActive: opts.planSessionActive
  });
  return { mode: decision.mode, decision };
}

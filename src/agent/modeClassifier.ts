/**
 * Mode Auto Classifier
 *
 * UI ModeSelector 대신 에이전트가 내부적으로
 * ask / plan / debug / agent 를 결정한다.
 *
 * - Sticky Mode: 직전 agent/debug 작업 중이면 명시적 전환 신호 없을 때 유지
 * - Heuristic: 키워드 기반 빠른 분류
 * - Fallback: 신호가 약하면 이전 모드 또는 ask
 *
 * 사용 예 (ChatApp 메시지 전송 직전):
 *   import { classifyMode } from '../agent/modeClassifier';
 *
 *   const decision = classifyMode({
 *     userMessage: text,
 *     previousMode: currentMode,
 *     previousWasActive: lastHadToolCalls,
 *   });
 *   const mode = decision.mode;
 */

import type { Mode } from './types';

export interface ModeDecision {
  mode: Mode;
  confidence: number; // 0 ~ 1
  reason: string;
  sticky: boolean;
  source: 'sticky' | 'heuristic' | 'llm' | 'fallback';
}

export interface ClassifyInput {
  userMessage: string;
  previousMode?: Mode | null;
  /** 직전 turn이 agent/debug로 실제로 도구를 실행 중이었는지 */
  previousWasActive?: boolean;
}

const EXPLICIT_SWITCH_PATTERNS = [
  /그만|중지|stop|cancel/i,
  /계획만|설계만|plan only/i,
  /질문만|물어보|ask only/i,
  /디버깅만|debug only/i,
  /직접 해줘|수정해줘|agent|실행해/i,
];

const DEBUG_KEYWORDS = [
  /왜\s*안\s*돼|에러|오류|버그|깨졌|안\s*됨|실패|exception|crash|stack\s*trace/i,
  /고쳐|수정해|디버깅|재현/i,
];

const PLAN_KEYWORDS = [
  /계획|설계|아키텍처|구조|어떻게\s*하면|전략|로드맵|단계적으로/i,
  /분석해\s*주고|개선\s*방안|리팩토링\s*방향/i,
];

const AGENT_KEYWORDS = [
  /해줘|수정하고|테스트까지|전부\s*처리|구현해|적용해|실행해\s*줘/i,
  /고쳐주고\s*테스트|코드\s*작성해|변경해\s*줘/i,
];

/**
 * 메인 분류 함수 (Heuristic + Sticky)
 */
export function classifyMode(input: ClassifyInput): ModeDecision {
  const { userMessage, previousMode, previousWasActive } = input;
  const msg = userMessage.trim();

  // 1. Sticky 우선
  if (
    previousMode &&
    (previousMode === 'agent' || previousMode === 'debug') &&
    previousWasActive &&
    !EXPLICIT_SWITCH_PATTERNS.some((p) => p.test(msg))
  ) {
    return {
      mode: previousMode,
      confidence: 0.92,
      reason: `이전 ${previousMode} 작업이 진행 중이어서 유지`,
      sticky: true,
      source: 'sticky',
    };
  }

  // 2. Heuristic 키워드
  if (DEBUG_KEYWORDS.some((p) => p.test(msg))) {
    return {
      mode: 'debug',
      confidence: 0.85,
      reason: '디버깅/오류 관련 키워드 감지',
      sticky: false,
      source: 'heuristic',
    };
  }

  if (PLAN_KEYWORDS.some((p) => p.test(msg))) {
    return {
      mode: 'plan',
      confidence: 0.82,
      reason: '계획/설계 관련 키워드 감지',
      sticky: false,
      source: 'heuristic',
    };
  }

  if (AGENT_KEYWORDS.some((p) => p.test(msg))) {
    return {
      mode: 'agent',
      confidence: 0.80,
      reason: '실행/수정 요청 키워드 감지',
      sticky: false,
      source: 'heuristic',
    };
  }

  // 3. Fallback
  return {
    mode: previousMode ?? 'ask',
    confidence: 0.55,
    reason: '명확한 신호가 없어 이전 모드 또는 ask로 fallback',
    sticky: !!previousMode,
    source: 'fallback',
  };
}

/**
 * (선택) LLM Router용 시스템 프롬프트
 * 14B 이하 instruct 모델에 사용
 */
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

/**
 * (선택) LLM Router 호출 스켈레톤
 */
export async function classifyModeWithLLM(
  userMessage: string,
  previousMode?: Mode | null
): Promise<ModeDecision> {
  // TODO: 실제 router 모델 호출 연결
  // const response = await callRouterModel([...]);
  // const parsed = JSON.parse(response);
  // return { ...parsed, sticky: false, source: 'llm' };

  return classifyMode({ userMessage, previousMode });
}

/**
 * Hybrid: confidence가 낮을 때만 LLM 호출
 */
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

/**
 * B. 모드 관련 타입 정의
 */

export type Mode = 'ask' | 'plan' | 'debug' | 'agent';

export interface ModeDecision {
  mode: Mode;
  confidence: number; // 0 ~ 1
  reason: string;
  sticky: boolean; // 직전 모드를 유지했는지 여부
  source: 'sticky' | 'heuristic' | 'llm' | 'fallback';
}

export interface ClassifyInput {
  userMessage: string;
  previousMode?: Mode | null;
  /** 직전 turn이 agent/debug로 실제로 도구를 실행 중이었는지 */
  previousWasActive?: boolean;
}

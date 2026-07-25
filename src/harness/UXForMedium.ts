/**
 * HARB-T13: UX For Medium Models (중급 모델이 '잘 도는 것처럼' 보이게)
 *
 * 중급 모델(Flash, 소형 instruct)이 실제로는 하네스 덕분에 잘 돌아가는데,
 * 사용자도 "어? 이 모델 꽤 잘하네?"라고 느끼게 하는 UX 레이어.
 *
 * PRD: PRD-Harness-13_UX_For_Medium.md
 */

/**
 * UX 상태 정보.
 */
export interface HarnessUXState {
  tier: 'A' | 'B' | 'C';
  modelName: string;
  toolsUsed: number;
  maxTools: number;
  prefetchCount: number;
  prefetchLatencyMs: number;
  verificationRetries: number;
  doomLoopDetected: boolean;
  latencyMs: number;
  contextTokens: number;
}

/**
 * 상태바 표시 문자열 생성.
 */
export function formatStatusBar(state: HarnessUXState): string {
  const tierIndicator =
    state.tier === 'A' ? '🟢' : state.tier === 'B' ? '🔵' : '🟡';
  return [
    `Tier: ${state.tier} (${state.modelName})`,
    `Tools: ${state.toolsUsed}/${state.maxTools}`,
    `Prefetch: ${state.prefetchCount} files (${state.prefetchLatencyMs}ms)`,
    tierIndicator,
  ].join('  ');
}

/**
 * 로그 라인 생성.
 */
export function formatLogLine(state: HarnessUXState, turn: number): string {
  return [
    `turn=${turn}`,
    `tier=${state.tier}`,
    `model=${state.modelName}`,
    `tools=${state.toolsUsed}`,
    `prefetch=${state.prefetchCount}`,
    `contextTokens=${state.contextTokens}`,
    `verificationRetries=${state.verificationRetries}`,
    `doomLoop=${state.doomLoopDetected}`,
    `latencyMs=${state.latencyMs}`,
  ].join(' ');
}

/**
 * UX 이벤트 타입.
 */
export type UXEventType =
  | 'doom_loop_detected'
  | 'lint_retry_failed'
  | 'prefetch_timeout'
  | 'tool_call_failed'
  | 'tier_upgraded'
  | 'tier_downgraded';

/**
 * UX 이벤트에 대한 사용자 액션 제안.
 */
export interface UXActionSuggestion {
  event: UXEventType;
  message: string;
  actions: string[];
}

/**
 * UX 이벤트에 따른 사용자 액션 제안 생성.
 */
export function suggestUXAction(event: UXEventType): UXActionSuggestion {
  switch (event) {
    case 'doom_loop_detected':
      return {
        event,
        message: 'The model appears to be stuck in a loop.',
        actions: ['Provide a hint', 'Continue anyway', 'Stop and switch to Pro'],
      };
    case 'lint_retry_failed':
      return {
        event,
        message: 'Auto-fix failed after 2 retries.',
        actions: ['Retry with Pro model', 'Skip and continue', 'Show lint errors'],
      };
    case 'prefetch_timeout':
      return {
        event,
        message: 'Prefetch is taking longer than expected.',
        actions: ['Disable prefetch', 'Wait longer', 'Browse manually'],
      };
    case 'tool_call_failed':
      return {
        event,
        message: 'Tool call failed 3 times.',
        actions: ['Reduce toolset (read-only)', 'Retry with Pro', 'Cancel'],
      };
    case 'tier_upgraded':
      return {
        event,
        message: 'Upgraded to Pro model for better results.',
        actions: ['Continue with Pro', 'Switch back to Flash'],
      };
    case 'tier_downgraded':
      return {
        event,
        message: 'Downgraded to Flash model to save budget.',
        actions: ['Continue with Flash', 'Force Pro'],
      };
  }
}

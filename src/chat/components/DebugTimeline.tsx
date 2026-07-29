/**
 * DebugTimeline — 스테이지 UI는 숨기고 백그라운드에서만 진행 (C6-T13)
 * 단계 전환은 DebugModeController / 에이전트가 내부에서 담당한다.
 */
import type { DebugStage } from '../../debug/DebugModeController';

interface DebugTimelineProps {
  currentStage: DebugStage;
  hypothesisCount: number;
  logsCollected: number;
  markersRemaining: number;
  verified: boolean;
  /** RW-C6-03-R2: browser evidence attached to timeline */
  evidenceCount?: number;
}

/** Kept for call-site compatibility; stage chrome is intentionally not shown. */
export function DebugTimeline(_props: DebugTimelineProps) {
  return null;
}

/**
 * useChatDebugMode — Debug 모드 FSM + UI 상태
 *
 * 담당:
 *   - DebugModeController 인스턴스
 *   - debugTick (강제 re-render 트리거)
 *   - ReproduceUI 상태 (showReproduce, steps, hypothesisId)
 *   - handleReproduced / handleReproduceCancel
 *   - handleSelectHypothesis / handleConfirmFix
 *   - 디버그 세션 slug ref
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { DebugModeController } from '../../debug/DebugModeController';
import type { DebugStage } from '../../debug/DebugModeController';
import { requestReproduceTool } from '../../tools/debug/RequestReproduceTool';
import { RuntimeServices } from '../../core/RuntimeServices';
import { getVsCodeApi } from '../host/vscodeApi';
import type { Mode } from '../types';
import type { Dispatch, SetStateAction } from 'react';

export interface UseChatDebugModeParams {
  mode: Mode;
  setError: Dispatch<SetStateAction<string | null>>;
  /**
   * handleSend 에 대한 ref — Plan 훅 이전에 선언되므로 ref 간접 참조.
   * handleConfirmFix 가 이 ref.current 를 호출함.
   */
  handleSendRef: MutableRefObject<
    | ((
        text: string,
        files: import('../types').Attachment[],
        opts?: { apiUserContent?: string; modeOverride?: Mode }
      ) => Promise<void>)
    | null
  >;
}

export interface UseChatDebugModeReturn {
  debugController: DebugModeController;
  debugTick: number;
  setDebugTick: Dispatch<SetStateAction<number>>;
  debugSessionSlugRef: MutableRefObject<string | undefined>;
  showReproduce: boolean;
  setShowReproduce: Dispatch<SetStateAction<boolean>>;
  reproduceSteps: { order: number; description: string }[];
  reproduceHypothesisId: string;
  handleReproduced: () => void;
  handleReproduceCancel: () => void;
  handleSelectHypothesis: (id: string) => void;
  handleConfirmFix: () => void;
}

export function useChatDebugMode(params: UseChatDebugModeParams): UseChatDebugModeReturn {
  const { mode, setError, handleSendRef } = params;

  const [debugController] = useState(() => new DebugModeController());
  const [debugTick, setDebugTick] = useState(0);
  const [showReproduce, setShowReproduce] = useState(false);
  const [reproduceSteps, setReproduceSteps] = useState<{ order: number; description: string }[]>([]);
  const [reproduceHypothesisId, setReproduceHypothesisId] = useState('debug');

  /** 디버그 세션 slug (.agentk/debug/tmp/debug_<hash>.md) */
  const debugSessionSlugRef = useRef<string | undefined>(undefined);

  // Debug controller stage 변경 → 강제 re-render
  useEffect(() => {
    debugController.onStageChangeCallback((_stage: DebugStage) => {
      setDebugTick((t) => t + 1);
    });
  }, [debugController]);

  // debug 모드 이탈 시 controller reset
  useEffect(() => {
    if (mode !== 'debug') {
      debugController.reset();
      debugSessionSlugRef.current = undefined;
    }
  }, [mode, debugController]);

  // RW-C6-05-R2: RequestReproduceTool 대기 시 ReproduceUI 마운트 (콜백 + 폴링)
  useEffect(() => {
    requestReproduceTool.onPendingCallback((req) => {
      setReproduceHypothesisId(req.hypothesisId);
      setReproduceSteps(req.steps.map((s, i) => ({ order: i + 1, description: s })));
      setShowReproduce(true);
    });
    const id = setInterval(() => {
      const pending = RuntimeServices.isReproducePending();
      if (pending && !showReproduce) {
        const req = requestReproduceTool.getPending();
        setReproduceHypothesisId(req?.hypothesisId || 'active');
        setReproduceSteps(
          (req?.steps || ['Follow the reproduce steps, then click Reproduced.']).map((s, i) => ({
            order: i + 1,
            description: s
          }))
        );
        setShowReproduce(true);
      }
      if (!pending && showReproduce) {
        setShowReproduce(false);
      }
    }, 400);
    return () => {
      clearInterval(id);
      requestReproduceTool.onPendingCallback(() => {});
    };
  }, [showReproduce]);

  /** Reproduce 완료 — host에 debug.save 전송 + controller 마킹 */
  const handleReproduced = useCallback(() => {
    RuntimeServices.resolveReproduce(true);
    debugController.markReproduced();
    setDebugTick((t) => t + 1);
    setShowReproduce(false);

    const state = debugController.getState();
    const active = debugController.getActiveHypothesis();
    const title = active?.title || 'Debug Session';
    const content = [
      '# Debug Session Report',
      '',
      `**Stage**: ${state.stage}`,
      `**Updated**: ${new Date().toISOString()}`,
      '',
      debugController.buildContextBlock(),
      '',
      '## Reproduce',
      'User confirmed reproduction completed.',
      '',
      ...(reproduceSteps.length
        ? ['### Steps', ...reproduceSteps.map((s) => `${s.order}. ${s.description}`)]
        : [])
    ].join('\n');

    try {
      const api = getVsCodeApi();
      api?.postMessage?.({
        type: 'debug.save',
        title,
        content,
        stage: state.stage,
        slug: debugSessionSlugRef.current,
        reproduce: reproduceSteps.length
          ? [
              '# Reproduce Script',
              '',
              `**Hypothesis**: ${active?.id || reproduceHypothesisId}`,
              '',
              '## Steps',
              ...reproduceSteps.map((s) => `${s.order}. ${s.description}`)
            ].join('\n')
          : undefined
      });
    } catch {
      /* ignore */
    }
  }, [debugController, reproduceSteps, reproduceHypothesisId]);

  const handleReproduceCancel = useCallback(() => {
    RuntimeServices.resolveReproduce(false);
    setShowReproduce(false);
  }, []);

  /** 가설 선택 → 계측 단계 진입 (RW-C6-01) */
  const handleSelectHypothesis = useCallback(
    (id: string) => {
      try {
        debugController.selectHypothesis(id);
        setDebugTick((t) => t + 1);
        const hyp = debugController.getHypotheses().find((h) => h.id === id);
        const state = debugController.getState();
        const content = [
          '# Debug Session Report',
          '',
          `**Stage**: ${state.stage}`,
          `**Updated**: ${new Date().toISOString()}`,
          '',
          `## Selected hypothesis`,
          hyp ? `- **${hyp.title}**: ${hyp.description}` : `- id: ${id}`,
          '',
          debugController.buildContextBlock()
        ].join('\n');
        try {
          getVsCodeApi()?.postMessage?.({
            type: 'debug.save',
            title: hyp?.title || 'Debug Session',
            content,
            stage: state.stage,
            slug: debugSessionSlugRef.current
          });
        } catch {
          /* ignore */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to select hypothesis');
      }
    },
    [debugController, setError]
  );

  /** Debug: Analyze → Confirm & Fix (Plan Approve 상당) */
  const handleConfirmFix = useCallback(() => {
    const active = debugController.getActiveHypothesis();
    if (active) {
      debugController.confirmHypothesis(active.id, ['User confirmed via Confirm & Fix']);
    } else {
      const pending = debugController.getHypotheses().find((h) => h.status === 'investigating');
      if (pending) {
        debugController.confirmHypothesis(pending.id, ['User confirmed via Confirm & Fix']);
      }
    }
    debugController.moveToFix();
    setDebugTick((t) => t + 1);

    const state = debugController.getState();
    const confirmed = debugController.getActiveHypothesis();
    const title = confirmed?.title || active?.title || 'Debug Session';
    const content = [
      '# Debug Session Report',
      '',
      `**Stage**: ${state.stage}`,
      `**Updated**: ${new Date().toISOString()}`,
      '',
      '## Confirmed for Fix',
      confirmed
        ? `- **${confirmed.title}**: ${confirmed.description}`
        : '- (no active hypothesis)',
      '',
      debugController.buildContextBlock()
    ].join('\n');
    try {
      getVsCodeApi()?.postMessage?.({
        type: 'debug.save',
        title,
        content,
        stage: state.stage,
        slug: debugSessionSlugRef.current,
        logs: state.logs.length ? state.logs.join('\n') : undefined
      });
    } catch {
      /* ignore */
    }

    void handleSendRef.current?.(
      [
        'The user pressed Confirm & Fix. Apply a **minimal change** for the confirmed hypothesis.',
        'Remove instrumentation markers in the Cleanup stage.',
        active ? `## Confirmed hypothesis\n${active.title}\n${active.description}` : '',
      ].filter(Boolean).join('\n'),
      []
    );
  }, [debugController, handleSendRef]);

  return {
    debugController,
    debugTick,
    setDebugTick,
    debugSessionSlugRef,
    showReproduce,
    setShowReproduce,
    reproduceSteps,
    reproduceHypothesisId,
    handleReproduced,
    handleReproduceCancel,
    handleSelectHypothesis,
    handleConfirmFix
  };
}

/**
 * useChatWorktree — Subagent Worktree 리뷰·적용·거부 핸들러
 *
 * handleWorktreeResultRef는 ChatApp에서 생성되어 useChatStream 콜백으로 전달되고,
 * 이 훅 내부의 useEffect에서 실제 구현체로 업데이트됨 (ref 간접 참조 패턴).
 */
import { useCallback, useEffect } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { ChatMessage } from '../types';
import {
  patchSubagentResultInEvents,
} from '../conversation/conversationWorkEvent';
import {
  applyHostWorktreeApplyResult,
  applyHostWorktreeRejectResult,
  applyHostWorktreeReviewResult,
  beginSubagentWorktreeAction,
  type SubagentResult
} from '../conversation/subagentResult';

export interface UseChatWorktreeParams {
  /** useChatStream onWorktreeResult 에 등록된 ref — 여기서 real 구현체로 교체 */
  handleWorktreeResultRef: MutableRefObject<(payload: Record<string, unknown>) => void>;
  /** 현재 세션 ID ref (ChatApp의 sessionIdRef) */
  sessionIdRef: MutableRefObject<string>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  updateSessionMessages: (
    id: string,
    updater: (prev: ChatMessage[]) => ChatMessage[]
  ) => void;
  sendWorktreeReview: (subagentId: string) => string | undefined;
  sendWorktreeApply: (subagentId: string) => string | undefined;
  sendWorktreeReject: (subagentId: string) => string | undefined;
}

export interface UseChatWorktreeReturn {
  handleWorktreeReview: (subagentId: string) => void;
  handleWorktreeApply: (subagentId: string) => void;
  handleWorktreeReject: (subagentId: string) => void;
}

export function useChatWorktree(params: UseChatWorktreeParams): UseChatWorktreeReturn {
  const {
    handleWorktreeResultRef,
    sessionIdRef,
    setMessages,
    updateSessionMessages,
    sendWorktreeReview,
    sendWorktreeApply,
    sendWorktreeReject
  } = params;

  /** workItems 내 subagent 결과를 patch하는 범용 updater */
  const patchSubagentWorktreeState = useCallback(
    (subagentId: string, patch: (prev: SubagentResult) => SubagentResult) => {
      const updater = (prev: ChatMessage[]) =>
        prev.map((msg) => {
          if (!Array.isArray(msg.workItems) || !msg.workItems.length) return msg;
          const nextItems = patchSubagentResultInEvents(msg.workItems, subagentId, patch);
          if (nextItems === msg.workItems) return msg;
          return { ...msg, workItems: nextItems };
        });
      setMessages(updater);
      updateSessionMessages(sessionIdRef.current, updater);
    },
    [setMessages, updateSessionMessages, sessionIdRef]
  );

  /** worktree.review/apply/reject.result 페이로드 처리 */
  const handleWorktreeResult = useCallback(
    (payload: Record<string, unknown>) => {
      const subagentId = String(payload.subagentId || '').trim();
      if (!subagentId) return;
      const type = String(payload.type || '');
      patchSubagentWorktreeState(subagentId, (prev) => {
        if (type === 'worktree.review.result') {
          return applyHostWorktreeReviewResult(prev, payload);
        }
        if (type === 'worktree.apply.result') {
          return applyHostWorktreeApplyResult(prev, payload);
        }
        if (type === 'worktree.reject.result') {
          return applyHostWorktreeRejectResult(prev, payload);
        }
        return prev;
      });
    },
    [patchSubagentWorktreeState]
  );

  // handleWorktreeResult 최신 구현체를 ref에 반영 (useChatStream이 이미 이 ref를 참조)
  useEffect(() => {
    handleWorktreeResultRef.current = handleWorktreeResult;
  }, [handleWorktreeResult, handleWorktreeResultRef]);

  const handleWorktreeReview = useCallback(
    (subagentId: string) => {
      patchSubagentWorktreeState(subagentId, (prev) =>
        beginSubagentWorktreeAction(prev, 'reviewing')
      );
      sendWorktreeReview(subagentId);
    },
    [patchSubagentWorktreeState, sendWorktreeReview]
  );

  const handleWorktreeApply = useCallback(
    (subagentId: string) => {
      patchSubagentWorktreeState(subagentId, (prev) =>
        beginSubagentWorktreeAction(prev, 'applying')
      );
      sendWorktreeApply(subagentId);
    },
    [patchSubagentWorktreeState, sendWorktreeApply]
  );

  const handleWorktreeReject = useCallback(
    (subagentId: string) => {
      patchSubagentWorktreeState(subagentId, (prev) =>
        beginSubagentWorktreeAction(prev, 'rejecting')
      );
      sendWorktreeReject(subagentId);
    },
    [patchSubagentWorktreeState, sendWorktreeReject]
  );

  return {
    handleWorktreeReview,
    handleWorktreeApply,
    handleWorktreeReject
  };
}

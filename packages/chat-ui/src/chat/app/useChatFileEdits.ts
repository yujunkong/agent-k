/**
 * useChatFileEdits — 파일 편집 미리보기 + 체크포인트 관리
 *
 * 담당:
 *   - checkpoints 상태 (host → 'checkpoint.listResult' 에 의해 채워짐)
 *   - sessionFileEdits (messages에서 수집)
 *   - 파일 열기 / 수락 / 거부 / Undo All / Review / List / Restore
 */
import { useState, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, FileEditPreview } from '../types';
import type { CheckpointSummary } from '../components/ChangedFilesBar';
import { collectSessionFileEdits } from '../chatAppHelpers';
import {
  inlineEditRejectRestorePayload,
  isInlineEditPreview,
  patchMessagesFileEditReview
} from '../inlineEditReview';
import { getVsCodeApi } from '../host/vscodeApi';

export interface UseChatFileEditsParams {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

export interface UseChatFileEditsReturn {
  checkpoints: CheckpointSummary[];
  setCheckpoints: Dispatch<SetStateAction<CheckpointSummary[]>>;
  sessionFileEdits: ReturnType<typeof collectSessionFileEdits>;
  handleOpenFile: (filePath: string) => void;
  handleUndoAllEdits: () => void;
  handleReviewEdits: () => void;
  handleAcceptFileEdit: (file: FileEditPreview) => void;
  handleRejectFileEdit: (file: FileEditPreview) => void;
  handleListCheckpoints: () => void;
  handleRestoreCheckpoint: (id: string) => void;
}

export function useChatFileEdits(params: UseChatFileEditsParams): UseChatFileEditsReturn {
  const { messages, setMessages, setError } = params;

  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);

  /** 현재 세션의 모든 FileEdit 목록 (ChangedFilesBar 에 표시) */
  const sessionFileEdits = useMemo(
    () => collectSessionFileEdits(messages),
    [messages]
  );

  /** VS Code 에디터에서 파일 열기 */
  const handleOpenFile = useCallback((filePath: string) => {
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({ type: 'file.open', path: filePath });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, []);

  /** 가장 오래된 체크포인트로 전체 롤백 */
  const handleUndoAllEdits = useCallback(() => {
    const withCp = sessionFileEdits.filter((f) => f.checkpointId);
    if (!withCp.length) {
      setError('No checkpoint to undo.');
      return;
    }
    // 세션 편집 배치 전체를 가장 이른 체크포인트로 되돌림
    const earliest = withCp[0].checkpointId!;
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({ type: 'checkpoint.restore', id: earliest });
      setMessages((prev) =>
        prev.map((m) => (m.fileEdits?.length ? { ...m, fileEdits: [] } : m))
      );
    } catch {
      setError('Undo All request failed.');
    }
  }, [sessionFileEdits, setMessages, setError]);

  /** 첫 번째 변경 파일 에디터에서 열기 */
  const handleReviewEdits = useCallback(() => {
    if (!sessionFileEdits.length) return;
    const first = sessionFileEdits[0];
    handleOpenFile(first.absPath || first.path);
  }, [sessionFileEdits, handleOpenFile]);

  /** Inline Edit 수락 — 메시지 내 파일 상태를 'accepted'로 패치 */
  const handleAcceptFileEdit = useCallback((file: FileEditPreview) => {
    if (!isInlineEditPreview(file)) return;
    setMessages((prev) => patchMessagesFileEditReview(prev, file.id, 'accepted'));
  }, [setMessages]);

  /** Inline Edit 거부 — 체크포인트 복원 후 'rejected'로 패치 */
  const handleRejectFileEdit = useCallback((file: FileEditPreview) => {
    if (!isInlineEditPreview(file)) return;
    if (file.checkpointId) {
      try {
        getVsCodeApi()?.postMessage?.(inlineEditRejectRestorePayload(file.checkpointId));
      } catch {
        setError('Inline Edit reject failed.');
      }
    }
    setMessages((prev) => patchMessagesFileEditReview(prev, file.id, 'rejected'));
  }, [setMessages, setError]);

  /** ADDON-T07: host에 checkpoint 목록 요청 */
  const handleListCheckpoints = useCallback(() => {
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({ type: 'checkpoint.list' });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, []);

  /** ADDON-T07: 특정 체크포인트로 복원 */
  const handleRestoreCheckpoint = useCallback((id: string) => {
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({ type: 'checkpoint.restore', id });
      setMessages((prev) =>
        prev.map((m) => (m.fileEdits?.length ? { ...m, fileEdits: [] } : m))
      );
    } catch {
      setError('Checkpoint restore request failed.');
    }
  }, [setMessages, setError]);

  return {
    checkpoints,
    setCheckpoints,
    sessionFileEdits,
    handleOpenFile,
    handleUndoAllEdits,
    handleReviewEdits,
    handleAcceptFileEdit,
    handleRejectFileEdit,
    handleListCheckpoints,
    handleRestoreCheckpoint
  };
}

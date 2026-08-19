/**
 * Inline Edit review (1-4f) — presentation + accept/reject over FileEditPreview.
 * Does not invent a new diff engine; host file.edit already carries FileEditCard lines.
 */
import type {
  ChatMessage,
  FileEditPreview,
  FileEditReviewStatus
} from './types';

export function isInlineEditPreview(
  file: Pick<FileEditPreview, 'source'>
): boolean {
  return file.source === 'inlineEdit';
}

export function inlineEditReviewStatus(
  file: Pick<FileEditPreview, 'reviewStatus' | 'source'>
): FileEditReviewStatus {
  if (!isInlineEditPreview(file)) return 'accepted';
  if (file.reviewStatus === 'accepted' || file.reviewStatus === 'rejected') {
    return file.reviewStatus;
  }
  return 'pending';
}

export function isPendingInlineEdit(
  file: Pick<FileEditPreview, 'source' | 'reviewStatus'>
): boolean {
  return isInlineEditPreview(file) && inlineEditReviewStatus(file) === 'pending';
}

/** Host file.edit payload → chat FileEditPreview (shared with useChatStream). */
export function fileEditPreviewFromHost(
  data: Record<string, unknown>
): FileEditPreview {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  const toolId = data.toolId != null ? String(data.toolId) : undefined;
  const source = data.source === 'inlineEdit' ? ('inlineEdit' as const) : undefined;
  return {
    id: toolId
      ? `fe_${toolId}`
      : `fe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    path: String(data.path || ''),
    absPath: data.absPath != null ? String(data.absPath) : undefined,
    checkpointId:
      data.checkpointId != null ? String(data.checkpointId) : undefined,
    turn: data.turn != null ? Number(data.turn) : undefined,
    toolId,
    additions: Number(data.additions) || 0,
    deletions: Number(data.deletions) || 0,
    source,
    reviewStatus: source === 'inlineEdit' ? 'pending' : undefined,
    lines: lines.map((l: any) => ({
      type:
        l?.type === 'add' || l?.type === 'delete'
          ? l.type
          : ('context' as const),
      lineNumber: Number(l?.lineNumber) || 0,
      text: String(l?.text ?? '')
    }))
  };
}

/** Tag a host file.edit extra when this send is an Inline Edit turn. */
export function withInlineEditSource<T extends Record<string, unknown>>(
  payload: T,
  inlineEdit: unknown
): T & { source?: 'inlineEdit' } {
  if (!inlineEdit) return payload;
  return { ...payload, source: 'inlineEdit' };
}

export function applyInlineEditReview(
  files: FileEditPreview[],
  id: string,
  status: FileEditReviewStatus
): FileEditPreview[] {
  return files.map((file) =>
    file.id === id ? { ...file, reviewStatus: status } : file
  );
}

export function patchMessagesFileEditReview(
  messages: ChatMessage[],
  id: string,
  status: FileEditReviewStatus
): ChatMessage[] {
  return messages.map((message) => {
    if (!message.fileEdits?.some((file) => file.id === id)) return message;
    return {
      ...message,
      fileEdits: applyInlineEditReview(message.fileEdits, id, status)
    };
  });
}

export function inlineEditRejectRestorePayload(checkpointId: string): {
  type: 'checkpoint.restore';
  id: string;
  reason: 'inline-edit-reject';
} {
  return {
    type: 'checkpoint.restore',
    id: checkpointId,
    reason: 'inline-edit-reject'
  };
}

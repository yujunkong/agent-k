/**
 * INT-005 — Inline Edit → Diff → Apply 통합 (chat-ui 경로)
 *
 * Chain: host `inline.edit.request` → parse → chat.send inlineEdit →
 * agent file.edit(source=inlineEdit) → FileEditPreview(pending) →
 * accept/reject review → checkpoint.restore payload.
 */
import { describe, it, expect } from 'vitest';
import {
  parseInlineEditHostMessage,
  toInlineEditAgentRequest,
  parseInlineEditAgentRequest,
  formatInlineEditSystemContext,
  formatInlineEditStickyContext,
  inlineEditFsPath,
} from './inlineEdit';
import {
  fileEditPreviewFromHost,
  applyInlineEditReview,
  patchMessagesFileEditReview,
  canRejectInlineEdit,
  inlineEditRejectRestorePayload,
  isPendingInlineEdit,
} from './inlineEditReview';
import type { ChatMessage } from './types';

const hostRequest = {
  type: 'inline.edit.request',
  requestId: 'inline_test1',
  instruction: 'rename variable to total',
  selection: {
    uri: 'file:///Users/dev/project/src/sum.ts',
    languageId: 'typescript',
    startLine: 4,
    startCharacter: 2,
    endLine: 6,
    endCharacter: 10,
    selectedText: 'const sum = a + b;',
  },
};

describe('INT-005 Inline Edit → Diff → Apply', () => {
  it('host inline.edit.request parses into agent request', () => {
    const parsed = parseInlineEditHostMessage(hostRequest);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.instruction).toBe('rename variable to total');
    expect(parsed.context.uri).toContain('sum.ts');

    const agentRequest = toInlineEditAgentRequest(parsed.instruction, parsed.context);
    // chat.send payload round-trip (host parse path)
    const reparsed = parseInlineEditAgentRequest(agentRequest);
    expect(reparsed).toEqual(agentRequest);
    expect(inlineEditFsPath(agentRequest.uri)).toBe('/Users/dev/project/src/sum.ts');
  });

  it('system/sticky context pins target path and range', () => {
    const parsed = parseInlineEditHostMessage(hostRequest);
    if (!parsed) throw new Error('parse failed');
    const agentRequest = toInlineEditAgentRequest(parsed.instruction, parsed.context);
    const system = formatInlineEditSystemContext(agentRequest);
    const sticky = formatInlineEditStickyContext(agentRequest);
    expect(system).toContain('edit_file');
    expect(system).toContain('startLine: 4');
    expect(sticky).toContain('const sum = a + b;');
    expect(sticky).toContain('rename variable to total');
  });

  it('agent file.edit(source=inlineEdit) becomes pending preview, then accepted', () => {
    const preview = fileEditPreviewFromHost({
      toolId: 'tool_1',
      path: 'src/sum.ts',
      absPath: '/Users/dev/project/src/sum.ts',
      checkpointId: 'cp_1',
      turn: 1,
      source: 'inlineEdit',
      additions: 1,
      deletions: 1,
      lines: [
        { type: 'delete', lineNumber: 5, text: 'const sum = a + b;' },
        { type: 'add', lineNumber: 5, text: 'const total = a + b;' },
      ],
    });
    expect(preview.source).toBe('inlineEdit');
    expect(isPendingInlineEdit(preview)).toBe(true);
    expect(canRejectInlineEdit(preview)).toBe(true);

    const accepted = applyInlineEditReview([preview], preview.id, 'accepted');
    expect(accepted[0].reviewStatus).toBe('accepted');
    expect(isPendingInlineEdit(accepted[0])).toBe(false);

    // terminal state is sticky — second transition is a no-op
    const again = applyInlineEditReview(accepted, preview.id, 'rejected');
    expect(again[0].reviewStatus).toBe('accepted');
  });

  it('reject restores checkpoint via deterministic payload', () => {
    const preview = fileEditPreviewFromHost({
      toolId: 'tool_2',
      path: 'src/sum.ts',
      checkpointId: 'cp_2',
      source: 'inlineEdit',
      lines: [],
    });
    const payload = inlineEditRejectRestorePayload(preview.checkpointId!);
    expect(payload).toEqual({
      type: 'checkpoint.restore',
      id: 'cp_2',
      reason: 'inline-edit-reject',
    });

    const rejected = applyInlineEditReview([preview], preview.id, 'rejected');
    expect(rejected[0].reviewStatus).toBe('rejected');
  });

  it('patchMessagesFileEditReview updates the owning message only', () => {
    const preview = fileEditPreviewFromHost({
      toolId: 'tool_3',
      path: 'src/sum.ts',
      source: 'inlineEdit',
      lines: [],
    });
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'done',
        status: 'complete',
        timestamp: 1,
        fileEdits: [preview],
      },
      { id: 'm2', role: 'assistant', content: 'other', status: 'complete', timestamp: 2 },
    ];
    const patched = patchMessagesFileEditReview(messages, preview.id, 'accepted');
    expect(patched[0].fileEdits?.[0].reviewStatus).toBe('accepted');
    expect(patched[1].fileEdits).toBeUndefined();
  });
});

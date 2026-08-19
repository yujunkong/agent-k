/**
 * Inline Edit 1-4f — FileEditPreview tagging + Accept/Reject over checkpoints.
 */
import * as assert from 'assert';
import { collectSessionFileEdits } from '../../../src/chat/chatAppHelpers';
import {
  applyInlineEditReview,
  fileEditPreviewFromHost,
  inlineEditRejectRestorePayload,
  inlineEditReviewStatus,
  isInlineEditPreview,
  isPendingInlineEdit,
  patchMessagesFileEditReview,
  withInlineEditSource
} from '../../../src/chat/inlineEditReview';
import type { ChatMessage, FileEditPreview } from '../../../src/chat/types';

function preview(partial: Partial<FileEditPreview> = {}): FileEditPreview {
  return {
    id: 'fe_1',
    path: 'src/foo.ts',
    absPath: '/workspace/src/foo.ts',
    additions: 2,
    deletions: 1,
    checkpointId: 'cp-1',
    lines: [
      { type: 'delete', lineNumber: 4, text: 'const x = 1;' },
      { type: 'add', lineNumber: 4, text: 'const x = await 1;' }
    ],
    ...partial
  };
}

suite('inlineEditReview', () => {
  test('withInlineEditSource tags host file.edit only for inline turns', () => {
    const base = { path: 'src/foo.ts', additions: 1 };
    assert.deepStrictEqual(withInlineEditSource(base, null), base);
    assert.strictEqual(
      withInlineEditSource(base, { uri: 'file:///src/foo.ts' }).source,
      'inlineEdit'
    );
  });

  test('file.edit from Inline Edit turn becomes a pending FileEditPreview', () => {
    const fe = fileEditPreviewFromHost({
      path: 'src/foo.ts',
      absPath: '/workspace/src/foo.ts',
      checkpointId: 'cp-9',
      toolId: 'tl_edit_1',
      additions: 2,
      deletions: 1,
      source: 'inlineEdit',
      lines: [
        { type: 'delete', lineNumber: 4, text: 'old' },
        { type: 'add', lineNumber: 4, text: 'new' }
      ]
    });
    assert.strictEqual(fe.id, 'fe_tl_edit_1');
    assert.strictEqual(fe.source, 'inlineEdit');
    assert.strictEqual(fe.reviewStatus, 'pending');
    assert.ok(isInlineEditPreview(fe));
    assert.ok(isPendingInlineEdit(fe));
    assert.strictEqual(fe.lines.length, 2);
    assert.strictEqual(fe.checkpointId, 'cp-9');
  });

  test('ordinary file.edit is not an Inline Edit review card', () => {
    const fe = fileEditPreviewFromHost({
      path: 'src/foo.ts',
      toolId: 'tl_edit_2',
      additions: 1,
      deletions: 0,
      lines: [{ type: 'add', lineNumber: 1, text: 'x' }]
    });
    assert.strictEqual(fe.source, undefined);
    assert.strictEqual(fe.reviewStatus, undefined);
    assert.ok(!isInlineEditPreview(fe));
    assert.ok(!isPendingInlineEdit(fe));
    assert.strictEqual(inlineEditReviewStatus(fe), 'accepted');
  });

  test('Accept/Reject patch FileEditPreview.reviewStatus without a new diff', () => {
    const files = [preview({ source: 'inlineEdit' })];
    const accepted = applyInlineEditReview(files, 'fe_1', 'accepted');
    assert.strictEqual(accepted[0].reviewStatus, 'accepted');
    assert.deepStrictEqual(accepted[0].lines, files[0].lines);
    const rejected = applyInlineEditReview(files, 'fe_1', 'rejected');
    assert.strictEqual(rejected[0].reviewStatus, 'rejected');
    assert.ok(!isPendingInlineEdit(rejected[0]));
  });

  test('Reject posts checkpoint.restore — existing undo path, not a fake revert', () => {
    const payload = inlineEditRejectRestorePayload('cp-1');
    assert.deepStrictEqual(payload, {
      type: 'checkpoint.restore',
      id: 'cp-1',
      reason: 'inline-edit-reject'
    });
  });

  test('patchMessagesFileEditReview updates only the matching preview', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'done',
        status: 'complete',
        timestamp: 1,
        fileEdits: [
          preview({ source: 'inlineEdit' }),
          preview({ id: 'fe_2', path: 'src/bar.ts', source: 'inlineEdit' })
        ]
      }
    ];
    const next = patchMessagesFileEditReview(messages, 'fe_1', 'accepted');
    assert.strictEqual(next[0].fileEdits![0].reviewStatus, 'accepted');
    assert.strictEqual(next[0].fileEdits![1].reviewStatus, undefined);
  });

  test('ChangedFilesBar hides rejected Inline Edits and keeps pending/accepted', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        status: 'complete',
        timestamp: 1,
        fileEdits: [
          preview({ source: 'inlineEdit', reviewStatus: 'pending' }),
          preview({
            id: 'fe_2',
            path: 'src/kept.ts',
            absPath: '/workspace/src/kept.ts',
            source: 'inlineEdit',
            reviewStatus: 'accepted'
          }),
          preview({
            id: 'fe_3',
            path: 'src/gone.ts',
            absPath: '/workspace/src/gone.ts',
            source: 'inlineEdit',
            reviewStatus: 'rejected'
          })
        ]
      }
    ];
    const files = collectSessionFileEdits(messages);
    assert.deepStrictEqual(
      files.map((f) => f.path).sort(),
      ['src/foo.ts', 'src/kept.ts']
    );
  });
});

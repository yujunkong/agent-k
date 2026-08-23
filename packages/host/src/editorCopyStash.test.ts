/**
 * CHAT-005 — copy-time stash matching (path travels with the copy, not active editor).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearEditorCopyStash,
  matchPasteToCopyStash,
  rememberEditorCopy,
} from './editorCopyStash';

describe('editorCopyStash', () => {
  beforeEach(() => clearEditorCopyStash());

  it('returns path from copy time even if paste happens later', () => {
    rememberEditorCopy({
      path: '/ws/IDE_PLAN.md',
      content: '## Phase 1\nCore',
      startLine: 38,
      endLine: 39,
    });
    const hit = matchPasteToCopyStash('## Phase 1\nCore');
    expect(hit?.path).toBe('/ws/IDE_PLAN.md');
    expect(hit?.label).toBe('IDE_PLAN.md');
    expect(hit?.startLine).toBe(38);
  });

  it('does not match different clipboard text', () => {
    rememberEditorCopy({
      path: '/ws/IDE_PLAN.md',
      content: 'alpha',
      startLine: 1,
      endLine: 1,
    });
    expect(matchPasteToCopyStash('beta')).toBeNull();
  });
});

/**
 * CONV-011 — smoke: DiffReviewPanel presentational wiring.
 * CONV-016 — smoke: ChangedFilesBar click/open behavior (checkpoint 연동 포함).
 * CONV-017 ChangeSummary skipped — ChangedFilesBar (016) owns session file list.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffReviewPanel } from '../components/DiffReviewPanel';
import { ChangedFilesBar } from '../components/ChangedFilesBar';
import type { FileEditPreview } from '../types';

function file(partial: Partial<FileEditPreview> & Pick<FileEditPreview, 'id' | 'path'>): FileEditPreview {
  return {
    additions: 1,
    deletions: 0,
    lines: [{ type: 'add', lineNumber: 1, text: 'x' }],
    ...partial
  };
}

describe('CONV UI cards (smoke)', () => {
  afterEach(() => cleanup());

  it('DiffReviewPanel renders review chrome and Done closes', () => {
    const onClose = vi.fn();
    render(
      <DiffReviewPanel
        files={[file({ id: 'f1', path: 'x.ts' })]}
        onClose={onClose}
      />
    );
    expect(screen.getByLabelText('Review changed files')).toBeTruthy();
    expect(screen.getByText('Review changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ChangedFilesBar expand/collapse toggles file list and open fires', () => {
    const onOpenFile = vi.fn();
    render(
      <ChangedFilesBar
        files={[file({ id: 'f1', path: 'src/x.ts', absPath: '/abs/src/x.ts' })]}
        onOpenFile={onOpenFile}
      />
    );
    // collapsed by default — expand
    fireEvent.click(screen.getByLabelText('Expand file list'));
    const fileBtn = screen.getByTitle('/abs/src/x.ts');
    fireEvent.click(fileBtn);
    expect(onOpenFile).toHaveBeenCalledWith('/abs/src/x.ts');
    // collapse again
    fireEvent.click(screen.getByLabelText('Collapse file list'));
    expect(screen.queryByTitle('/abs/src/x.ts')).toBeNull();
  });

  it('ChangedFilesBar Review opens DiffReviewPanel inline', () => {
    render(
      <ChangedFilesBar
        files={[file({ id: 'f1', path: 'x.ts' })]}
        onReview={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Review changes')).toBeTruthy();
  });

  it('ChangedFilesBar Checkpoints dropdown lists and restore fires', () => {
    const onListCheckpoints = vi.fn();
    const onRestoreCheckpoint = vi.fn();
    render(
      <ChangedFilesBar
        files={[file({ id: 'f1', path: 'x.ts' })]}
        onUndoAll={vi.fn()}
        checkpoints={[{ id: 'cp-1', label: 'Apply 1 file(s)', timestamp: 1 }]}
        onListCheckpoints={onListCheckpoints}
        onRestoreCheckpoint={onRestoreCheckpoint}
      />
    );
    fireEvent.click(screen.getByTitle('Recent checkpoints'));
    expect(onListCheckpoints).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestoreCheckpoint).toHaveBeenCalledWith('cp-1');
  });
});

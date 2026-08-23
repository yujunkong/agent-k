/**
 * CONV-011 — smoke: DiffReviewPanel presentational wiring.
 * CONV-017 ChangeSummary skipped — ChangedFilesBar (016) owns session file list.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffReviewPanel } from '../components/DiffReviewPanel';
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
});

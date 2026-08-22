/**
 * CONV-011 / 017 — smoke: DiffReviewPanel + ChangeSummary presentational wiring.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeSummary } from '../components/ChangeSummary';
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

  it('ChangeSummary lists files and opens path', () => {
    const onOpenFile = vi.fn();
    render(
      <ChangeSummary
        files={[{ path: 'src/a.ts', additions: 1, deletions: 0 }]}
        onOpenFile={onOpenFile}
      />
    );
    expect(screen.getByLabelText('Changed files')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /src\/a\.ts/i }));
    expect(onOpenFile).toHaveBeenCalledWith('src/a.ts');
  });

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

/**
 * V31-UI-11 — card header semantics (FileEditCard / TerminalRunCard).
 * File name opens the file. Terminal header is the command.
 * Expand is the chevron only. Controlled FileEdit toggle stays inert.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileEditCard } from './FileEditCard';
import { TerminalRunCard } from './TerminalRunCard';

const FILE_LINES = [
  { type: 'context' as const, lineNumber: 1, text: 'const a = 1;' },
  { type: 'add' as const, lineNumber: 2, text: 'const b = 2;' },
  { type: 'delete' as const, lineNumber: 3, text: 'const c = 3;' },
];

const RUN = {
  id: 'run-1',
  command: 'npm test',
  description: 'Run tests',
  status: 'done' as const,
  stdout: 'line1\nline2\nline3\nline4\nline5\nline6',
  stderr: '',
  exitCode: 0,
  durationMs: 1200,
};

describe('V31-UI-11 FileEditCard header', () => {
  afterEach(() => cleanup());

  it('uncontrolled: toggle expands, filename opens the file', () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <FileEditCard
        path="src/a.ts"
        additions={2}
        deletions={1}
        lines={FILE_LINES}
        onOpenFile={onOpenFile}
      />
    );
    const toggle = screen.getByTitle('Expand');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.ak-file-edit-card--expanded')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'a.ts' }));
    expect(onOpenFile).toHaveBeenCalledWith('src/a.ts');
  });

  it('controlled: toggle is inert', () => {
    const { container } = render(
      <FileEditCard
        path="src/a.ts"
        additions={2}
        deletions={1}
        lines={FILE_LINES}
        expanded={false}
      />
    );
    const toggle = screen.getByTitle('Expand');
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.ak-file-edit-card--expanded')).toBeNull();
  });
});

describe('V31-UI-11 TerminalRunCard header', () => {
  afterEach(() => cleanup());

  it('header click does not expand; chevron does', () => {
    const { container } = render(<TerminalRunCard {...RUN} />);
    const header = container.querySelector(
      '.ak-terminal-card__header'
    ) as HTMLElement;
    expect(header.tagName).toBe('DIV');
    fireEvent.click(header);
    expect(container.querySelector('.ak-terminal-card--expanded')).toBeNull();
    fireEvent.click(screen.getByTitle('Expand'));
    expect(container.querySelector('.ak-terminal-card--expanded')).toBeTruthy();
  });

  it('controlled: header click is inert', () => {
    const { container } = render(<TerminalRunCard {...RUN} open={false} />);
    const header = container.querySelector(
      '.ak-terminal-card__header'
    ) as HTMLElement;
    expect(header.tagName).toBe('DIV');
    fireEvent.click(header);
    expect(container.querySelector('.ak-terminal-card--expanded')).toBeNull();
  });
});

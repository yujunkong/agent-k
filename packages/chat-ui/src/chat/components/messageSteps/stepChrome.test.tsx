/**
 * V31-UI-05 — shared chrome used by MessageSteps and ExploreChrome.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChevronRow, ThoughtBody } from './stepChrome';

afterEach(() => cleanup());

describe('V31-UI-05 stepChrome', () => {
  it('explore chevron toggles and does not paint steps error color', () => {
    const onToggle = vi.fn();
    render(
      <ChevronRow title="Explored 2 files" expanded={false} live={false} onToggle={onToggle}>
        <ThoughtBody text="hello" live={false} />
      </ChevronRow>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Explored 2 files' }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(document.querySelector('.ak-step-chevron')?.getAttribute('style')).toBeNull();
  });

  it('steps tone colors a failed header', () => {
    render(
      <ChevronRow
        tone="steps"
        title="Exploring"
        expanded={false}
        live={false}
        hasError
        onToggle={() => {}}
      />,
    );
    expect(document.querySelector('.ak-step-chevron')?.getAttribute('style')).toContain('226, 85, 111');
  });

  it('live row with no body does not toggle', () => {
    const onToggle = vi.fn();
    render(<ChevronRow title="Exploring" expanded={false} live onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exploring' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(document.querySelector('.ak-step-chevron-btn--locked')).not.toBeNull();
  });
});

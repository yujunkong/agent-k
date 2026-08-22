/**
 * CHAT-004 — Mode selector UI tests (Auto / Agent / Plan / Debug / Ask).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModeSelector } from './ModeSelector';

const LABELS = {
  auto: 'Auto',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug',
  ask: 'Ask',
};
const TOOLTIPS = { ...LABELS };

describe('CHAT-004 ModeSelector', () => {
  afterEach(() => cleanup());

  it('lists Auto + four modes and reports selection', () => {
    const onChange = vi.fn();
    render(
      <ModeSelector
        value="agent"
        onChange={onChange}
        labels={LABELS}
        tooltips={TOOLTIPS}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Mode: Agent/i }));
    expect(screen.getByRole('option', { name: /Auto/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Plan/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Debug/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Ask/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Plan/i }));
    expect(onChange).toHaveBeenCalledWith('plan');
  });
});

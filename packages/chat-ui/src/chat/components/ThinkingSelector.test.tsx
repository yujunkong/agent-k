/**
 * V31-UI-07 — ThinkingSelector tests (custom dropdown replacing native <select>).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThinkingSelector } from './ThinkingSelector';

const OPTIONS = [
  { value: 'off', label: 'Off', title: 'Thinking off' },
  { value: 'medium', label: 'Med', title: 'Thinking medium' },
  { value: 'high', label: 'High', title: 'Thinking high' },
];

describe('V31-UI-07 ThinkingSelector', () => {
  afterEach(() => cleanup());

  it('renders the current label', () => {
    render(
      <ThinkingSelector value="medium" options={OPTIONS} onChange={() => {}} />
    );
    const trigger = screen.getByRole('button', { name: 'Thinking effort' });
    expect(trigger.textContent).toContain('Med');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the menu and reports selection', () => {
    const onChange = vi.fn();
    render(
      <ThinkingSelector value="medium" options={OPTIONS} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thinking effort' }));
    expect(screen.getByRole('listbox', { name: 'Thinking effort' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /High/i }));
    expect(onChange).toHaveBeenCalledWith('high');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape', () => {
    render(
      <ThinkingSelector value="medium" options={OPTIONS} onChange={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thinking effort' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', () => {
    render(
      <ThinkingSelector
        value="medium"
        options={OPTIONS}
        onChange={() => {}}
        disabled
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thinking effort' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

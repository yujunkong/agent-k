/**
 * CHAT-003 — Searchable Model Picker UI tests.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelSelector } from './ModelSelector';
import type { ModelTag } from '../../providers/modelTags';

const OPTIONS = [
  { id: 'qwen2.5-7b', label: 'qwen2.5-7b', providerName: 'Local', tags: ['local', 'fast'] as ModelTag[] },
  { id: 'gpt-4o', label: 'gpt-4o', providerName: 'Cloud', tags: ['cloud'] as ModelTag[] },
  { id: 'claude-sonnet', label: 'claude-sonnet', providerName: 'Cloud', tags: ['cloud'] as ModelTag[] },
];

describe('CHAT-003 ModelSelector', () => {
  afterEach(() => cleanup());

  it('opens searchable list and filters by query', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector value="gpt-4o" options={OPTIONS} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Model:/i }));
    const search = screen.getByLabelText('Search models');
    fireEvent.change(search, { target: { value: 'qwen' } });
    expect(screen.getByRole('option', { name: /qwen2.5-7b/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /gpt-4o/i })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /qwen2.5-7b/i }));
    expect(onChange).toHaveBeenCalledWith('qwen2.5-7b');
  });

  it('filters by tag chip', () => {
    const onChange = vi.fn();
    render(
      <ModelSelector value="gpt-4o" options={OPTIONS} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Model:/i }));
    const tagBar = screen.getByRole('tablist', { name: 'Filter by tag' });
    const localChip = Array.from(tagBar.querySelectorAll('button')).find(
      (b) => b.textContent === 'Local'
    );
    expect(localChip).toBeTruthy();
    fireEvent.click(localChip!);
    expect(screen.getByRole('option', { name: /qwen2.5-7b/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /claude-sonnet/i })).toBeNull();
  });

  it('shows No matches when filter empty', () => {
    render(
      <ModelSelector value="gpt-4o" options={OPTIONS} onChange={() => undefined} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Model:/i }));
    fireEvent.change(screen.getByLabelText('Search models'), {
      target: { value: 'zzz-nope' },
    });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('pins the current model at the top with a current marker', () => {
    render(
      <ModelSelector value="claude-sonnet" options={OPTIONS} onChange={() => undefined} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Model:/i }));
    const options = screen.getAllByRole('option');
    expect(options[0].textContent).toMatch(/claude-sonnet/i);
    expect(options[0].textContent).toMatch(/current/i);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });
});

/**
 * V31-UI-01 — EmptyState render + action wiring.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState';

afterEach(() => cleanup());

describe('V31-UI-01 EmptyState', () => {
  it('renders welcome + three start actions and fires onAction', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        providerReady
        onAction={onAction}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.getByText('Agent-K')).toBeTruthy();
    const explain = screen.getByRole('button', {
      name: 'Explain this codebase',
    });
    expect(screen.getByRole('button', { name: 'Find and fix a bug' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Write tests' })).toBeTruthy();
    expect(screen.queryByText(/No provider configured/)).toBeNull();
    fireEvent.click(explain);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(String(onAction.mock.calls[0][0])).toMatch(/under 15 bullets/i);
  });

  it('shows provider hint when not ready', () => {
    const onOpen = vi.fn();
    render(
      <EmptyState
        providerReady={false}
        onAction={() => {}}
        onOpenSettings={onOpen}
      />,
    );
    expect(screen.getByText(/No provider configured/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpen).toHaveBeenCalled();
  });
});

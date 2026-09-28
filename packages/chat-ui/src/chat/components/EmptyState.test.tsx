/**
 * V31-UI-01 (UX-01) — EmptyState unit tests (jsdom).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('V31-UI-01 EmptyState', () => {
  afterEach(() => cleanup());

  it('renders three start actions and sends the matching prompt', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        providerReady
        onAction={onAction}
        onOpenSettings={() => undefined}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Explain this codebase' }));
    expect(onAction).toHaveBeenCalledWith(
      'Explain this codebase: what are the main packages and how do they fit together?'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find and fix a bug' }));
    expect(onAction).toHaveBeenCalledWith(
      'Find a bug in this workspace, explain the root cause, and fix it.'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Write tests' }));
    expect(onAction).toHaveBeenCalledWith(
      'Write tests for the most important untested module in this workspace.'
    );

    expect(onAction).toHaveBeenCalledTimes(3);
  });

  it('shows the provider hint and opens settings when providerReady=false', () => {
    const onOpenSettings = vi.fn();
    render(
      <EmptyState
        providerReady={false}
        onAction={() => undefined}
        onOpenSettings={onOpenSettings}
      />
    );

    expect(screen.getByText(/No provider configured/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('hides the provider hint when providerReady=true', () => {
    render(
      <EmptyState
        providerReady
        onAction={() => undefined}
        onOpenSettings={() => undefined}
      />
    );

    expect(screen.queryByText(/No provider configured/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
  });

  it('exposes a labelled Get started region', () => {
    render(
      <EmptyState
        providerReady
        onAction={() => undefined}
        onOpenSettings={() => undefined}
      />
    );

    expect(screen.getByRole('region', { name: 'Get started' })).toBeTruthy();
  });
});

/**
 * CHAT-008 — Chat history panel (select / delete / empty).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from './HistoryPanel';
import type { ChatSessionMeta } from '../ChatSessionStore';

function meta(partial: Partial<ChatSessionMeta> & Pick<ChatSessionMeta, 'id' | 'title'>): ChatSessionMeta {
  return {
    mode: 'agent',
    messageCount: 2,
    createdAt: 1,
    updatedAt: Date.now(),
    ...partial
  };
}

describe('CHAT-008 HistoryPanel', () => {
  afterEach(() => cleanup());

  it('shows empty copy when there are no sessions', () => {
    render(
      <HistoryPanel
        sessions={[]}
        currentId={null}
        onSelect={() => undefined}
        onDelete={() => undefined}
        onNew={() => undefined}
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('No saved chats yet.')).toBeTruthy();
  });

  it('lists sessions and wires select / delete / new / close', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onNew = vi.fn();
    const onClose = vi.fn();
    const sessions = [
      meta({ id: 'sess-a', title: 'First chat', mode: 'plan', messageCount: 3 }),
      meta({ id: 'sess-b', title: 'Second chat', mode: 'ask' })
    ];

    render(
      <HistoryPanel
        sessions={sessions}
        currentId="sess-a"
        onSelect={onSelect}
        onDelete={onDelete}
        onNew={onNew}
        onClose={onClose}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Chat history' })).toBeTruthy();
    expect(screen.getByText('First chat')).toBeTruthy();
    expect(screen.getByText('Second chat')).toBeTruthy();
    expect(screen.getByText('Plan')).toBeTruthy();

    const active = document.querySelector('.history-panel__item--active');
    expect(active?.textContent).toContain('First chat');

    fireEvent.click(screen.getByTitle('Second chat'));
    expect(onSelect).toHaveBeenCalledWith('sess-b');

    fireEvent.click(screen.getByLabelText('Delete Second chat'));
    expect(onDelete).toHaveBeenCalledWith('sess-b');

    fireEvent.click(screen.getByLabelText('New chat'));
    expect(onNew).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

/**
 * CHAT-001 — conversation / empty-state surface (v2.1 thread inset styling).
 */

import type { JSX } from 'react';

export type ChatBubble = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export type MessageListProps = {
  messages: ChatBubble[];
  connected: boolean;
};

export function MessageList(props: MessageListProps): JSX.Element {
  const { messages, connected } = props;

  if (messages.length === 0) {
    return (
      <div className="ak-empty" data-testid="chat-empty">
        <p className="ak-empty__title">Agent K</p>
        <p className="ak-empty__hint">
          {connected
            ? 'Plan, search, build anything'
            : 'Host 연결을 기다리는 중…'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="ak-messages"
      data-testid="chat-messages"
      role="log"
      aria-live="polite"
    >
      {messages.map((m) => (
        <article
          key={m.id}
          className="ak-bubble"
          data-role={m.role}
          data-testid={`chat-bubble-${m.role}`}
        >
          <header className="ak-bubble__role">{m.role}</header>
          <div className="ak-bubble__text">{m.text}</div>
        </article>
      ))}
    </div>
  );
}

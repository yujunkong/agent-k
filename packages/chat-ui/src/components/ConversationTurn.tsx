/**
 * UI-002 — Conversation turn wrapper (v2.1 ConversationTurn chrome).
 */
import type { JSX, ReactNode } from 'react';
import { MessageBubble } from './MessageBubble';

export type ConversationTurnProps = {
  role: 'user' | 'assistant' | 'system';
  children: ReactNode;
  variant?: string;
};

export function ConversationTurn(props: ConversationTurnProps): JSX.Element {
  const { role, children, variant } = props;
  return (
    <div
      className={`conversation-turn conversation-turn--${role}${variant ? ` conversation-turn--${variant}` : ''}`}
      data-testid="ui-conversation-turn"
    >
      <MessageBubble role={role}>{children}</MessageBubble>
    </div>
  );
}

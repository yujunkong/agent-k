import React from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from '../components/MessageBubble';

type Props = {
  message: ChatMessage;
  onFork?: (messageId: string) => void;
  onCopy?: (messageId: string) => void;
  onContinue?: (messageId: string) => void;
  onStop?: (messageId: string) => void;
};

/**
 * UI migration boundary for the v2.1 conversation redesign.
 *
 * Phase 2 deliberately delegates rendering to the battle-tested MessageBubble
 * so streaming, tool events, edits and existing actions remain unchanged.
 * Later phases can replace the internals without changing ChatApp's message
 * contract.
 */
export function ConversationTurn(props: Props) {
  return <MessageBubble {...props} />;
}

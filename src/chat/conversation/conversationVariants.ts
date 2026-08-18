import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '../types';

export interface ConversationVariantMeta {
  groupId: string;
  index: number;
  count: number;
}

type Listener = () => void;

const activeByGroup = new Map<string, number>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getVariantMeta(message: ChatMessage): ConversationVariantMeta | null {
  const metadata = message.metadata as (ChatMessage['metadata'] & {
    conversationVariantGroupId?: string;
    conversationVariantIndex?: number;
    conversationVariantCount?: number;
  }) | undefined;
  if (!metadata?.conversationVariantGroupId) return null;
  const index = Number(metadata.conversationVariantIndex);
  const count = Number(metadata.conversationVariantCount);
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1) return null;
  return { groupId: metadata.conversationVariantGroupId, index, count };
}

export function setActiveVariant(groupId: string, index: number) {
  const current = activeByGroup.get(groupId);
  if (current === index) return;
  activeByGroup.set(groupId, index);
  emit();
}

export function getActiveVariant(groupId: string): number {
  return activeByGroup.get(groupId) ?? 0;
}

export function useActiveVariant(groupId: string): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getActiveVariant(groupId),
    () => 0
  );
}

export function annotateVariantSiblings(
  messages: ChatMessage[],
  userIndex: number,
  groupId: string,
  activeIndex?: number
): ChatMessage[] {
  const assistantIndexes: number[] = [];
  for (let i = userIndex + 1; i < messages.length; i += 1) {
    if (messages[i].role === 'user') break;
    if (messages[i].role === 'assistant') assistantIndexes.push(i);
  }
  const count = assistantIndexes.length;
  if (count === 0) return messages;

  const next = [...messages];
  assistantIndexes.forEach((messageIndex, index) => {
    const message = next[messageIndex];
    next[messageIndex] = {
      ...message,
      metadata: {
        ...message.metadata,
        conversationVariantGroupId: groupId,
        conversationVariantIndex: index,
        conversationVariantCount: count
      }
    };
  });
  setActiveVariant(groupId, activeIndex ?? count - 1);
  return next;
}

/** Return only the active sibling from each conversation variant group. */
export function selectActiveConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => {
    const meta = getVariantMeta(message);
    return !meta || getActiveVariant(meta.groupId) === meta.index;
  });
}

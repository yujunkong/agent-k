/**
 * AGENT-006 / CTX-004 — CompactionEngine.
 * AGENT-007 — Preserve tool_call / tool_call_id pairs during compaction.
 */

import type { AgentMessage } from '../types';
import {
  createContextBudget,
  estimateMessagesTokens,
  type ContextBudget,
} from './budget';

export type CompactLevel = 'truncate' | 'drop' | 'micro_summary' | 'full';

export interface CompactionResult {
  level: CompactLevel;
  originalTokens: number;
  compactedTokens: number;
  messages: AgentMessage[];
  droppedCount: number;
}

const MAX_TOOL_RESULT_CHARS = 32_000;
const PROTECTION_TURNS = 6;

/**
 * Multi-level context compaction with tool-call pair integrity (AGENT-007).
 */
export class CompactionEngine {
  private readonly budget: ContextBudget;
  private readonly protectionTurns: number;

  constructor(maxTokens = 128_000, protectionTurns = PROTECTION_TURNS) {
    this.budget = createContextBudget(maxTokens);
    this.protectionTurns = protectionTurns;
  }

  get contextBudget(): ContextBudget {
    return this.budget;
  }

  /** Compact messages; auto-selects level from usage ratio unless overridden. */
  compact(messages: AgentMessage[], targetLevel?: CompactLevel): CompactionResult {
    const originalTokens = estimateMessagesTokens(messages);
    const level = targetLevel ?? this.determineLevel(originalTokens);
    const marked = this.markProtected(messages);

    let next: AgentMessage[];
    let droppedCount = 0;

    switch (level) {
      case 'truncate': {
        const r = this.levelTruncate(marked);
        next = r.messages;
        droppedCount = r.droppedCount;
        break;
      }
      case 'drop': {
        const r = this.levelDrop(marked);
        next = r.messages;
        droppedCount = r.droppedCount;
        break;
      }
      case 'micro_summary': {
        const r = this.levelMicroSummary(marked);
        next = r.messages;
        droppedCount = r.droppedCount;
        break;
      }
      case 'full':
      default: {
        const r = this.levelFull(marked);
        next = r.messages;
        droppedCount = r.droppedCount;
        break;
      }
    }

    // AGENT-007 / REL-008: never leave orphan tool results or unpaired toolCalls.
    next = repairToolCallPairs(next);

    return {
      level,
      originalTokens,
      compactedTokens: estimateMessagesTokens(next),
      messages: next,
      droppedCount,
    };
  }

  private determineLevel(tokens: number): CompactLevel {
    const ratio = tokens / this.budget.maxTokens;
    if (ratio < 0.6) return 'truncate';
    if (ratio < 0.8) return 'drop';
    if (ratio < 0.95) return 'micro_summary';
    return 'full';
  }

  private markProtected(messages: AgentMessage[]): AgentMessage[] {
    const turns = messages
      .map((m) => m.metadata?.turn ?? 0)
      .filter((t) => t > 0);
    const maxTurn = turns.length ? Math.max(...turns) : 0;
    const recentStart = Math.max(1, maxTurn - this.protectionTurns + 1);

    return messages.map((msg) => {
      const turn = msg.metadata?.turn ?? 0;
      const protected_ =
        msg.role === 'system' ||
        msg.role === 'user' ||
        (turn > 0 && turn >= recentStart) ||
        msg.metadata?.protected === true;
      return {
        ...msg,
        metadata: { ...msg.metadata, protected: protected_ },
      };
    });
  }

  private levelTruncate(messages: AgentMessage[]): {
    messages: AgentMessage[];
    droppedCount: number;
  } {
    let droppedCount = 0;
    const next = messages.map((msg) => {
      if (msg.metadata?.protected) return msg;
      if (msg.role === 'tool' && msg.content.length > MAX_TOOL_RESULT_CHARS) {
        droppedCount++;
        return {
          ...msg,
          content: msg.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n...(truncated)',
        };
      }
      return msg;
    });
    return { messages: next, droppedCount };
  }

  private levelDrop(messages: AgentMessage[]): {
    messages: AgentMessage[];
    droppedCount: number;
  } {
    const seenReads = new Set<string>();
    let droppedCount = 0;
    const next = messages.filter((msg) => {
      if (msg.metadata?.protected) return true;
      if (
        msg.role === 'tool' &&
        (msg.name === 'read_file' || msg.metadata?.toolName === 'read_file')
      ) {
        const key = msg.content.slice(0, 120);
        if (seenReads.has(key)) {
          droppedCount++;
          return false;
        }
        seenReads.add(key);
      }
      return true;
    });
    return { messages: next, droppedCount };
  }

  private levelMicroSummary(messages: AgentMessage[]): {
    messages: AgentMessage[];
    droppedCount: number;
  } {
    const dropPass = this.levelDrop(messages);
    const unprotected = dropPass.messages.filter((m) => !m.metadata?.protected);
    const protectedMsgs = dropPass.messages.filter((m) => m.metadata?.protected);

    if (unprotected.length === 0) return dropPass;

    const summary: AgentMessage = {
      role: 'user',
      content: `[compacted ${unprotected.length} older messages — prior tool/read results summarized]`,
      metadata: { type: 'micro_summary', protected: true },
    };

    const head = protectedMsgs.filter(
      (m) => m.role === 'system' || (m.role === 'user' && !m.metadata?.type)
    );
    const recentProtected = protectedMsgs.filter((m) => !head.includes(m));

    return {
      messages: [...head.slice(0, 2), summary, ...recentProtected],
      droppedCount: dropPass.droppedCount + unprotected.length,
    };
  }

  private levelFull(messages: AgentMessage[]): {
    messages: AgentMessage[];
    droppedCount: number;
  } {
    const system = messages.filter((m) => m.role === 'system');
    const users = messages.filter((m) => m.role === 'user' && !m.metadata?.type);
    const recent = messages.filter((m) => m.metadata?.protected && m.role !== 'system');
    const summary: AgentMessage = {
      role: 'user',
      content:
        '[full compaction] Earlier conversation compressed. Continue from the recent turns below.',
      metadata: { type: 'full_summary', protected: true },
    };
    const kept = [...system.slice(0, 1), users[0], summary, ...recent.slice(-12)].filter(
      Boolean
    ) as AgentMessage[];
    return {
      messages: kept,
      droppedCount: Math.max(0, messages.length - kept.length),
    };
  }
}

/**
 * AGENT-007 / REL-008 — Drop orphan tool results and strip unpaired toolCalls.
 */
export function repairToolCallPairs(messages: AgentMessage[]): AgentMessage[] {
  const toolResultIds = new Set(
    messages.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => m.toolCallId!)
  );
  const assistantCallIds = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls) {
      for (const tc of m.toolCalls) assistantCallIds.add(tc.id);
    }
  }

  const out: AgentMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      if (!m.toolCallId || !assistantCallIds.has(m.toolCallId)) continue;
      out.push(m);
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const kept = m.toolCalls.filter((tc) => toolResultIds.has(tc.id));
      if (kept.length === 0) {
        out.push({ ...m, toolCalls: undefined });
      } else if (kept.length !== m.toolCalls.length) {
        out.push({ ...m, toolCalls: kept });
      } else {
        out.push(m);
      }
      continue;
    }
    out.push(m);
  }
  return out;
}

/** REL-008 — Validate that all tool_call pairs are intact. */
export function validateToolCallPairIntegrity(messages: AgentMessage[]): {
  ok: boolean;
  orphanToolResults: string[];
  missingResults: string[];
} {
  const resultIds = new Set(
    messages.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => m.toolCallId!)
  );
  const callIds = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls) {
      for (const tc of m.toolCalls) callIds.add(tc.id);
    }
  }
  const orphanToolResults = [...resultIds].filter((id) => !callIds.has(id));
  const missingResults = [...callIds].filter((id) => !resultIds.has(id));
  return {
    ok: orphanToolResults.length === 0 && missingResults.length === 0,
    orphanToolResults,
    missingResults,
  };
}

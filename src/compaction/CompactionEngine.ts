/**
 * ContextCompactionEngine - 4단계 컨텍스트 컴팩션 (C4-T09)
 * 
 * Truncate → Drop → Micro-summary → Full compact
 * 보호 구간: 시스템/룰/최근 K턴(6)/현재 목표 문장 보존
 */

export type CompactLevel = 'truncate' | 'drop' | 'micro_summary' | 'full';

export interface CompactionResult {
  level: CompactLevel;
  originalTokens: number;
  compactedTokens: number;
  protectedSections: string[];
  droppedSections: string[];
  /** 컴팩션 적용 후 메시지 배열 (HARB-T26) */
  messages: ContextMessage[];
}

export interface ContextMessage {
  role: string;
  content: string;
  metadata?: {
    type?: string;
    turn?: number;
    toolName?: string;
    protected?: boolean;
  };
}

export class ContextCompactionEngine {
  private readonly protectionTurns = 6;
  private readonly maxToolResultLength = 32000; // 32KB truncation
  private readonly maxContextTokens: number;

  constructor(maxContextTokens = 128000) {
    this.maxContextTokens = Math.max(4096, maxContextTokens);
  }

  /** Current context window used for level thresholds */
  get contextWindow(): number {
    return this.maxContextTokens;
  }

  compact(
    messages: ContextMessage[],
    targetLevel?: CompactLevel
  ): CompactionResult {
    const level = targetLevel || this.determineLevel(messages);
    const originalTokens = this.estimateTokens(messages);

    // Step 1: Protect critical sections (mutable copy)
    const protectedMessages = this.markProtected(
      messages.map(m => ({ ...m, metadata: { ...m.metadata } }))
    );

    let compactedMessages = protectedMessages;
    let protectedSections: string[] = [];
    let droppedSections: string[] = [];

    switch (level) {
      case 'truncate': {
        const r = this.levelTruncate(protectedMessages);
        compactedMessages = r.messages;
        protectedSections = r.protectedSections;
        droppedSections = r.droppedSections;
        break;
      }
      case 'drop': {
        const r = this.levelDrop(protectedMessages);
        compactedMessages = r.messages;
        protectedSections = r.protectedSections;
        droppedSections = r.droppedSections;
        break;
      }
      case 'micro_summary': {
        const r = this.levelMicroSummary(protectedMessages);
        compactedMessages = r.messages;
        protectedSections = r.protectedSections;
        droppedSections = r.droppedSections;
        break;
      }
      case 'full': {
        const r = this.levelFull(protectedMessages);
        compactedMessages = r.messages;
        protectedSections = r.protectedSections;
        droppedSections = r.droppedSections;
        break;
      }
    }

    const compactedTokens = this.estimateTokens(compactedMessages);

    return {
      level,
      originalTokens,
      compactedTokens,
      protectedSections,
      droppedSections,
      messages: compactedMessages
    };
  }

  private determineLevel(messages: ContextMessage[]): CompactLevel {
    const totalTokens = this.estimateTokens(messages);
    const ratio = totalTokens / this.maxContextTokens;

    if (ratio < 0.6) return 'truncate';
    if (ratio < 0.8) return 'drop';
    if (ratio < 0.95) return 'micro_summary';
    return 'full';
  }

  private markProtected(messages: ContextMessage[]): ContextMessage[] {
    const recentTurns = new Set<number>();
    const totalTurns = Math.max(...messages.map(m => m.metadata?.turn || 0));

    for (let t = Math.max(1, totalTurns - this.protectionTurns + 1); t <= totalTurns; t++) {
      recentTurns.add(t);
    }

    return messages.map(msg => ({
      ...msg,
      metadata: {
        ...msg.metadata,
        protected: msg.role === 'system' ||
                   msg.role === 'user' ||
                   (msg.metadata?.turn !== undefined && recentTurns.has(msg.metadata.turn)) ||
                   msg.metadata?.protected === true
      }
    }));
  }

  private levelTruncate(messages: ContextMessage[]): {
    messages: ContextMessage[];
    protectedSections: string[];
    droppedSections: string[];
  } {
    const protectedSections: string[] = [];
    const droppedSections: string[] = [];

    const processed = messages.map(msg => {
      if (msg.metadata?.protected) {
        protectedSections.push(msg.role);
        return msg;
      }

      if (msg.metadata?.type === 'tool_result' && msg.content.length > this.maxToolResultLength) {
        droppedSections.push(`${msg.metadata?.toolName || 'tool'}: truncated ${msg.content.length}→${this.maxToolResultLength}`);
        return {
          ...msg,
          content: msg.content.slice(0, this.maxToolResultLength) + '\n...(truncated)'
        };
      }

      return msg;
    });

    return { messages: processed, protectedSections, droppedSections };
  }

  private levelDrop(messages: ContextMessage[]): {
    messages: ContextMessage[];
    protectedSections: string[];
    droppedSections: string[];
  } {
    const protectedSections: string[] = [];
    const droppedSections: string[] = [];

    const seenReads = new Set<string>();

    const processed = messages.filter(msg => {
      if (msg.metadata?.protected) {
        protectedSections.push(msg.role);
        return true;
      }

      // Drop duplicate reads
      if (msg.metadata?.type === 'tool_result' && msg.metadata?.toolName === 'read_file') {
        const contentKey = msg.content.slice(0, 100);
        if (seenReads.has(contentKey)) {
          droppedSections.push('Duplicate read_file content');
          return false;
        }
        seenReads.add(contentKey);
      }

      return true;
    });

    return { messages: processed, protectedSections, droppedSections };
  }

  private levelMicroSummary(messages: ContextMessage[]): {
    messages: ContextMessage[];
    protectedSections: string[];
    droppedSections: string[];
  } {
    const protectedSections: string[] = [];
    const droppedSections: string[] = [];

    const processed = messages.map(msg => {
      if (msg.metadata?.protected) {
        protectedSections.push(msg.role);
        return msg;
      }

      // Replace long tool results with bullet summaries
      if (msg.metadata?.type === 'tool_result' && msg.content.length > 1000) {
        const lines = msg.content.split('\n');
        const summary = lines.slice(0, 5).map(l => `• ${l.slice(0, 100)}`).join('\n');
        droppedSections.push(`${msg.metadata?.toolName || 'tool'}: micro-summarized ${lines.length}→${5} lines`);
        return {
          ...msg,
          content: summary + `\n...(micro-summary, original ${msg.content.length} chars)`
        };
      }

      return msg;
    });

    return { messages: processed, protectedSections, droppedSections };
  }

  private levelFull(messages: ContextMessage[]): {
    messages: ContextMessage[];
    protectedSections: string[];
    droppedSections: string[];
  } {
    const protectedSections: string[] = [];
    const droppedSections: string[] = [];
    const kept: ContextMessage[] = [];
    const summaryParts: string[] = [];

    for (const msg of messages) {
      if (msg.metadata?.protected) {
        protectedSections.push(msg.role);
        kept.push(msg);
      } else {
        if (msg.metadata?.type === 'tool_result') {
          summaryParts.push(`[${msg.metadata?.toolName}]: ${msg.content.slice(0, 200)}`);
        } else if (msg.role === 'assistant') {
          summaryParts.push(`[assistant]: ${msg.content.slice(0, 200)}`);
        }
        droppedSections.push(`${msg.role}: ${msg.metadata?.type || msg.role}`);
      }
    }

    if (summaryParts.length > 0) {
      kept.push({
        role: 'system',
        content: `[compaction summary]\n${summaryParts.join('\n')}`,
        metadata: { protected: true, type: 'compaction_summary' }
      });
    }

    return { messages: kept, protectedSections, droppedSections };
  }

  estimateTokens(messages: ContextMessage[]): number {
    // Rough estimate: 4 chars per token
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length + msg.role.length + 10;
    }
    return Math.ceil(totalChars / 4);
  }
}

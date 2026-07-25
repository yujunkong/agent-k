/**
 * ContextAssembler - 컨텍스트 예산 기반 조립 (C1-T12 / C3-T09)
 * 
 * 시스템/룰/도구/스티키/대화/도구결과 슬롯
 * 예산: 시스템5% / 룰5% / 도구8% / 스티키12% / 대화60% / 여유10%
 * 보호 구간 유지, 128k 토큰 제한
 */
import type { Mode } from './types';
import { modeRegistry } from './modeRegistry';
import { MemoryStore } from '../memories/MemoryStore';

export interface ContextSlot {
  name: string;
  budgetPercent: number;
  content: string;
  priority: number;
  protected_: boolean;
}

export interface ContextAssembly {
  slots: ContextSlot[];
  totalTokens: number;
  usedTokens: number;
  truncated: boolean;
}

export class ContextAssembler {
  private readonly maxTokens = 128000;
  private memoryStore: MemoryStore;

  constructor(memoryStore?: MemoryStore) {
    this.memoryStore = memoryStore || new MemoryStore();
  }

  assemble(
    mode: Mode,
    messages: Array<{ role: string; content: string }>,
    options?: {
      customSystemPrompt?: string;
      toolSchemas?: any[];
      additionalRules?: string[];
      stickyContext?: string;
      recentTurns?: number;
    }
  ): ContextAssembly {
    const modeConfig = modeRegistry.getModeConfig(mode);
    const systemPrompt = options?.customSystemPrompt || modeConfig.systemPrompt;

    const slots: ContextSlot[] = [
      {
        name: 'system',
        budgetPercent: 5,
        content: systemPrompt,
        priority: 100,
        protected_: true
      },
      {
        name: 'rules',
        budgetPercent: 5,
        content: (options?.additionalRules || []).join('\n'),
        priority: 90,
        protected_: true
      },
      {
        name: 'tools',
        budgetPercent: 8,
        content: options?.toolSchemas
          ? JSON.stringify(options.toolSchemas.slice(0, 30))
          : '',
        priority: 80,
        protected_: true
      },
      {
        name: 'memories',
        budgetPercent: 2,
        content: this.memoryStore.getContextBlock(Math.floor(this.maxTokens * 0.02)),
        priority: 70,
        protected_: false
      },
      {
        name: 'sticky',
        budgetPercent: 12,
        content: options?.stickyContext || '',
        priority: 60,
        protected_: true
      },
      {
        name: 'conversation',
        budgetPercent: 60,
        content: this.buildConversation(messages, options?.recentTurns || 20),
        priority: 50,
        protected_: false
      },
      {
        name: 'tool_results',
        budgetPercent: 8,
        content: this.extractToolResults(messages),
        priority: 40,
        protected_: false
      }
    ];

    // Apply budget limits
    const totalBudget = this.maxTokens;
    const truncated = this.applyBudget(slots, totalBudget);

    const usedTokens = slots.reduce((sum, s) => sum + this.estimateTokens(s.content), 0);

    return { slots, totalTokens: totalBudget, usedTokens, truncated };
  }

  private applyBudget(slots: ContextSlot[], totalBudget: number): boolean {
    let truncated = false;
    let totalUsed = 0;

    // First pass: reserve protected slots
    const protectedTokens = slots
      .filter(s => s.protected_)
      .reduce((sum, s) => sum + Math.min(this.estimateTokens(s.content), Math.floor(totalBudget * s.budgetPercent / 100)), 0);

    totalUsed = protectedTokens;

    // Second pass: allocate remaining budget to non-protected slots
    const remainingBudget = totalBudget - protectedTokens;
    const nonProtectedTotalBudget = slots
      .filter(s => !s.protected_)
      .reduce((sum, s) => sum + s.budgetPercent, 0);

    for (const slot of slots) {
      if (!slot.protected_) {
        const slotBudget = Math.floor(remainingBudget * slot.budgetPercent / (nonProtectedTotalBudget || 1));
        const estimated = this.estimateTokens(slot.content);
        if (estimated > slotBudget) {
          slot.content = this.truncateToTokens(slot.content, slotBudget);
          truncated = true;
        }
        totalUsed += Math.min(estimated, slotBudget);
      }
    }

    // If still over budget, truncate lowest priority non-protected
    if (totalUsed > totalBudget) {
      const sorted = [...slots]
        .filter(s => !s.protected_)
        .sort((a, b) => a.priority - b.priority);

      for (const slot of sorted) {
        const estimated = this.estimateTokens(slot.content);
        const excess = totalUsed - totalBudget;
        if (excess > 0 && estimated > 100) {
          const reduction = Math.min(estimated - 100, excess + 100);
          slot.content = this.truncateToTokens(slot.content, estimated - reduction);
          totalUsed -= reduction;
          truncated = true;
        }
      }
    }

    return truncated;
  }

  private buildConversation(messages: Array<{ role: string; content: string }>, maxTurns: number): string {
    // Keep system prompt separate, only user/assistant/tool messages
    const relevant = messages.filter(m => m.role !== 'system');
    
    // Keep recent N messages
    const recent = relevant.slice(-maxTurns * 2);
    
    return recent.map(m => {
      const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : 'tool';
      return `<${role}>${m.content}</${role}>`;
    }).join('\n');
  }

  private extractToolResults(messages: Array<{ role: string; content: string }>): string {
    return messages
      .filter(m => m.role === 'tool')
      .slice(-10) // Keep last 10 tool results
      .map(m => {
        const truncated = m.content.length > 3000 ? m.content.slice(0, 3000) + '\n...(truncated)' : m.content;
        return `<tool_result>${truncated}</tool_result>`;
      })
      .join('\n');
  }

  estimateTokens(content: string): number {
    return Math.ceil((content?.length || 0) / 4);
  }

  private truncateToTokens(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars) + `\n...(truncated, original ${content.length} chars)`;
  }
}

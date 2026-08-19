/**
 * ContextAssembler - 컨텍스트 예산 기반 조립 (C1-T12 / C3-T09 / HARB)
 * 
 * 시스템/룰/도구/스티키/대화/도구결과 슬롯
 * 예산: 시스템5% / 룰5% / 도구8% / 스티키12% / 대화60% / 여유10%
 * 보호 구간 유지, 128k 토큰 제한
 * 
 * HARB: VerificationFirst + Slogans + CursorPattern 프롬프트 주입
 */
import type { Mode } from './types';
import { modeRegistry } from './modeRegistry';
import { MemoryStore } from '../memories/MemoryStore';
import { getSkillRegistry } from '../skills/SkillRegistry';
import { RuntimeServices } from '../core/RuntimeServices';
import { configManager } from '../core/ConfigManager';
import { injectVerificationFirst } from '../harness/VerificationFirstPrompt';
import { injectDesignSlogans } from '../harness/DesignSlogans';
import { injectCursorPattern } from '../harness/CursorPattern';
import { injectTurnStructure } from '../harness/PromptTurnStructure';
import { injectDontDoMedium } from '../harness/DontDoMedium';
import { getProjectRulesCached, formatProjectRulesBlock } from '../harness/ProjectRulesLoader';
import type { InlineEditAgentRequest } from '../chat/inlineEdit';
import {
  formatInlineEditStickyContext,
  formatInlineEditSystemContext
} from '../chat/inlineEdit';

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
    // RW-C7-09: activate 주입 스토어 우선, 없으면 no-op SecretStorage 폴백
    const runtimeStore = RuntimeServices.getMemoryStore();
    this.memoryStore = memoryStore || runtimeStore || new MemoryStore(
      { get: async () => undefined, store: async () => {}, delete: async () => {} } as any,
      { subscriptions: [], workspaces: [], secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} } } as any
    );
  }

  /** 턴 조립 시 RuntimeServices에 스토어가 나중에 주입된 경우 반영 */
  private resolveMemoryStore(): MemoryStore {
    return RuntimeServices.getMemoryStore() || this.memoryStore;
  }

  /**
   * ADDON-T08: explicit projectRules wins; else lazily read vscode's workspace root
   * (try/catch — unavailable in unit tests / webview) and load rules files from fs.
   * Never throws.
   */
  private resolveProjectRules(explicit?: string): string {
    if (explicit) return explicit;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vscode = require('vscode');
      const root = vscode?.workspace?.workspaceFolders?.[0]?.uri?.fsPath;
      if (!root) return '';
      return getProjectRulesCached(root);
    } catch {
      return '';
    }
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
      tier?: 'A' | 'B' | 'C'; // HARB: 티어 정보
      /** ADDON-T08: pre-loaded rules content (skips fs/vscode lookup when set) */
      projectRules?: string;
      /** 1-4e: scoped editor selection — rules in system, source in sticky */
      inlineEdit?: InlineEditAgentRequest;
    }
  ): ContextAssembly {
    const modeConfig = modeRegistry.getModeConfig(mode);
    let systemPrompt = options?.customSystemPrompt || modeConfig.systemPrompt;

    // RW-C7-07: 핀 스킬을 시스템 프롬프트 근처에 주입 (Tier A 캡은 registry 내부)
    try {
      const registry = getSkillRegistry();
      const tierA = configManager.get('agent-k.harness.tierA') === true;
      const injected = registry.injectPinnedSkills(systemPrompt, tierA);
      systemPrompt = injected.prompt;
      if (injected.warnings.length > 0 && options?.additionalRules) {
        options.additionalRules.push(...injected.warnings);
      } else if (injected.warnings.length > 0) {
        options = { ...options, additionalRules: [...(options?.additionalRules || []), ...injected.warnings] };
      }
    } catch {
      /* skills dir unavailable in test host */
    }

    // ─── HARB: Tier A 하네스 프롬프트 주입 ─────────────────
    const isTierA = options?.tier === 'A' || (!options?.tier);
    if (isTierA) {
      // Write-oriented harness only for modes that expose edit/terminal tools.
      // Ask/Plan must not be told to call write_file — that causes denied-tool noise.
      if (mode === 'agent' || mode === 'debug') {
        systemPrompt = injectVerificationFirst(systemPrompt);
        systemPrompt = injectCursorPattern(systemPrompt);
        systemPrompt = injectTurnStructure(systemPrompt);
      } else if (mode === 'ask' || mode === 'plan') {
        systemPrompt = `${systemPrompt}\n\n## Read-only tool policy (mandatory)
You do NOT have write_file, edit_file, delete_file, or run_terminal_cmd.
Never attempt those tools. If the user wants files changed, explain the change in Markdown (or ask them to switch to Agent mode).
Use only read/search tools (and ask_question / todo_write when appropriate).`;
      }
      systemPrompt = injectDesignSlogans(systemPrompt);
      systemPrompt = injectDontDoMedium(systemPrompt);
    }

    const inlineEditRules = options?.inlineEdit
      ? formatInlineEditSystemContext(options.inlineEdit)
      : '';
    const inlineEditSticky = options?.inlineEdit
      ? formatInlineEditStickyContext(options.inlineEdit)
      : '';
    if (inlineEditRules) {
      systemPrompt = `${systemPrompt}\n\n${inlineEditRules}`;
    }

    const memoryStore = this.resolveMemoryStore();

    // ADDON-T08: auto-load AGENTS.md / .cursorrules / .agentrules / .clinerules
    // and `.agentk/rules/*` into the rules slot. Never throws — falls back to
    // no-op when vscode/fs are unavailable.
    const projectRulesBlock = formatProjectRulesBlock(this.resolveProjectRules(options?.projectRules));

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
        content: [(options?.additionalRules || []).join('\n'), projectRulesBlock]
          .filter(Boolean)
          .join('\n\n'),
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
        content: memoryStore.injectMemoriesIntoPrompt('', Math.floor(this.maxTokens * 0.02)).trim() || '(no memories)',
        priority: 70,
        protected_: false
      },
      {
        name: 'sticky',
        budgetPercent: 12,
        content: [options?.stickyContext || '', inlineEditSticky]
          .filter(Boolean)
          .join('\n\n'),
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

/**
 * AGENT-005 / CTX-003 — ContextAssembler.
 * Assembles system + sticky + history messages under a token budget.
 */

import type { AgentMode } from '@agent-k/shared';
import type { AgentMessage } from '../types';
import {
  createContextBudget,
  estimateMessagesTokens,
  estimateTokens,
  isOverBudget,
  type ContextBudget,
} from './budget';
import { CompactionEngine } from './CompactionEngine';
import type { CompactLevel } from './CompactionEngine';
import type { WorkspaceContext } from './WorkspaceContext';
import {
  formatProjectRulesBlock,
  resolveProjectRulesContent,
} from '../harness/ProjectRulesLoader';

export interface AssembleInput {
  mode: AgentMode;
  systemPrompt: string;
  messages: AgentMessage[];
  /** Extra sticky context (memories, workspace extras). */
  stickyContext?: string;
  /**
   * HARNESS-005 — workspace root for project rules (AGENTS.md / .agentk/rules).
   * Re-loaded each assemble into the protected system slot (compact-outside SoT).
   */
  workspaceRoot?: string;
  /** Explicit rules text — skips fs when set. */
  projectRules?: string;
  /**
   * PLAN-009 — approved plan sticky block (ExecutionPlan formatter output).
   * Re-injected each assemble into the protected system slot (compact-outside SoT).
   */
  approvedPlanBlock?: string;
  workspace?: WorkspaceContext;
  budget?: ContextBudget;
  /** When true, run CompactionEngine if over soft threshold. */
  compactIfNeeded?: boolean;
}

export interface AssembleResult {
  messages: AgentMessage[];
  usedTokens: number;
  budget: ContextBudget;
  compacted: boolean;
  /** Set when compacted — UI can show Summarizing chat context... */
  compactionLevel?: CompactLevel;
  truncated: boolean;
}

/**
 * Build the provider-facing message list for one model turn.
 */
export class ContextAssembler {
  constructor(private readonly maxTokens = 128_000) {}

  assemble(input: AssembleInput): AssembleResult {
    const budget = input.budget ?? createContextBudget(this.maxTokens);
    const parts: AgentMessage[] = [];

    let system = input.systemPrompt.trim();
    const workspaceBlock = input.workspace?.toPromptBlock() ?? '';
    // Comment: HARNESS-005 — PROJECT RULES outside compaction (re-inject every turn)
    const projectRulesBlock = formatProjectRulesBlock(
      resolveProjectRulesContent({
        workspaceRoot: input.workspaceRoot,
        projectRules: input.projectRules,
      })
    );
    // Comment: PLAN-009 — approved plan before project rules (task scope → workspace rules)
    const approvedPlanBlock = input.approvedPlanBlock?.trim() ?? '';
    const sticky = [
      input.stickyContext?.trim(),
      approvedPlanBlock,
      projectRulesBlock,
      workspaceBlock,
    ]
      .filter(Boolean)
      .join('\n\n');

    if (sticky) {
      system = `${system}\n\n${sticky}`;
    }

    // Soft-trim oversized system to ~15% of budget.
    const systemCap = Math.floor(budget.maxTokens * 0.15) * 4;
    let truncated = false;
    if (system.length > systemCap) {
      system = system.slice(0, systemCap) + '\n...(system truncated)';
      truncated = true;
    }

    parts.push({ role: 'system', content: system, metadata: { protected: true } });

    // Drop any prior system roles from history — we own the system slot.
    for (const m of input.messages) {
      if (m.role === 'system') continue;
      parts.push(m);
    }

    let usedTokens = estimateMessagesTokens(parts);
    let compacted = false;
    let compactionLevel: AssembleResult['compactionLevel'];
    let messages = parts;

    if (input.compactIfNeeded !== false && isOverBudget(usedTokens, budget)) {
      const engine = new CompactionEngine(budget.maxTokens);
      const result = engine.compact(messages);
      messages = result.messages;
      usedTokens = result.compactedTokens;
      compacted = true;
      compactionLevel = result.level;
    }

    return {
      messages,
      usedTokens,
      budget,
      compacted,
      compactionLevel,
      truncated
    };
  }

  estimate(messages: AgentMessage[]): number {
    return estimateMessagesTokens(messages);
  }

  estimateText(text: string): number {
    return estimateTokens(text);
  }
}

/**
 * HOST-011 — Subagent host helpers (pure) + create stub until SUB / AGENT land.
 */

import type { AgentMode } from '@agent-k/shared';

/** Child loops share the parent AgentLoop; cap turns so they cannot auto-continue forever. */
export const SUBAGENT_MAX_TURNS = 8;

export type SubagentRole = 'general' | 'research' | 'debug' | 'review' | 'coding';

export function promptFromTaskArgs(args: Record<string, unknown>): string {
  const prompt = String(args.prompt ?? args.task ?? '').trim();
  const description = String(args.description ?? '').trim();
  const subtasks = Array.isArray(args.subtasks)
    ? args.subtasks.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const body = prompt || description;
  if (!body) return '';
  if (!subtasks.length) return body;
  return `${body}\n\nSubtasks:\n- ${subtasks.join('\n- ')}`;
}

export function roleFromTaskArgs(args: Record<string, unknown>): SubagentRole {
  const raw = String(
    args.subagent_type ?? args.role ?? args.type ?? args.mode ?? 'general',
  )
    .trim()
    .toLowerCase();
  if (raw === 'search' || raw === 'ask' || raw === 'explore' || raw === 'research') {
    return 'research';
  }
  if (raw === 'debug') return 'debug';
  if (raw === 'review') return 'review';
  if (raw === 'coding' || raw === 'shell' || raw === 'edit') return 'coding';
  return 'general';
}

export function modeForSubagentRole(role: SubagentRole): AgentMode {
  if (role === 'research') return 'ask';
  if (role === 'debug') return 'debug';
  return 'agent';
}

/** Stub factory — real SubagentHost needs AgentLoop + Worktree (SUB-*). */
export function createSubagentHost(): never {
  throw new Error('createSubagentHost pending (SUB-* / AGENT-* / WT-*)');
}

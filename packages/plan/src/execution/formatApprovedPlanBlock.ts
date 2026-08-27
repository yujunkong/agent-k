/**
 * PLAN-009 — Approved plan sticky block for AgentLoop inject.
 * Structured ExecutionPlan is SoT; markdown render is view-only elsewhere.
 */
import { formatTaskFileTargets } from '../session/workspaceContext';
import type { ExecutionPlan, ExecutionPlanTask } from './types';

export interface FormatApprovedPlanBlockOptions {
  /** Highlight the task currently being executed. */
  currentTaskId?: string;
}

const PLAN_BLOCK_HEADER = [
  '## APPROVED PLAN (do not deviate)',
  '',
  'You are executing an approved plan. Follow tasks in dependency order.',
  'Do not skip ahead or invent new scope unless the user explicitly redirects.',
  'Run listed verification steps for each task when applicable.',
].join('\n');

function formatTaskHeader(task: ExecutionPlanTask, current: boolean): string {
  const marker = current ? '→ ' : '  ';
  return `${marker}**${task.id}** [${task.status}/${task.execution}]: ${task.title}`;
}

/**
 * Build compaction-outside sticky text for an approved ExecutionPlan.
 * Host passes the result to ContextAssembler / AgentLoop each turn.
 */
export function formatApprovedPlanBlock(
  plan: ExecutionPlan,
  opts?: FormatApprovedPlanBlockOptions,
): string {
  if (!plan.tasks.length) return '';

  const lines = [PLAN_BLOCK_HEADER, '', `**Goal:** ${plan.goal}`];
  if (plan.repoRoot) {
    lines.push(`**Workspace:** ${plan.repoRoot}`);
  }
  lines.push('', '### Tasks', '');

  for (const task of plan.tasks) {
    const current = opts?.currentTaskId === task.id;
    lines.push(formatTaskHeader(task, current));
    lines.push(`  ${task.description}`);
    if (task.files.length > 0) {
      lines.push(`  - files: ${formatTaskFileTargets(task.files)}`);
    }
    if (task.verification.length > 0) {
      lines.push(`  - verify: ${task.verification.join('; ')}`);
    }
    if (task.dependencies.length > 0) {
      lines.push(`  - depends: ${task.dependencies.join(', ')}`);
    }
    lines.push('');
  }

  if (opts?.currentTaskId) {
    const current = plan.tasks.find((t) => t.id === opts.currentTaskId);
    if (current) {
      lines.push(
        '### Current focus',
        '',
        `Execute **${current.id}**: ${current.title} only.`,
        '',
      );
    }
  }

  return lines.join('\n').trim();
}

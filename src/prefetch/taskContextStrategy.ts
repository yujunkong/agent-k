/**
 * ADDON-T04: Task-type context strategies (pure — unit-test friendly)
 */
import type { Mode } from '../agent/types';

export type TaskType =
  | 'bug_fix'
  | 'refactor'
  | 'new_feature'
  | 'code_review'
  | 'general';

export type ContextItemKey =
  | 'failing_test'
  | 'error_message'
  | 'diagnostics'
  | 'related_files'
  | 'recent_changes'
  | 'git_diff'
  | 'target_files'
  | 'test_files'
  | 'symbols'
  | 'usage_examples'
  | 'type_definitions'
  | 'spec'
  | 'similar_features'
  | 'changed_files'
  | 'diff'
  | 'conventions'
  | 'active_file'
  | 'open_tabs';

export interface ContextStrategy {
  taskType: TaskType;
  required: ContextItemKey[];
  optional: ContextItemKey[];
  maxTokens: number;
}

export const CONTEXT_STRATEGIES: Record<TaskType, ContextStrategy> = {
  bug_fix: {
    taskType: 'bug_fix',
    required: ['failing_test', 'error_message', 'diagnostics', 'related_files', 'recent_changes'],
    optional: ['git_diff', 'symbols', 'test_files'],
    maxTokens: 40000,
  },
  refactor: {
    taskType: 'refactor',
    required: ['target_files', 'test_files', 'symbols', 'type_definitions'],
    optional: ['usage_examples', 'git_diff', 'conventions'],
    maxTokens: 50000,
  },
  new_feature: {
    taskType: 'new_feature',
    required: ['spec', 'similar_features', 'related_files', 'active_file'],
    optional: ['test_files', 'conventions', 'open_tabs'],
    maxTokens: 60000,
  },
  code_review: {
    taskType: 'code_review',
    required: ['changed_files', 'diff', 'test_files', 'conventions'],
    optional: ['diagnostics', 'symbols'],
    maxTokens: 30000,
  },
  general: {
    taskType: 'general',
    required: ['active_file', 'diagnostics'],
    optional: ['git_diff', 'open_tabs', 'symbols'],
    maxTokens: 25000,
  },
};

export interface RankedContextItem {
  key: ContextItemKey;
  content: string;
  tokens: number;
  required: boolean;
}

/**
 * Infer task type from user text + mode hints.
 */
export function inferTaskType(userMessage: string, mode?: Mode): TaskType {
  const msg = (userMessage || '').toLowerCase();

  if (mode === 'debug') return 'bug_fix';
  if (mode === 'plan' && /\b(review|리뷰)\b/i.test(userMessage)) return 'code_review';

  if (
    /\b(bug|fix|error|fail|crash|regression|스택|에러|버그|고쳐|수정해)\b/i.test(msg) ||
    /TypeError|ReferenceError|FAIL\s|assert/i.test(userMessage)
  ) {
    return 'bug_fix';
  }
  if (/\b(refactor|rename|extract|정리|리팩터|리팩토링)\b/i.test(msg)) {
    return 'refactor';
  }
  if (/\b(review|pr\b|코드 리뷰|리뷰해)\b/i.test(msg)) {
    return 'code_review';
  }
  if (/\b(add|implement|feature|new|만들어|추가|구현|기능)\b/i.test(msg)) {
    return 'new_feature';
  }
  return 'general';
}

/**
 * Pick required first, then optional until maxTokens.
 * Drops optional when over budget (required may still exceed — caller truncates content).
 */
export function selectContextItems(
  taskType: TaskType,
  available: Partial<Record<ContextItemKey, string>>,
  estimateTokens: (text: string) => number = (t) => Math.ceil(t.length / 4)
): RankedContextItem[] {
  const strategy = CONTEXT_STRATEGIES[taskType];
  const selected: RankedContextItem[] = [];
  let used = 0;

  for (const key of strategy.required) {
    const content = available[key];
    if (!content) continue;
    const tokens = estimateTokens(content);
    selected.push({ key, content, tokens, required: true });
    used += tokens;
  }

  for (const key of strategy.optional) {
    const content = available[key];
    if (!content) continue;
    const tokens = estimateTokens(content);
    if (used + tokens > strategy.maxTokens) {
      continue; // drop optional
    }
    selected.push({ key, content, tokens, required: false });
    used += tokens;
  }

  return selected;
}

export function formatSelectedContext(items: RankedContextItem[], taskType: TaskType): string {
  if (items.length === 0) return '';
  const lines = [
    `<task_context type="${taskType}">`,
    'IDE/task context assembled by strategy (required first, optional by budget):',
    '',
  ];
  for (const item of items) {
    lines.push(`### [${item.required ? 'required' : 'optional'}] ${item.key}`);
    lines.push(item.content.slice(0, 12000));
    lines.push('');
  }
  lines.push('</task_context>');
  return lines.join('\n');
}

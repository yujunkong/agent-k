/**
 * Thinking / reasoning effort for models that support it (Qwen thinking, o-series, etc.)
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

export const THINKING_EFFORT_OPTIONS: Array<{
  value: ThinkingEffort;
  label: string;
  title: string;
}> = [
  { value: 'off', label: 'Off', title: 'Thinking 끔 — 빠른 응답' },
  { value: 'low', label: 'Low', title: 'Thinking 낮음 — 일상 코딩' },
  { value: 'medium', label: 'Med', title: 'Thinking 중간 — 기본' },
  { value: 'high', label: 'High', title: 'Thinking 높음 — 어려운 설계/디버그' },
];

export function parseThinkingEffort(v: unknown): ThinkingEffort {
  if (v === 'off' || v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}

/** Map effort → provider request fields (OpenAI-compatible / Qwen / exo) */
export function thinkingEffortToProviderOpts(effort: ThinkingEffort): {
  enableThinking: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
  thinkingBudget?: number;
} {
  if (effort === 'off') {
    return { enableThinking: false, thinkingBudget: 0 };
  }
  const budget = effort === 'low' ? 1024 : effort === 'high' ? 16384 : 4096;
  return {
    enableThinking: true,
    reasoningEffort: effort,
    thinkingBudget: budget,
  };
}

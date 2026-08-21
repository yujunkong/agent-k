/**
 * MODEL-008 — Thinking / reasoning capability + effort mapping.
 * Effort levels are not API-discovered; inferred from model family id.
 */
import type { ThinkingEffort } from '@agent-k/shared';

export type { ThinkingEffort };

export type ThinkingFamily = 'none' | 'openai' | 'deepseek' | 'qwen' | 'generic';

export interface ThinkingCapability {
  /** False → hide Composer Thinking control */
  supported: boolean;
  /** Levels shown in the picker for this model */
  efforts: ThinkingEffort[];
  family: ThinkingFamily;
}

export const THINKING_EFFORT_OPTIONS: Array<{
  value: ThinkingEffort;
  label: string;
  title: string;
}> = [
  { value: 'off', label: 'Off', title: 'Thinking off — faster replies' },
  { value: 'low', label: 'Low', title: 'Thinking low — everyday coding' },
  { value: 'medium', label: 'Med', title: 'Thinking medium — default' },
  { value: 'high', label: 'High', title: 'Thinking high — hard design/debug' },
  {
    value: 'max',
    label: 'Max',
    title: 'Thinking max — recommended for complex agent work',
  },
];

const DEEPSEEK_EFFORTS: ThinkingEffort[] = ['off', 'high', 'max'];
const OPENAI_EFFORTS: ThinkingEffort[] = ['off', 'low', 'medium', 'high'];
const QWEN_EFFORTS: ThinkingEffort[] = ['off', 'low', 'medium', 'high'];

export function parseThinkingEffort(v: unknown): ThinkingEffort {
  if (v === 'off' || v === 'low' || v === 'medium' || v === 'high' || v === 'max') {
    return v;
  }
  return 'medium';
}

/**
 * Per-model thinking support + allowed effort levels.
 * DeepSeek V4: off / high / max (low·medium → high server-side).
 */
export function resolveThinkingCapability(modelId: string): ThinkingCapability {
  const id = String(modelId || '').toLowerCase();
  if (!id) {
    return { supported: false, efforts: [], family: 'none' };
  }
  const base = id.split('/').pop() || id;

  if (id.includes('deepseek') || base.startsWith('deepseek')) {
    return {
      supported: true,
      efforts: [...DEEPSEEK_EFFORTS],
      family: 'deepseek',
    };
  }

  if (
    /^o[1-9]/.test(base) ||
    /(^|[^a-z])o[1-9](-|$)/.test(base) ||
    /o3-mini|o4-mini/.test(base) ||
    /gpt-5/.test(base)
  ) {
    return {
      supported: true,
      efforts: [...OPENAI_EFFORTS],
      family: 'openai',
    };
  }

  if (
    /qwq/.test(id) ||
    /qwen.*think|think.*qwen/.test(id) ||
    /qwen3/.test(id) ||
    /qwen2\.5/.test(id)
  ) {
    return {
      supported: true,
      efforts: [...QWEN_EFFORTS],
      family: 'qwen',
    };
  }

  return { supported: false, efforts: [], family: 'none' };
}

/** Snap stored effort onto levels the current model accepts. */
export function clampThinkingEffort(
  effort: ThinkingEffort,
  cap: ThinkingCapability,
): ThinkingEffort {
  if (!cap.supported || cap.efforts.length === 0) {
    return 'off';
  }
  if (cap.efforts.includes(effort)) {
    return effort;
  }
  if (cap.family === 'deepseek') {
    if (effort === 'off') return 'off';
    if (effort === 'max') return 'max';
    // low / medium → high (DeepSeek server mapping)
    return 'high';
  }
  if (cap.efforts.includes('medium')) return 'medium';
  if (cap.efforts.includes('high')) return 'high';
  return cap.efforts.find((e) => e !== 'off') || cap.efforts[0];
}

export function thinkingOptionsForModel(modelId: string) {
  const cap = resolveThinkingCapability(modelId);
  return THINKING_EFFORT_OPTIONS.filter((o) => cap.efforts.includes(o.value));
}

/** Map effort → OpenAI-compatible / Qwen / DeepSeek request fields. */
export function thinkingEffortToProviderOpts(effort: ThinkingEffort): {
  enableThinking: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  thinkingBudget?: number;
} {
  if (effort === 'off') {
    return { enableThinking: false, thinkingBudget: 0 };
  }
  const budget =
    effort === 'low' ? 1024 : effort === 'high' ? 16384 : effort === 'max' ? 32768 : 4096;
  return {
    enableThinking: true,
    reasoningEffort: effort,
    thinkingBudget: budget,
  };
}

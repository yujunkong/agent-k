/**
 * Thinking / reasoning effort for models that support it
 * (Qwen thinking, OpenAI o-series, DeepSeek V4, …).
 *
 * Effort *levels* are not discovered via API (no standard field).
 * We detect *support + allowed levels* from the model id / family.
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

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
  { value: 'off', label: 'Off', title: 'Thinking 끔 — 빠른 응답' },
  { value: 'low', label: 'Low', title: 'Thinking 낮음 — 일상 코딩' },
  { value: 'medium', label: 'Med', title: 'Thinking 중간 — 기본' },
  { value: 'high', label: 'High', title: 'Thinking 높음 — 어려운 설계/디버그' },
  {
    value: 'max',
    label: 'Max',
    title: 'Thinking 최대 — DeepSeek 권장(복잡한 에이전트 작업)',
  },
];

const DEEPSEEK_EFFORTS: ThinkingEffort[] = ['off', 'high', 'max'];
const OPENAI_EFFORTS: ThinkingEffort[] = ['off', 'low', 'medium', 'high'];
const QWEN_EFFORTS: ThinkingEffort[] = ['off', 'low', 'medium', 'high'];

export function parseThinkingEffort(v: unknown): ThinkingEffort {
  if (
    v === 'off' ||
    v === 'low' ||
    v === 'medium' ||
    v === 'high' ||
    v === 'max'
  ) {
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

  // DeepSeek — V4 uses high|max; R1/reasoner also expose thinking
  if (id.includes('deepseek') || base.startsWith('deepseek')) {
    return {
      supported: true,
      efforts: [...DEEPSEEK_EFFORTS],
      family: 'deepseek',
    };
  }

  // OpenAI reasoning / GPT-5 family
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

  // Qwen thinking / QwQ / Qwen3.x (local MLX etc.)
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

/** Snap stored effort onto levels the current model accepts */
export function clampThinkingEffort(
  effort: ThinkingEffort,
  cap: ThinkingCapability
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

/** Map effort → provider request fields (OpenAI-compatible / Qwen / DeepSeek) */
export function thinkingEffortToProviderOpts(effort: ThinkingEffort): {
  enableThinking: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  thinkingBudget?: number;
} {
  if (effort === 'off') {
    return { enableThinking: false, thinkingBudget: 0 };
  }
  const budget =
    effort === 'low'
      ? 1024
      : effort === 'high'
        ? 16384
        : effort === 'max'
          ? 32768
          : 4096; // medium
  return {
    enableThinking: true,
    reasoningEffort: effort,
    thinkingBudget: budget,
  };
}

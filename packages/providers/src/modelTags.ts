/**
 * Composer 드롭다운용 모델 태그.
 * 휴리스틱이며 사용자가 수동으로 덮어쓰지 않는 한 읽기 전용.
 */
export type ModelTag = 'local' | 'fast' | 'cheap' | 'reasoning' | 'vision';

export const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  local: 'Local',
  fast: 'Fast',
  cheap: 'Cheap',
  reasoning: 'Reasoning',
  vision: 'Vision'
};

const FAST_RE = /\b(mini|flash|haiku|small|nano|lite|8b|7b|3b|1\.5b|1b)\b/i;
const REASONING_RE = /\b(o1|o3|o4|r1|reason|think|qwq|deepseek-r|opus)\b/i;
const VISION_RE = /\b(vision|gpt-4o|4o|omni|sonnet|opus|qwen.*vl|llava|gemini|claude-3)\b/i;

export function inferModelTags(opts: {
  modelId: string;
  isLocalProvider?: boolean;
}): ModelTag[] {
  const id = String(opts.modelId || '');
  const tags: ModelTag[] = [];
  if (opts.isLocalProvider) tags.push('local');
  if (FAST_RE.test(id)) {
    tags.push('fast');
    tags.push('cheap');
  }
  if (REASONING_RE.test(id)) tags.push('reasoning');
  if (VISION_RE.test(id) && !/\b(text|coder|code)\b/i.test(id.split('/').pop() || id)) {
    tags.push('vision');
  }
  return [...new Set(tags)];
}

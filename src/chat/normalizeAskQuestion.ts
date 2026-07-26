/**
 * Normalize ask_question → always MCQ-friendly for ClarifyingQuestions.
 * - Recover options dumped into question prose / JSON
 * - Always append 기타
 */
export const OTHER_OPTION = '기타';

export function normalizeMcqQuestion(
  question: string,
  options?: string[] | null
): { question: string; options: string[] } {
  let q = String(question || '').trim();
  let opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o).trim())
    .filter(Boolean);

  // Model sometimes embeds: …, "options": ["A. …", "B. …"]
  const embedded = q.match(/"options"\s*:\s*(\[[\s\S]*?\])/i);
  if (embedded) {
    try {
      const parsed = JSON.parse(embedded[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const s = String(item).trim();
          if (s) opts.push(s);
        }
      }
    } catch {
      /* ignore bad JSON */
    }
    q = q
      .replace(/[,{\s]*"options"\s*:\s*\[[\s\S]*$/i, '')
      .replace(/^\s*[\[{,\s]+/, '')
      .trim();
  }

  // Strip leftover tool-arg fragments
  q = q
    .replace(/"required"\s*:\s*(true|false)\s*}?\s*$/i, '')
    .replace(/[,}\s]+$/g, '')
    .trim();

  // Letter / numbered choices in the question body
  if (opts.length === 0) {
    const lines = [...q.matchAll(/^\s*([A-Da-d]|[1-9])[.)]\s+(.+)$/gm)];
    if (lines.length >= 2) {
      opts = lines.map((m) => {
        const label = m[1].toUpperCase();
        return `${label}. ${m[2].trim()}`;
      });
      q = q
        .replace(/^\s*([A-Da-d]|[1-9])[.)]\s+.+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  opts = opts.filter((o) => {
    const key = o.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Always append 기타
  if (!opts.some((o) => /^기타$/i.test(o) || /^other$/i.test(o))) {
    opts.push(OTHER_OPTION);
  }

  // Absolute fallback so UI never falls back to free-text-only
  if (opts.length === 0) {
    opts = [OTHER_OPTION];
  }

  return {
    question: q || String(question || '').trim() || '질문을 선택하세요',
    options: opts
  };
}

export function isOtherOption(label: string): boolean {
  return /^기타$/i.test(label.trim()) || /^other$/i.test(label.trim());
}

/** Whether current answer is the Other path (custom text or bare 기타) */
export function isOtherAnswer(answer: string | undefined, options: string[]): boolean {
  if (!answer?.trim()) return false;
  const presets = options.filter((o) => !isOtherOption(o));
  if (presets.some((o) => o === answer)) return false;
  if (isOtherOption(answer)) return true;
  return true; // custom free-text
}

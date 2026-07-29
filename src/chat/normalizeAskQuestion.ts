/**
 * Normalize ask_question → always MCQ-friendly for ClarifyingQuestions.
 * - Recover options dumped into question prose / JSON
 * - Coerce object options ({ label, text, value, … }) → display string
 * - Always append 기타
 */
export const OTHER_OPTION = '기타';

/** Models often send { label/text/value } instead of plain strings */
export function coerceOptionLabel(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw).trim();
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const key of [
      'label',
      'text',
      'title',
      'option',
      'value',
      'content',
      'description',
      'name',
      'answer'
    ]) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    }
    // Single-key object → use the value if it's a string
    const vals = Object.values(o);
    if (vals.length === 1 && (typeof vals[0] === 'string' || typeof vals[0] === 'number')) {
      return String(vals[0]).trim();
    }
  }
  return '';
}

export function normalizeMcqQuestion(
  question: string,
  options?: unknown[] | null
): { question: string; options: string[] } {
  let q = String(question || '').trim();
  let opts = (Array.isArray(options) ? options : [])
    .map(coerceOptionLabel)
    .filter((o) => o && o !== '[object Object]');

  // Model sometimes embeds: …, "options": ["A. …", "B. …"]
  const embedded = q.match(/"options"\s*:\s*(\[[\s\S]*?\])/i);
  if (embedded) {
    try {
      const parsed = JSON.parse(embedded[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const s = coerceOptionLabel(item);
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

/** Split a multi-select answer into individual choices */
export function parseMultiAnswers(answer: string | undefined): string[] {
  if (!answer?.trim()) return [];
  return answer
    .split(/\n+| · | \| /)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join selected options for storage / tool result */
export function formatMultiAnswers(parts: string[]): string {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of cleaned) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join('\n');
}

/** Whether current answer is the Other path (custom text or bare 기타) */
export function isOtherAnswer(answer: string | undefined, options: string[]): boolean {
  if (!answer?.trim()) return false;
  const presets = options.filter((o) => !isOtherOption(o));
  const parts = parseMultiAnswers(answer);
  if (parts.some((p) => isOtherOption(p))) return true;
  if (parts.every((p) => presets.includes(p))) return false;
  return parts.some((p) => !presets.includes(p));
}

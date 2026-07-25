/**
 * AutoMemoryDetector - 모델 "기억해" / 반복 선호 감지 → 자동 저장 제안 (C4-T20)
 */
export interface AutoMemorySuggestion {
  key: string;
  value: string;
  confidence: number; // 0-1
  source: 'explicit_save' | 'preference_pattern' | 'repeated_pattern';
}

const SAVE_KEYWORDS = [
  /(?:기억해|remember|keep in mind|note that|important:?|for future reference)/i,
  /(?:저장|save|store|record|keep)\s+(?:this|that|the|my)/i,
  /always\s+(?:remember|use|do|check)/i,
  /never\s+(?:use|do|forget|assume)/i,
];

const PREFERENCE_PATTERNS = [
  /(?:prefer|prefers|preferred|favorite|favourite|mostly use)\s+(.+?)(?:[.;]|$)/i,
  /(?:I (?:like|use|work with|develop in|code in))\s+(.+?)(?:[.;]|$)/i,
  /(?:아무래도|보통|자주|주로)\s+(.+?)(?:[.;]|$)/i,
];

export class AutoMemoryDetector {
  detect(text: string): AutoMemorySuggestion[] {
    const suggestions: AutoMemorySuggestion[] = [];

    // 1. Explicit save keywords
    for (const pattern of SAVE_KEYWORDS) {
      const match = text.match(pattern);
      if (match) {
        const value = extractContext(text, match.index || 0);
        if (value) {
          suggestions.push({
            key: value.slice(0, 40),
            value,
            confidence: 0.9,
            source: 'explicit_save'
          });
        }
      }
    }

    // 2. Preference patterns
    for (const pattern of PREFERENCE_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value.length > 10) {
          suggestions.push({
            key: value.slice(0, 40),
            value,
            confidence: 0.6,
            source: 'preference_pattern'
          });
        }
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return suggestions.filter(s => {
      const key = s.key.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 반복된 선호 감지 (다수 턴에서 동일 패턴)
   */
  detectRepeatedPreference(history: string[]): AutoMemorySuggestion[] {
    const suggestions: AutoMemorySuggestion[] = [];
    const phraseCount = new Map<string, { count: number; lastSeen: number }>();

    for (const text of history) {
      for (const pattern of PREFERENCE_PATTERNS) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const key = match[1].trim().toLowerCase().slice(0, 40);
          if (!phraseCount.has(key)) {
            phraseCount.set(key, { count: 0, lastSeen: 0 });
          }
          const entry = phraseCount.get(key)!;
          entry.count++;
          entry.lastSeen = Date.now();
        }
      }
    }

    for (const [key, info] of phraseCount) {
      if (info.count >= 2) {
        suggestions.push({
          key,
          value: key,
          confidence: Math.min(0.5 + info.count * 0.15, 0.95),
          source: 'repeated_pattern'
        });
      }
    }

    return suggestions;
  }
}

function extractContext(text: string, position: number): string | null {
  const slice = text.slice(position, position + 200);
  // Try to extract the meaningful context
  const match = slice.match(/[:：]\s*(.+?)(?:[.;!?]|$)/);
  if (match) return match[1].trim();
  const words = slice.split(/\s+/).slice(0, 15);
  return words.join(' ');
}

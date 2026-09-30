/**
 * V31-CTX-03 — TokenEstimator.
 * CJK-aware heuristic token estimate used by budget + compaction.
 *
 * Latin/number-heavy text stays at ≈4 chars/token (legacy behavior);
 * CJK code points are counted at ≈1 token each, which is far closer to
 * real tokenizer output for Korean/Chinese/Japanese prompts.
 */

export interface TokenEstimator {
  estimate(text: string): number;
  estimateMessages(messages: TokenEstimatable[]): number;
}

/** Minimal shape needed to estimate a message (AgentMessage-compatible). */
export interface TokenEstimatable {
  content?: string;
  toolCalls?: unknown;
  toolCallId?: string;
}

export interface TokenEstimatorOptions {
  /** Code points per token for CJK text. Default 1. */
  cjkCharsPerToken?: number;
  /** Code points per token for non-CJK text. Default 4. */
  latinCharsPerToken?: number;
}

const DEFAULT_CJK_CHARS_PER_TOKEN = 1;
const DEFAULT_LATIN_CHARS_PER_TOKEN = 4;

/**
 * Ranges whose code points are treated as CJK (≈1 token per char):
 * - CJK Unified Ideographs + Ext A (`\u3400-\u4DBF`, `\u4E00-\u9FFF`)
 * - CJK Compatibility Ideographs (`\uF900-\uFAFF`)
 * - Hiragana / Katakana (`\u3040-\u30FF`)
 * - Hangul Syllables (`\uAC00-\uD7AF`) + Jamo (`\u1100-\u11FF`)
 * - Fullwidth forms / CJK symbols (`\u3000-\u303F`, `\uFF00-\uFFEF`)
 */
const CJK_RANGES: Array<[number, number]> = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x3040, 0x30ff], // Hiragana + Katakana
  [0x3400, 0x4dbf], // CJK Ext A
  [0x4e00, 0x9fff], // CJK Unified
  [0xac00, 0xd7af], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
];

function isCjkCodePoint(cp: number): boolean {
  for (const [lo, hi] of CJK_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

export class HeuristicTokenEstimator implements TokenEstimator {
  private readonly cjkCharsPerToken: number;
  private readonly latinCharsPerToken: number;

  constructor(opts: TokenEstimatorOptions = {}) {
    this.cjkCharsPerToken = opts.cjkCharsPerToken ?? DEFAULT_CJK_CHARS_PER_TOKEN;
    this.latinCharsPerToken = opts.latinCharsPerToken ?? DEFAULT_LATIN_CHARS_PER_TOKEN;
  }

  estimate(text: string): number {
    if (!text) return 0;
    let cjkCount = 0;
    let otherCount = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp === undefined) continue;
      if (isCjkCodePoint(cp)) cjkCount++;
      else otherCount++;
    }
    const cjkTokens = Math.ceil(cjkCount / this.cjkCharsPerToken);
    const latinTokens = Math.ceil(otherCount / this.latinCharsPerToken);
    return cjkTokens + latinTokens;
  }

  estimateMessages(messages: TokenEstimatable[]): number {
    let total = 0;
    for (const m of messages) {
      total += this.estimate(m.content ?? '');
      if (m.toolCalls) total += this.estimate(JSON.stringify(m.toolCalls));
      if (m.toolCallId) total += this.estimate(m.toolCallId);
    }
    return total;
  }
}

/** Shared default estimator (stateless — safe as a module singleton). */
export const defaultTokenEstimator: TokenEstimator = new HeuristicTokenEstimator();

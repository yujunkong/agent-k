/**
 * V31-CTX-03 — CJK-aware token estimator.
 */
import { describe, expect, it } from 'vitest';
import {
  HeuristicTokenEstimator,
  defaultTokenEstimator,
  estimateMessagesTokens,
  estimateTokens,
} from '../index';

describe('TokenEstimator (V31-CTX-03)', () => {
  it('keeps legacy ≈4 chars/token for latin text', () => {
    expect(defaultTokenEstimator.estimate('abcd')).toBe(1);
    expect(defaultTokenEstimator.estimate('a'.repeat(400))).toBe(100);
  });

  it('counts CJK code points at ≈1 token each', () => {
    const ko = '안녕하세요'; // 5 Hangul syllables
    expect(defaultTokenEstimator.estimate(ko)).toBe(5);
    const zh = '你好世界'; // 4 CJK ideographs
    expect(defaultTokenEstimator.estimate(zh)).toBe(4);
  });

  it('mixes CJK and latin correctly', () => {
    // 4 latin (≈1 token) + 2 CJK (2 tokens) = 3
    expect(defaultTokenEstimator.estimate('abcd안녕')).toBe(3);
  });

  it('honors custom ratios', () => {
    const est = new HeuristicTokenEstimator({ cjkCharsPerToken: 2 });
    expect(est.estimate('안녕하세요')).toBe(3);
  });

  it('backward-compatible free functions delegate to the default estimator', () => {
    expect(estimateTokens('안녕하세요')).toBe(5);
    expect(estimateTokens('abcd')).toBe(1);
  });

  it('estimates messages including tool call JSON', () => {
    const total = estimateMessagesTokens([
      { content: '안녕', toolCallId: 't1' },
      { content: '', toolCalls: [{ id: 'a', name: 'read_file' }] },
    ]);
    expect(total).toBeGreaterThan(3);
  });

  it('empty text is zero', () => {
    expect(defaultTokenEstimator.estimate('')).toBe(0);
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

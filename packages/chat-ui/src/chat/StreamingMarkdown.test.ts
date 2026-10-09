/**
 * STREAM-flicker — parser-level stability for incremental content.
 * Comment: React remount flicker is covered by StreamingMarkdown useMemo (sync feed).
 */
import { describe, expect, it } from 'vitest';
import { parseStreamingMarkdown } from './StreamingMarkdown';

describe('parseStreamingMarkdown incremental append', () => {
  it('grows text nodes as content appends (no shorter rewrite)', () => {
    const a = parseStreamingMarkdown('Hello', true);
    const b = parseStreamingMarkdown('Hello world', true);
    const c = parseStreamingMarkdown('Hello world!', true);

    const text = (nodes: ReturnType<typeof parseStreamingMarkdown>) =>
      nodes
        .filter((n) => n.type === 'text')
        .map((n) => n.text || '')
        .join('');

    expect(text(a)).toBe('Hello');
    expect(text(b)).toBe('Hello world');
    expect(text(c)).toBe('Hello world!');
    expect(text(b).startsWith(text(a))).toBe(true);
    expect(text(c).startsWith(text(b))).toBe(true);
  });

  it('keeps a single text node for plain prose growth', () => {
    const nodes = parseStreamingMarkdown('One two three', true);
    const texts = nodes.filter((n) => n.type === 'text');
    expect(texts.length).toBe(1);
    expect(texts[0].text).toContain('One two three');
  });
});

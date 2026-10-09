/**
 * V31-TOOL-01 — NativeThenFallbackNormalizer tests.
 */

import { describe, expect, it } from 'vitest';
import { NativeThenFallbackNormalizer } from './ToolCallNormalizer';

describe('V31-TOOL-01 NativeThenFallbackNormalizer', () => {
  it('passes native tool calls through without fallback parsing', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    const native = [
      { id: 'call_1', name: 'grep', arguments: { pattern: 'x' } },
    ];
    const out = normalizer.normalize(
      native,
      '<tool name="read_file">{"path":"a.ts"}</tool>',
    );
    expect(out).toEqual(native);
  });

  it('parses XML tool tags when native calls are absent', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    const out = normalizer.normalize(
      undefined,
      '<tool name="grep">{"pattern":"x"}</tool>',
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('grep');
    expect(out[0].arguments).toEqual({ pattern: 'x' });
    expect(out[0].id).toBeTruthy();
  });

  it('parses Claude-style invoke/parameter XML', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    const out = normalizer.normalize(
      undefined,
      '<atem:invoke name="read_file"><atem:parameter name="path">a.ts</atem:parameter></atem:invoke>',
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('read_file');
    expect(out[0].arguments).toEqual({ path: 'a.ts' });
  });

  it('parses a ```json fence tool call', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    const out = normalizer.normalize(
      [],
      '```json\n{"name":"read_file","arguments":{"path":"a.ts"}}\n```',
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('read_file');
    expect(out[0].arguments).toEqual({ path: 'a.ts' });
  });

  it('parses a bare JSON array tool call', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    const out = normalizer.normalize(
      undefined,
      '[{"name":"read_file","arguments":{"path":"a.ts"}}]',
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('read_file');
    expect(out[0].arguments).toEqual({ path: 'a.ts' });
  });

  it('returns [] for plain prose', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    expect(normalizer.normalize(undefined, 'Here is the answer.')).toEqual([]);
  });

  it('returns [] for a broken-looking payload that fails to parse', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    expect(
      normalizer.normalize(undefined, '```json\n{"name": broken'),
    ).toEqual([]);
  });

  it('minConfidence 0.95 filters XML calls (confidence 0.9)', () => {
    const normalizer = new NativeThenFallbackNormalizer(undefined, {
      minConfidence: 0.95,
    });
    expect(
      normalizer.normalize(
        undefined,
        '<tool name="grep">{"pattern":"x"}</tool>',
      ),
    ).toEqual([]);
  });

  it('skips native entries without a name and fills missing ids', () => {
    const normalizer = new NativeThenFallbackNormalizer();
    const out = normalizer.normalize(
      [
        { arguments: { pattern: 'x' } },
        { name: 'glob', arguments: '{"pattern":"**/*.ts"}' },
      ],
      'plain prose',
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('glob');
    expect(out[0].arguments).toEqual({ pattern: '**/*.ts' });
    expect(out[0].id).toBe('call_1');
  });
});

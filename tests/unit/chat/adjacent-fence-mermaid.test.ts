/**
 * Adjacent fence recovery: ```markdown … ```mermaid must not leak "mermaid" as text.
 */
import * as assert from 'assert';
import { parseStreamingMarkdown } from '../../../src/chat/StreamingMarkdown';

suite('adjacent fence mermaid', () => {
  test('```markdown followed by ```mermaid opens a mermaid node', () => {
    const md = [
      '```markdown',
      '# Plan',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '```text',
      '## TODOs',
      '- [ ] item',
      '```'
    ].join('\n');

    const nodes = parseStreamingMarkdown(md);
    const types = nodes.map((n) => n.type);
    assert.ok(types.includes('code'), `expected code, got ${types.join(',')}`);
    assert.ok(types.includes('mermaid'), `expected mermaid, got ${types.join(',')}`);

    const mermaid = nodes.find((n) => n.type === 'mermaid');
    assert.ok(mermaid?.definition?.includes('graph TD'));
    assert.ok(mermaid?.definition?.includes('A --> B'));

    // Must not leave a lone "mermaid" text node
    const leaked = nodes.some(
      (n) => n.type === 'text' && /^\s*mermaid\s*$/m.test(n.text || '')
    );
    assert.strictEqual(leaked, false);
  });

  test('normal separate fences still work', () => {
    const md = ['```ts', 'const x = 1', '```', '', '```mermaid', 'graph LR', 'A-->B', '```'].join(
      '\n'
    );
    const nodes = parseStreamingMarkdown(md);
    assert.strictEqual(nodes.filter((n) => n.type === 'code').length, 1);
    assert.strictEqual(nodes.filter((n) => n.type === 'mermaid').length, 1);
  });
});

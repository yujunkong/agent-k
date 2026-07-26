/**
 * DebugStorage naming — mirrors PlanStorage under .agentk/debug/tmp/
 */
import * as assert from 'assert';
import * as crypto from 'crypto';

function makeDebugId(content: string, title?: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${Date.now()}\n${title || ''}\n${content}`)
    .digest('hex')
    .slice(0, 10);
  return `debug_${hash}`;
}

const REUSABLE = /^debug_[a-f0-9]+$/i;

suite('DebugStorage naming', () => {
  test('makeDebugId → debug_<10 hex>', () => {
    const id = makeDebugId('# Debug\n', 'Bug');
    assert.ok(REUSABLE.test(id), id);
  });

  test('draft path: .agentk/debug/tmp/debug_<hash>.md', () => {
    const slug = makeDebugId('body');
    const rel = `.agentk/debug/tmp/${slug}.md`;
    assert.ok(rel.startsWith('.agentk/debug/tmp/debug_'));
  });
});

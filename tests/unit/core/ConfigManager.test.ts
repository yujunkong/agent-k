/**
 * RW-P0-02: ConfigManager product defaults (permission + queue)
 */
import * as assert from 'assert';
import { ConfigManager } from '../../src/core/ConfigManager';

suite('ConfigManager defaults (RW-P0-02)', () => {
  test('permission.level defaults to accept_edits', () => {
    const cm = new ConfigManager();
    assert.strictEqual(cm.get('agent-k.permission.level'), 'accept_edits');
  });

  test('queue keys match PRD-17 / PRD-29 defaults', () => {
    const cm = new ConfigManager();
    assert.strictEqual(cm.get('agent-k.queue.onEnterWhileRunning'), 'resynthesize');
    assert.strictEqual(cm.get('agent-k.queue.onStop'), 'keep');
    assert.strictEqual(cm.get('agent-k.queue.resynthesizeDebounceMs'), 300);
    assert.strictEqual(cm.get('agent-k.queue.debounceMs'), 300);
  });
});

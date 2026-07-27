/**
 * ADDON-T02: idle turnTimeout helpers (no vscode / AgentLoopController import)
 */
import * as assert from 'assert';
import {
  DEFAULT_TURN_TIMEOUT_MS,
  resolveTurnTimeoutMs,
  RunTimeoutGuard,
} from '../../../src/loop/turnTimeout';

suite('ADDON-T02 turnTimeout', () => {
  test('resolveTurnTimeoutMs defaults to 900000', () => {
    assert.strictEqual(resolveTurnTimeoutMs(undefined, undefined), DEFAULT_TURN_TIMEOUT_MS);
    assert.strictEqual(DEFAULT_TURN_TIMEOUT_MS, 900_000);
  });

  test('config override wins', () => {
    assert.strictEqual(resolveTurnTimeoutMs(5000, 120000), 5000);
  });

  test('settings used when config unset', () => {
    assert.strictEqual(resolveTurnTimeoutMs(undefined, 90_000), 90_000);
  });

  test('0 disables', () => {
    assert.strictEqual(resolveTurnTimeoutMs(0, 120000), 0);
  });

  test('RunTimeoutGuard fires and clear prevents fire', async function () {
    this.timeout(2000);
    let fired = 0;
    const g = new RunTimeoutGuard();
    g.arm(40, { onTimeout: () => { fired++; } });
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(fired, 1);
    assert.strictEqual(g.didFire, true);

    fired = 0;
    const g2 = new RunTimeoutGuard();
    g2.arm(40, { onTimeout: () => { fired++; } });
    g2.clear();
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(fired, 0);
  });

  test('bump resets idle window so long active runs stay alive', async function () {
    this.timeout(3000);
    let fired = 0;
    const g = new RunTimeoutGuard();
    g.arm(80, { onTimeout: () => { fired++; } });
    await new Promise((r) => setTimeout(r, 40));
    g.bump();
    await new Promise((r) => setTimeout(r, 40));
    g.bump();
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(fired, 0, 'should not fire while bumped');
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(fired, 1, 'should fire after idle');
  });
});

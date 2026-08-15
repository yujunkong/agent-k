import * as assert from 'assert';
import {
  PLAN_V2_GENERATE_TIMEOUT_MS,
  createPlanV2GenerateWatchdog
} from '../../../src/chat/planV2GenerateWatchdog';

function fakeTimers() {
  const timers: Array<{ id: number; fn: () => void; ms: number }> = [];
  let nextId = 1;
  return {
    timers,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (id: unknown) => {
      const idx = timers.findIndex((t) => t.id === (id as number));
      if (idx >= 0) timers.splice(idx, 1);
    }
  };
}

suite('createPlanV2GenerateWatchdog', () => {
  test('arms 180s immediately so old hosts without started still time out', () => {
    const clock = fakeTimers();
    const events: string[] = [];
    createPlanV2GenerateWatchdog({
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      onGenerateTimeout: () => events.push('generate')
    });
    assert.strictEqual(clock.timers.length, 1);
    assert.strictEqual(clock.timers[0].ms, PLAN_V2_GENERATE_TIMEOUT_MS);
    clock.timers[0].fn();
    assert.deepStrictEqual(events, ['generate']);
  });

  test('host started signal restarts the 180s budget', () => {
    const clock = fakeTimers();
    const events: string[] = [];
    const watchdog = createPlanV2GenerateWatchdog({
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      onGenerateTimeout: () => events.push('generate')
    });
    const firstId = clock.timers[0].id;
    watchdog.beginGenerateTimeout();
    assert.strictEqual(clock.timers.length, 1);
    assert.notStrictEqual(clock.timers[0].id, firstId);
    clock.timers[0].fn();
    assert.deepStrictEqual(events, ['generate']);
  });

  test('result/clear leaves no pending timers', () => {
    const clock = fakeTimers();
    const events: string[] = [];
    const watchdog = createPlanV2GenerateWatchdog({
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      onGenerateTimeout: () => events.push('generate')
    });
    watchdog.clear();
    assert.strictEqual(clock.timers.length, 0);
    assert.deepStrictEqual(events, []);
  });
});

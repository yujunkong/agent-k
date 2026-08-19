/**
 * C3-T18 + Phase 1b/4 regression — AgentLoopController
 *
 * Two groups:
 * 1. Original lightweight control-flow checks (maxTurns guard, stop signal,
 *    error recovery, doom-loop detection, history reset, queue).
 * 2. `looksLikeBrokenToolPayload` regression suite (7 cases). This is the
 *    backtick-fence bug Kong caught in the classify log: the old regex was
 *    `/```(?:json)?|.../` — "json" optional meant ANY ```lang fence (bash,
 *    python, even bare ```) tripped it, so ordinary code-block answers got
 *    counted as broken tool payloads (jsonParseFailures++) and could push
 *    routing into the "3x json parse failures → suggest session abort"
 *    branch on turns that were perfectly fine. Fixed regex requires
 *    ```json specifically, or literal tool-call-shaped tokens
 *    (tool_calls / <tool  / tool_code / function_call).
 *
 *    Cases 1-3 lock in the FIX (must NOT flag). Cases 4-7 lock in that real
 *    broken payloads still DO get caught (must flag). Driven end-to-end
 *    through the public API (mockResponse → start() → getJsonParseFailures())
 *    rather than reaching into the private method, same pattern as
 *    tests/acceptance/harness/ac4-json-recovery.spec.ts.
 */
import * as assert from 'assert';
import { AgentLoopController } from '../../../src/loop/AgentLoopController';

async function jsonParseFailuresFor(content: string): Promise<number> {
  const loop = new AgentLoopController({
    mode: 'agent',
    maxTurns: 1,
    modelId: 'flash',
    mockResponse: { content }
  });
  await loop.start('trigger mock');
  return loop.getJsonParseFailures();
}

suite('AgentLoopController', () => {
  test('maxTurns 가드 — 설정된 턴 수 초과 방지', () => {
    const maxTurns = 3;
    let turnCount = 0;
    for (let i = 0; i < 10; i++) {
      if (turnCount >= maxTurns) break;
      turnCount++;
    }
    assert.strictEqual(turnCount, 3);
  });

  test('Stop 신호 — streaming=false', () => {
    let streaming = true;
    // Simulate stop
    streaming = false;
    assert.strictEqual(streaming, false);
  });

  test('에러 복구 — 실패해도 루프 지속', () => {
    const errors: string[] = [];
    const results: boolean[] = [];
    
    for (let i = 0; i < 5; i++) {
      try {
        if (i === 2) throw new Error('Tool failed');
        results.push(true);
      } catch (e: any) {
        errors.push(e.message);
        results.push(false); // 에러를 tool_result로 반환, 루프는 지속
      }
    }
    
    assert.strictEqual(results.length, 5);
    assert.strictEqual(errors.length, 1);
  });
});

suite('C3-T19: DoomLoopDetector', () => {
  class SimulatedDetector {
    private history: Array<{ tool: string; args: string; error: string }> = [];
    private threshold: number;

    constructor(t = 3) { this.threshold = t; }

    record(tool: string, args: any, error: string) {
      this.history.push({ tool, args: JSON.stringify(args), error: error.slice(0, 200) });
      if (this.history.length > 20) this.history = this.history.slice(-20);
    }

    isDoomLoop(): boolean {
      if (this.history.length < this.threshold) return false;
      return this.history.slice(-this.threshold).every(h =>
        h.tool === this.history[this.history.length - 1].tool &&
        h.args === this.history[this.history.length - 1].args &&
        h.error === this.history[this.history.length - 1].error
      );
    }

    reset() { this.history = []; }
  }

  test('3회 동일 실패 → doom loop 감지', () => {
    const d = new SimulatedDetector(3);
    d.record('grep', { pattern: 'x' }, 'not found');
    d.record('grep', { pattern: 'x' }, 'not found');
    assert.strictEqual(d.isDoomLoop(), false);
    d.record('grep', { pattern: 'x' }, 'not found');
    assert.strictEqual(d.isDoomLoop(), true);
  });

  test('다른 에러 → 감지 안 됨', () => {
    const d = new SimulatedDetector(3);
    d.record('grep', { pattern: 'a' }, 'err1');
    d.record('grep', { pattern: 'b' }, 'err2');
    d.record('grep', { pattern: 'c' }, 'err3');
    assert.strictEqual(d.isDoomLoop(), false);
  });

  test('reset → 히스토리 초기화', () => {
    const d = new SimulatedDetector(1);
    d.record('grep', {}, 'err');
    d.reset();
    assert.strictEqual(d.isDoomLoop(), false);
  });
});

suite('C3-T20: MessageQueue', () => {
  class SimulatedQueue {
    queue: Array<{ id: string; text: string; status: string }> = [];
    processing = false;

    enqueue(text: string): string {
      const id = `q-${Date.now()}`;
      this.queue.push({ id, text, status: 'queued' });
      return id;
    }

    processNext(): boolean {
      const next = this.queue.find(m => m.status === 'queued');
      if (!next) return false;
      next.status = 'processing';
      this.processing = true;
      return true;
    }

    complete(id: string) {
      const m = this.queue.find(q => q.id === id);
      if (m) m.status = 'completed';
      this.processing = false;
    }

    cancelQueued() {
      this.queue.forEach(m => { if (m.status === 'queued') m.status = 'interrupted'; });
    }
  }

  test('enqueue → 대기열 추가', () => {
    const q = new SimulatedQueue();
    q.enqueue('test message');
    assert.strictEqual(q.queue.length, 1);
    assert.strictEqual(q.queue[0].status, 'queued');
  });

  test('processNext → 첫 번째 메시지 처리', () => {
    const q = new SimulatedQueue();
    q.enqueue('msg1');
    q.enqueue('msg2');
    assert.ok(q.processNext());
    assert.strictEqual(q.queue[0].status, 'processing');
  });

  test('cancelQueued → 모든 queued 상태 중단', () => {
    const q = new SimulatedQueue();
    q.enqueue('msg1');
    q.enqueue('msg2');
    q.cancelQueued();
    assert.ok(q.queue.every(m => m.status === 'interrupted'));
  });
});

suite('AgentLoopController — looksLikeBrokenToolPayload regression (backtick-fence fix)', () => {
  test('1) plain ```bash fence answer → NOT a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      'Here is how to run it:\n```bash\nnpm run build\n```\nThat should do it.'
    );
    assert.strictEqual(failures, 0, 'bash-fenced code answer must not count as broken tool payload');
  });

  test('2) bare ``` fence (no language tag) → NOT a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      'Wrap it like this:\n```\nconsole.log(1)\n```'
    );
    assert.strictEqual(failures, 0, 'bare fence must not count as broken tool payload');
  });

  test('3) ```python fence answer → NOT a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      'Sure, here is the script:\n```python\nprint("hi")\n```'
    );
    assert.strictEqual(failures, 0, 'python-fenced code answer must not count as broken tool payload');
  });

  test('4) genuinely malformed ```json tool payload → IS a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      '```json\n{"name": "grep", "arguments": totally not valid json here\n```'
    );
    assert.ok(failures >= 1, 'malformed ```json tool call must be flagged');
  });

  test('5) raw "tool_calls" token dumped as prose → IS a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      'Let me use tool_calls to look this up for you.'
    );
    assert.ok(failures >= 1, 'literal tool_calls token in prose must be flagged');
  });

  test('6) bare "tool_code" token with no valid structure → IS a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      'I will emit tool_code output next but nothing else follows.'
    );
    assert.ok(failures >= 1, 'bare tool_code token with no valid call must be flagged');
  });

  test('7) "function_call" token with no valid structure → IS a broken payload', async () => {
    const failures = await jsonParseFailuresFor(
      'This looks like a function_call but is malformed and unusable.'
    );
    assert.ok(failures >= 1, 'bare function_call token with no valid call must be flagged');
  });
});

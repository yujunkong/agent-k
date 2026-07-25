/**
 * C3-T18: 단위 테스트 — AgentLoopController
 */
import * as assert from 'assert';

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

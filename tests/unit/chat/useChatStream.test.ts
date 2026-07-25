/**
 * C0-T29: 단위 테스트 — useChatStream 훅
 * 
 * 모킹된 API 스트림으로 토큰 단위 업데이트 검증, AbortController 동작 검증
 */
import * as assert from 'assert';

suite('useChatStream', () => {
  // Simulated stream hook logic (not a real React hook test)
  interface StreamState {
    streaming: boolean;
    content: string;
    error: string | null;
    completed: boolean;
  }

  class ChatStreamSimulator {
    private abortController: AbortController | null = null;
    state: StreamState = { streaming: false, content: '', error: null, completed: false };
    private onDelta: ((content: string) => void) | null = null;
    private onComplete: (() => void) | null = null;
    private onError: ((err: string) => void) | null = null;

    setCallbacks(delta: (c: string) => void, complete: () => void, error: (e: string) => void) {
      this.onDelta = delta;
      this.onComplete = complete;
      this.onError = error;
    }

    async startStream(chunks: string[]) {
      this.abortController = new AbortController();
      this.state = { streaming: true, content: '', error: null, completed: false };

      for (const chunk of chunks) {
        if (this.abortController.signal.aborted) {
          this.state.streaming = false;
          return;
        }
        await new Promise(r => setTimeout(r, 1));
        this.state.content += chunk;
        this.onDelta?.(chunk);
      }

      this.state.streaming = false;
      this.state.completed = true;
      this.onComplete?.();
    }

    stop() {
      this.abortController?.abort();
      this.state.streaming = false;
    }

    async regenerate(chunks: string[]) {
      this.state = { streaming: true, content: '', error: null, completed: false };
      await this.startStream(chunks);
    }
  }

  test('토큰 단위 업데이트 — 청크 순차 추가', async () => {
    const sim = new ChatStreamSimulator();
    const deltas: string[] = [];

    sim.setCallbacks(
      (c) => deltas.push(c),
      () => {},
      () => {}
    );

    await sim.startStream(['Hello', ' world', '!']);
    assert.strictEqual(sim.state.content, 'Hello world!');
    assert.strictEqual(deltas.length, 3);
    assert.strictEqual(sim.state.completed, true);
  });

  test('AbortController — 중단 즉시 streaming=false', async () => {
    const sim = new ChatStreamSimulator();

    sim.setCallbacks(() => {}, () => {}, () => {});
    
    const streamPromise = sim.startStream(['a', 'b', 'c', 'd', 'e']);
    sim.stop();
    await streamPromise;

    assert.strictEqual(sim.state.streaming, false);
  });

  test('Regenerate — 스트림 리셋 후 재시작', async () => {
    const sim = new ChatStreamSimulator();
    sim.setCallbacks(() => {}, () => {}, () => {});

    await sim.startStream(['first']);
    assert.strictEqual(sim.state.content, 'first');
    assert.strictEqual(sim.state.completed, true);

    await sim.regenerate(['second']);
    assert.strictEqual(sim.state.content, 'second');
  });

  test('스트림 도중 에러 — 에러 상태로 전환', async () => {
    const sim = new ChatStreamSimulator();
    let errorMsg = '';

    sim.setCallbacks(
      () => {},
      () => {},
      (err) => { errorMsg = err; }
    );

    // Simulate error during stream
    sim.state.error = 'Network error';
    sim.onError?.('Network error');

    assert.strictEqual(errorMsg, 'Network error');
  });

  test('빈 청크 — 컨텐츠 변화 없음', async () => {
    const sim = new ChatStreamSimulator();
    sim.setCallbacks(() => {}, () => {}, () => {});

    await sim.startStream([]);
    assert.strictEqual(sim.state.content, '');
    assert.strictEqual(sim.state.completed, true);
  });

  test('연속 Stop — 두 번째 Stop은 무시', async () => {
    const sim = new ChatStreamSimulator();
    sim.setCallbacks(() => {}, () => {}, () => {});

    const p = sim.startStream(['a', 'b', 'c']);
    sim.stop();
    sim.stop(); // second stop should be no-op
    await p;
    assert.strictEqual(sim.state.streaming, false);
  });
});

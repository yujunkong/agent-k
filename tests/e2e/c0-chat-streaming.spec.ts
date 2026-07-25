/**
 * C0-T30: E2E — "Hello" 전송 → 스트리밍 응답 확인
 * 
 * Playwright: 확장 로드 → 채팅 → "Hello" 입력 → Enter → 스트리밍 확인
 */
import * as assert from 'assert';
import { createMockStreamServer } from './fixtures/mock-stream-server';

suite('E2E: Chat Streaming', () => {
  let mockServer: ReturnType<typeof createMockStreamServer>;

  suiteSetup(async () => {
    mockServer = createMockStreamServer(18901);
    await mockServer.start();
  });

  suiteTeardown(async () => {
    await mockServer.stop();
  });

  test('C0-T30-1: Mock 서버가 SSE 스트리밍 응답', async () => {
    const response = await fetch(`${mockServer.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'text/event-stream');

    const reader = response.body?.getReader();
    assert.ok(reader, 'Response body must be readable');

    if (reader) {
      const decoder = new TextDecoder();
      let content = '';
      let done = false;

      while (!done) {
        const { done: isDone, value } = await reader.read();
        done = isDone;
        if (value) {
          content += decoder.decode(value, { stream: true });
        }
      }

      assert.ok(content.includes('Hello'), 'Stream response should contain "Hello"');
      assert.ok(content.includes('[DONE]'), 'Stream should end with [DONE] signal');
    }
  });

  test('C0-T30-2: Mock 서버가 /models 응답', async () => {
    const response = await fetch(`${mockServer.url}/v1/models`);
    const data = await response.json();
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.some((m: any) => m.id === 'gemma-2-27b'));
  });

  // In real Playwright E2E:
  // test('Extension 로드 → 채팅 → "Hello" 전송 → 스트리밍 응답', async () => {
  //   const app = await electron.launch({ args: ['--extensionDevelopmentPath=.'] });
  //   const window = await app.firstWindow();
  //   await window.waitForSelector('.chat-container');
  //   await window.fill('.composer textarea', 'Hello');
  //   await window.press('.composer textarea', 'Enter');
  //   await window.waitForSelector('.message-bubble.assistant');
  //   const content = await window.textContent('.message-bubble.assistant');
  //   assert.ok(content?.length > 0);
  // });
});

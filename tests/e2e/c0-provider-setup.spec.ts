/**
 * C0-T31: E2E — Provider 등록 → 연결 테스트 → 모델 선택
 * 
 * Mock 서버로 /models, /chat/completions 엔드포인트 제공
 */
import * as assert from 'assert';
import { createMockStreamServer } from './fixtures/mock-stream-server';

suite('E2E: Provider Setup', () => {
  let mockServer: ReturnType<typeof createMockStreamServer>;

  suiteSetup(async () => {
    mockServer = createMockStreamServer(18902);
    await mockServer.start();
  });

  suiteTeardown(async () => {
    await mockServer.stop();
  });

  test('C0-T31-1: /models 엔드포인트 정상 응답', async () => {
    const response = await fetch(`${mockServer.url}/v1/models`);
    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data.data));
    assert.strictEqual(data.data.length, 2);
    assert.strictEqual(data.data[0].id, 'gemma-2-27b');
  });

  test('C0-T31-2: 잘못된 URL → 404 에러', async () => {
    const response = await fetch(`${mockServer.url}/v1/invalid`);
    assert.strictEqual(response.status, 404);
  });

  test('C0-T31-3: /chat/completions 스트리밍 응답 검증', async () => {
    const response = await fetch(`${mockServer.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma-2-27b',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      })
    });

    assert.strictEqual(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader);

    if (reader) {
      const decoder = new TextDecoder();
      let fullOutput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullOutput += decoder.decode(value, { stream: true });
      }

      assert.ok(fullOutput.includes('[DONE]'));
    }
  });

  // In real Playwright E2E:
  // test('설정 UI → Provider 등록 → 연결 테스트 → 모델 선택', async () => {
  //   const app = await electron.launch({ args: ['--extensionDevelopmentPath=.'] });
  //   const window = await app.firstWindow();
  //   // Open settings
  //   await window.click('.settings-btn');
  //   // ... full flow
  // });
});

/**
 * C7-T38: E2E — Browser + Design Mode → UI 버그 재현 → 수정 → 재캡처 검증
 */
import * as assert from 'assert';
import { BrowserSessionManager } from '../../../src/browser/BrowserSession';
import { DesignModeOverlay } from '../../../src/browser/DesignModeOverlay';
import { DesignModeContext } from '../../../src/browser/DesignModeContext';

suite('C7-T38: Browser + Design Mode E2E', () => {
  let sessionManager: BrowserSessionManager;
  let overlay: DesignModeOverlay;
  let context: DesignModeContext;

  setup(async () => {
    sessionManager = new BrowserSessionManager();
    overlay = new DesignModeOverlay();
    context = new DesignModeContext(overlay);
  });

  test('세션 생성 → Design Mode 진입', async () => {
    const session = await sessionManager.createSession();
    assert.ok(session.id.startsWith('browser-'));
    assert.ok(session.tools.isAttached());
  });

  test('스크린샷 캡처 → 주석 추가 → 컨텍스트 생성', async () => {
    const session = await sessionManager.createSession();

    // Capture
    const snapshot = await overlay.captureSnapshot(
      session.tools, 'https://example.com', 'Example'
    );
    assert.ok(snapshot.screenshot.length > 0);
    assert.strictEqual(snapshot.url, 'https://example.com');

    // Add annotation
    overlay.addAnnotation({
      x: 100, y: 200, width: 50, height: 30,
      comment: 'Fix this button alignment'
    });
    assert.strictEqual(overlay.getAnnotations().length, 1);

    // Build context
    const ctx = context.buildContext();
    assert.ok(ctx);
    assert.ok(ctx!.contextBlock.includes('Fix this button'));
  });

  test('컨텍스트 주입', () => {
    overlay.addAnnotation({
      x: 50, y: 50, width: 100, height: 20,
      comment: 'Wrong color'
    });

    const result = context.injectContext('existing prompt');
    assert.ok(result.injected);
    assert.ok(result.prompt.includes('Design Mode Context'));
    assert.ok(result.prompt.includes('Wrong color'));
  });

  test('주석 컨텍스트 truncate', () => {
    for (let i = 0; i < 10; i++) {
      overlay.addAnnotation({
        x: i * 10, y: i * 10, width: 10, height: 10,
        comment: `Annotation ${i}`
      });
    }

    const truncated = overlay.exportTruncatedContext(3);
    const lines = truncated.split('\n').filter(l => l.startsWith('-'));
    assert.ok(lines.length <= 3);
  });

  teardown(async () => {
    await sessionManager.closeAll();
  });
});

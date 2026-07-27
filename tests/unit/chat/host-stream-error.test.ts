/**
 * Regression: host chat.stream error events must use `error` field.
 * Webview falls back to "Host tool loop error" when data.error is empty —
 * posting `message` instead caused opaque failures after 2m timeouts.
 */
import * as assert from 'assert';

/** Mirror of useChatStream error extraction */
function extractHostError(data: Record<string, unknown>): string {
  return String(
    data.error || data.message || data.detail || 'Host tool loop error'
  );
}

suite('host stream error payload', () => {
  test('timeout-style message-only payload still surfaces text', () => {
    const msg =
      'Agent run timed out (agent-k.turnTimeoutMs). Stopped in-flight work.';
    assert.strictEqual(extractHostError({ message: msg }), msg);
  });

  test('canonical error field preferred', () => {
    assert.strictEqual(
      extractHostError({ error: 'real', message: 'ignored' }),
      'real'
    );
  });

  test('empty payload falls back to Host tool loop error', () => {
    assert.strictEqual(extractHostError({}), 'Host tool loop error');
  });
});

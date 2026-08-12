import * as assert from 'assert';
import { isUnsupportedResponseFormatError } from '../../../../src/plan/v2/LiteLLMPlanModel';

suite('Plan V2 — LiteLLMPlanModel response_format fallback detection', () => {
  test('detects OpenAI-style unsupported response_format', () => {
    assert.strictEqual(
      isUnsupportedResponseFormatError(
        new Error('API Error (400): {"error":{"message":"Invalid parameter: response_format"}}')
      ),
      true
    );
  });

  test('detects json_schema not supported wording', () => {
    assert.strictEqual(
      isUnsupportedResponseFormatError(
        new Error('API Error (400): json_schema is not supported for this model')
      ),
      true
    );
  });

  test('does not treat connection refused as schema rejection', () => {
    assert.strictEqual(
      isUnsupportedResponseFormatError(new Error('fetch failed: ECONNREFUSED')),
      false
    );
  });

  test('does not treat 401 as schema rejection', () => {
    assert.strictEqual(
      isUnsupportedResponseFormatError(new Error('API Error (401): Unauthorized')),
      false
    );
  });

  test('does not treat model-not-found as schema rejection', () => {
    assert.strictEqual(
      isUnsupportedResponseFormatError(new Error('API Error (404): model not found')),
      false
    );
  });
});

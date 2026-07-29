/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import { looksLikeMermaidSource } from '../../../src/chat/mermaidSanitize';

suite('looksLikeMermaidSource', () => {
  test('flowchart는 mermaid로 인식한다', () => {
    assert.ok(
      looksLikeMermaidSource('flowchart TD\n  A-->B')
    );
  });

  test('계획 요약 TODO는 mermaid가 아니다', () => {
    const summary = [
      '## Plan',
      '',
      '### 진행 순서 (TODO)',
      '',
      '1. backend-rs/src/db.rs 생성',
      '2. lib.rs 수정'
    ].join('\n');
    assert.ok(!looksLikeMermaidSource(summary));
  });
});

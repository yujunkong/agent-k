import * as assert from 'assert';
import {
  buildPlanChatSummary,
  looksLikePlanDocument
} from '../../../src/chat/planPromote';

suite('buildPlanChatSummary', () => {
  test('전체 문서 대신 요약 + TODO 순서를 만든다', () => {
    const plan = [
      '# Rust Migration Plan',
      '',
      '## Context',
      'Python API 백엔드를 Rust로 점진 이전한다. 호환 레이어를 유지하며 라우터부터 옮긴다.',
      '성공 기준은 기존 통합 테스트 통과와 p95 지연 유지이다.',
      '',
      '## Architecture',
      'Before: Python FastAPI. After: Rust axum + shared DB.',
      '',
      '## TODOs',
      '- [ ] 스키마 정의',
      '- [ ] 라우터 이식',
      '- [ ] 통합 테스트',
      '',
      '## Risks',
      '- 일정 지연 가능'
    ].join('\n');
    assert.ok(looksLikePlanDocument(plan));
    const summary = buildPlanChatSummary(plan);
    assert.ok(/승인/.test(summary));
    assert.ok(/진행 순서/.test(summary));
    assert.ok(/1\. 스키마 정의/.test(summary));
    assert.ok(/2\. 라우터 이식/.test(summary));
    assert.ok(!/## Risks/.test(summary));
  });
});

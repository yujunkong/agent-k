/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import {
  buildPlanChatSummary,
  looksLikePlanDocument,
  looksLikePlanDraft
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

  test('Questions & Answers 섹션을 확인된 답변으로 남긴다', () => {
    const plan = [
      '# Feature Plan',
      '',
      '## Context',
      '로그인 UX를 개선한다.',
      '',
      '## Questions & Answers',
      '- Q: 인증 방식? A: OAuth + 세션',
      '- Q: 대상? A: 웹만',
      '',
      '## TODOs',
      '- [ ] OAuth 연동',
      '- [ ] 세션 스토어'
    ].join('\n');
    const summary = buildPlanChatSummary(plan);
    assert.ok(/확인된 답변/.test(summary));
    assert.ok(/OAuth \+ 세션/.test(summary));
    assert.ok(/웹만/.test(summary));
    assert.ok(/1\. OAuth 연동/.test(summary));
  });

  test('헤더 없는 Step 체크리스트도 초안으로 인식한다', () => {
    const draft = [
      '구현 순서입니다.',
      '',
      '- [ ] **Step 1: handlers** — src/handlers.rs',
      '- [ ] **Step 2: DB 쿼리 레이어** — src/db.rs',
      '- [ ] **Step 3: proxy-gw** — proxy-gw/src/main.rs',
      '- [ ] **Step 4: DB 마이그레이션**',
      '- [ ] **Step 5: 통합 테스트**',
      '- [ ] **Step 6: 빌드 & 실행**',
      '',
      '상세 구현 노트와 리스크를 포함한 긴 본문입니다. '.repeat(20)
    ].join('\n');
    assert.ok(looksLikePlanDraft(draft));
    assert.ok(looksLikePlanDocument(draft));
  });
});

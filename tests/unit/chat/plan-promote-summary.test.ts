/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import {
  buildPlanChatSummary,
  looksLikePlanDocument,
  looksLikePlanDraft,
  looksLikePlanChatSummary,
  looksLikePlanWritingStart,
  looksLikeResearchNarration,
  looksLikePlanFsmNarration,
  stripPlanFsmNarration,
  stripPlanInternalMonologue
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
    assert.ok(/Confirm|View Plans/.test(summary));
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

  test('promote 요약 버블을 인식한다', () => {
    const plan = [
      '# Demo Plan',
      '',
      '## Context',
      '짧은 설명',
      '',
      '## TODOs',
      '- [ ] 한 일',
      '- [ ] 두 일',
      '- [ ] 세 일',
      '- [ ] 네 일',
      '- [ ] 다섯 일'
    ].join('\n');
    const summary = buildPlanChatSummary(plan);
    assert.ok(looksLikePlanChatSummary(summary));
    assert.ok(!looksLikePlanChatSummary(plan));
  });

  test('작성 시작은 탐색 문구가 아니라 계획 본문일 때만', () => {
    assert.ok(!looksLikePlanWritingStart(''));
    assert.ok(!looksLikePlanWritingStart('코드를 조금 더 살펴보겠습니다.'));
    assert.ok(looksLikePlanWritingStart('계획 문서 작성을 시작합니다.\n\n# Plan'));
    assert.ok(
      looksLikePlanWritingStart(
        [
          '# Naemeoni Rust 전환 마스터 플랜',
          '',
          '## Context',
          'Python 백엔드를 Rust로 점진 이전한다. 호환 레이어를 유지한다.',
          '',
          '- [ ] 스키마 정의'
        ].join('\n')
      )
    );
  });

  test('탐색/대화 나레이션은 Plan으로 승격하지 않는다', () => {
    const narration = [
      '안녕하세요! 프로젝트의 문제점을 파악하고 개선사항을 만들기 위해 먼저 프로젝트 구조를 살펴보겠습니다.',
      '',
      '이제 핵심 파일들의 코드 품질과 아키텍처를 더 파악하겠습니다.',
      '',
      'Let me dig deeper into specific code areas to identify issues more precisely.',
      '',
      'Let me check a few more things before drafting the plan.',
      '',
      '이제 충분한 정보를 확보했습니다. 분석 결과를 종합하겠습니다.',
      '',
      '프로젝트 전체를 분석한 결과를 종합했습니다. 꽤 방대한 코드베이스인데, 핵심 이슈들을 정리했습니다.',
      '정식 plan 문서를 만들기 전에, 한 가지 범위를 확인하고 싶습니다.'
    ].join('\n');
    assert.ok(looksLikeResearchNarration(narration));
    assert.ok(!looksLikePlanDocument(narration));
    assert.ok(!looksLikePlanDraft(narration));
    assert.ok(!looksLikePlanWritingStart(narration));
  });

  test('헤더만 있고 체크리스트 없는 문서는 Plan이 아니다', () => {
    const fake = [
      '# Analysis Notes',
      '',
      '## Context',
      '코드를 많이 읽었습니다. '.repeat(30),
      '',
      '## Overview',
      '아직 TODO는 없습니다.'
    ].join('\n');
    assert.ok(!looksLikePlanDocument(fake));
    assert.ok(!looksLikePlanDraft(fake));
  });

  test('plan_* 도구 서술은 research narration / FSM narration으로 본다', () => {
    const meta = [
      'Let me now write the plan.',
      'Good, the summary has been presented. Now I need to call plan_next_stage to advance to the review stage.',
      "The plan has been presented and I'm now in the Review stage. I should wait for the user's feedback - they can either Confirm (승인) or Reject (반려) the plan."
    ].join('\n');
    assert.ok(looksLikePlanFsmNarration(meta));
    assert.ok(looksLikeResearchNarration(meta));
    assert.ok(!looksLikePlanDocument(meta));
    const cleaned = stripPlanFsmNarration(meta);
    assert.ok(!/plan_next_stage/.test(cleaned));
    assert.ok(/Let me now write the plan/.test(cleaned));
  });

  test('영문 CoT monologue를 본문에서 제거한다', () => {
    const mixed = [
      '## Low',
      '- format util path',
      '',
      'The user wants me to analyze their project for issues and create a fix plan. They\'ve pointed to three folders.'
    ].join('\n');
    const cleaned = stripPlanInternalMonologue(mixed);
    assert.ok(/format util/.test(cleaned));
    assert.ok(!/The user wants me/.test(cleaned));
  });
});

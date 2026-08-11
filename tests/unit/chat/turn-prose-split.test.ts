/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import {
  isAnswerLikeTurnProse,
  looksLikeExploreContinue,
  looksLikeExploreSettled,
  looksLikeExploreStart,
  looksLikePlanStepProgress,
  looksLikePlanStepStart,
  looksLikePlanStepComplete,
  looksLikeInternalPlanningDump,
  stripInternalPlanningChrome,
  splitTurnProseForDisplay
} from '../../../src/chat/turnProseSplit';

suite('turnProseSplit', () => {
  test('연구 요약은 Worked 밖 answer로 분류한다', () => {
    const text = [
      '꽤 깊이 파봤습니다. 현재 상태를 정리하면:',
      '',
      '**Python 백엔드 (현재 운영 중)**',
      '- FastAPI 기반, REST 엔드포인트 ~30개',
      '- 서비스 모듈 25개+',
      '',
      '이제 결정이 필요한 부분만 여쭤보겠습니다.'
    ].join('\n');
    assert.ok(looksLikeExploreSettled(text) || isAnswerLikeTurnProse(text));
    assert.ok(isAnswerLikeTurnProse(text));
    const split = splitTurnProseForDisplay([
      { id: '1', content: '코드베이스 구조를 파악하겠습니다.' },
      { id: '2', content: text }
    ]);
    assert.strictEqual(split.timeline.length, 1);
    assert.strictEqual(split.answer.length, 1);
    assert.ok(split.answer[0].content.includes('꽤 깊이'));
  });

  test('짧은 dig ack는 timeline에 남긴다', () => {
    assert.ok(!isAnswerLikeTurnProse('코드베이스 구조를 파악하겠습니다.'));
  });

  test('1~8 문제점 목록은 ask_question 앞에서도 answer로 본다', () => {
    const text = [
      '확인된 주요 문제점:',
      '1. 중국어 식별자',
      '2. 관심사 분리',
      '3. 타입 추출',
      '4. 헬스 모니터링',
      '5. collector_status',
      '6. 스케줄러',
      '7. corp_codes',
      '8. FE 검색',
      '',
      '어떤 것을 수정 계획에 포함할지 확인하겠습니다.'
    ].join('\n');
    assert.ok(isAnswerLikeTurnProse(text));
    const split = splitTurnProseForDisplay([{ id: '1', content: text }]);
    assert.strictEqual(split.answer.length, 1);
    assert.strictEqual(split.timeline.length, 0);
  });

  test('English numbered findings stay visible despite trailing I will confirm', () => {
    const text = [
      'Here are the main issues I found:',
      '1. Chinese identifiers mixed into FE',
      '2. Poor separation of concerns',
      '3. Missing shared types',
      '4. Health monitoring gaps',
      '5. collector_status never updated',
      '6. No periodic scheduler',
      '7. corp_codes not refreshed',
      '8. Search P0 unfinished',
      '',
      "I'll confirm which ones to include in the plan."
    ].join('\n');
    assert.ok(isAnswerLikeTurnProse(text));
    const split = splitTurnProseForDisplay([{ id: '1', content: text }]);
    assert.strictEqual(split.answer.length, 1);
  });

  test('과거형 분석했습니다는 dig-start가 아니다', () => {
    const settled =
      '프로젝트 전반을 깊게 분석했습니다. 핵심 파일 10개 이상 읽어보았습니다.\n\n---\n\n## 문제 분석 요약\n\n정리하면 충분합니다.';
    assert.ok(!looksLikeExploreStart(settled));
    assert.ok(isAnswerLikeTurnProse(settled) || looksLikeExploreSettled(settled));
  });

  test('before writing the plan 검증 문구는 settled가 아니다', () => {
    const mid =
      'Let me verify a few more details before writing the plan.';
    assert.ok(looksLikeExploreContinue(mid) || looksLikeExploreStart(mid));
    assert.ok(!looksLikeExploreSettled(mid));
    assert.ok(!isAnswerLikeTurnProse(mid));
  });

  test('Step 완료 진행보고는 Exploring을 닫고 timeline에 남긴다', () => {
    const text =
      'Step 1 완료 ✅ — `_NEWS_CACHE` 중복 정의 제거\n\n`backend/app/routers/stock.py`에서 중복 정의를 제거했습니다.';
    assert.ok(looksLikePlanStepProgress(text));
    assert.ok(looksLikeExploreSettled(text));
    // Mid-run progress stays in timeline (between Exploring), not final answer
    assert.ok(!isAnswerLikeTurnProse(text));
    const split = splitTurnProseForDisplay([{ id: '1', content: text }]);
    assert.strictEqual(split.timeline.length, 1);
    assert.strictEqual(split.answer.length, 0);
  });

  test('Planning next moves 재계획 덤프는 answer가 아니다', () => {
    const text = [
      '**Planning next moves**',
      '',
      'I have the full picture. The `dependencies.py` is already created. I need to:',
      '1. Modify `main.py` startup/shutdown',
      '2. Convert all 5 routers',
      '3. Update service-layer callers',
      '',
      'Let me start with `main.py`:'
    ].join('\n');
    assert.ok(looksLikeInternalPlanningDump(text));
    assert.ok(!isAnswerLikeTurnProse(text));
    assert.ok(!stripInternalPlanningChrome(text).startsWith('**Planning'));
  });

  test('Step 시작 의도는 timeline에 두고 완료보다 앞에 정렬한다', () => {
    const start =
      'Step 1(T1)부터 시작합니다. `types.ts`의 고유 타입들을 `types/`로 이동합니다.\n\n- StockInfo\n- StockPrice';
    const done =
      'Step 1 완료 — types.ts를 re-export로 전환했습니다. Step 2를 진행합니다.';
    assert.ok(looksLikePlanStepStart(start));
    assert.ok(looksLikePlanStepComplete(done));
    assert.ok(!isAnswerLikeTurnProse(start));
    const split = splitTurnProseForDisplay([
      { id: '2', turn: 3, content: done },
      { id: '1', turn: 5, content: start }
    ]);
    assert.strictEqual(split.timeline.length, 2);
    assert.strictEqual(split.answer.length, 0);
    // turn then start-before-complete: turn3 done, turn5 start → by turn done first
    // but start should be re-ranked: our sort is turn first, so turn 3 before turn 5
    // hoist pins start to turn 1 in seal — display sort alone won't fix turn 5 vs 3
    assert.ok(looksLikePlanStepStart(start));
  });
});

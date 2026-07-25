/**
 * C5-T13: 단위 테스트 — ComplexityHeuristic (키워드/파일 수 임계값)
 */
import * as assert from 'assert';
import { ComplexityHeuristic } from '../../../src/plan/ComplexityHeuristic';

suite('ComplexityHeuristic', () => {
  test('파일 수 임계값 — 3개 이상 감지', () => {
    const h = new ComplexityHeuristic(3);
    const result = h.analyze('refactor auth module', 4);
    assert.strictEqual(result.shouldSuggestPlan, true);
    assert.ok(result.reasons.some(r => r.includes('4 files')));
  });

  test('파일 수 임계값 미만 — 감지 안 됨', () => {
    const h = new ComplexityHeuristic(3);
    const result = h.analyze('fix bug in login', 1);
    assert.strictEqual(result.shouldSuggestPlan, false);
  });

  test('마이그레이션 키워드 감지 (한국어)', () => {
    const h = new ComplexityHeuristic(5);
    const result = h.analyze('데이터베이스 마이그레이션', 1);
    assert.strictEqual(result.shouldSuggestPlan, true);
    assert.ok(result.matchedKeywords.includes('마이그레이션'));
  });

  test('리팩터 키워드 감지 (영어)', () => {
    const h = new ComplexityHeuristic(5);
    const result = h.analyze('refactor the entire auth system', 1);
    assert.strictEqual(result.shouldSuggestPlan, true);
    assert.ok(result.reasons.length > 0);
  });

  test('아키텍처 키워드 감지', () => {
    const h = new ComplexityHeuristic(5);
    const result = h.analyze('새로운 아키텍처 도입', 1);
    assert.strictEqual(result.shouldSuggestPlan, true);
  });

  test('단순 요청 — Plan 제안 안 함', () => {
    const h = new ComplexityHeuristic(3);
    const result = h.analyze('add a comment to the function', 1);
    assert.strictEqual(result.shouldSuggestPlan, false);
  });

  test('경고 메시지 빌드', () => {
    const h = new ComplexityHeuristic(2);
    const result = h.analyze('refactor', 3);
    const msg = h.buildSuggestion(result);
    assert.ok(msg.includes('Plan Mode Recommended'));
    assert.ok(msg.includes('/plan'));
  });

  test('빈 결과 — 경고 메시지 없음', () => {
    const h = new ComplexityHeuristic(10);
    const result = h.analyze('simple change', 1);
    assert.strictEqual(h.buildSuggestion(result), '');
  });

  test('임계값 설정 가능', () => {
    const h1 = new ComplexityHeuristic(2);
    const h2 = new ComplexityHeuristic(10);
    assert.strictEqual(h1.analyze('update', 3).shouldSuggestPlan, true);
    assert.strictEqual(h2.analyze('update', 3).shouldSuggestPlan, false);
  });
});

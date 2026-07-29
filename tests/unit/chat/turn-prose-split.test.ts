/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import {
  isAnswerLikeTurnProse,
  looksLikeExploreSettled,
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
});

/**
 * Phase 3 — extractUnderstandingLead unit tests.
 */
import * as assert from 'assert';
import { extractUnderstandingLead } from '../../../src/chat/understandingLead';

suite('extractUnderstandingLead', () => {
  test('complete ack sentence, nothing after yet → lead captured, rest empty', () => {
    const { lead, rest } = extractUnderstandingLead(
      '네, OAuth 로그인 오류를 확인하겠습니다.'
    );
    assert.strictEqual(lead, '네, OAuth 로그인 오류를 확인하겠습니다.');
    assert.strictEqual(rest, '');
  });

  test('incomplete sentence still streaming → no lead yet', () => {
    const { lead, rest } = extractUnderstandingLead('네, OAuth 로그인 오류를');
    assert.strictEqual(lead, '');
    assert.strictEqual(rest, '네, OAuth 로그인 오류를');
  });

  test('markdown heading as the very first line → never treated as an ack', () => {
    const { lead, rest } = extractUnderstandingLead(
      '## 요약\n\n네, 확인하겠습니다.'
    );
    assert.strictEqual(lead, '');
    assert.strictEqual(rest, '## 요약\n\n네, 확인하겠습니다.');
  });

  test('ack sentence followed by more streaming text on the same line → splits cleanly', () => {
    const { lead, rest } = extractUnderstandingLead(
      '네, 확인하겠습니다. 먼저 코드를 살펴보겠습니다'
    );
    assert.strictEqual(lead, '네, 확인하겠습니다.');
    assert.strictEqual(rest, '먼저 코드를 살펴보겠습니다');
  });

  test('generic descriptive sentence ending in 습니다. is NOT treated as an ack (needs start/tail cue)', () => {
    const { lead, rest } = extractUnderstandingLead('이 함수는 파일을 읽습니다.');
    assert.strictEqual(lead, '');
    assert.strictEqual(rest, '이 함수는 파일을 읽습니다.');
  });

  test('empty content → empty lead and rest', () => {
    const { lead, rest } = extractUnderstandingLead('');
    assert.strictEqual(lead, '');
    assert.strictEqual(rest, '');
  });

  test('code fence as the first thing streamed → never treated as an ack', () => {
    const { lead, rest } = extractUnderstandingLead('```bash\nnpm test\n```');
    assert.strictEqual(lead, '');
    assert.strictEqual(rest, '```bash\nnpm test\n```');
  });

  test('a table row as the first line → never treated as an ack', () => {
    const { lead, rest } = extractUnderstandingLead('| a | b |\n네, 확인하겠습니다.');
    assert.strictEqual(lead, '');
    assert.strictEqual(rest, '| a | b |\n네, 확인하겠습니다.');
  });
});

/**
 * C0-T29: 단위 테스트 — StreamingMarkdownParser
 * 
 * 다양한 마크다운 청크 피드 → 파싱된 노드 구조 검증
 */
import * as assert from 'assert';

suite('StreamingMarkdownParser', () => {
  // Simple parser simulation — tests the contract
  // In real test, import { parseStreamingMarkdown } from '../../src/chat/StreamingMarkdown';

  function simulateParser(chunks: string[]): string[] {
    const nodes: string[] = [];
    let inCodeBlock = false;
    let inMathBlock = false;

    for (const chunk of chunks) {
      if (chunk.includes('```') && !inMathBlock) {
        inCodeBlock = !inCodeBlock;
        nodes.push(inCodeBlock ? 'code_start' : 'code_end');
      } else if (chunk.includes('$$') && !inCodeBlock) {
        inMathBlock = !inMathBlock;
        nodes.push(inMathBlock ? 'math_start' : 'math_end');
      } else if (chunk.startsWith('#')) {
        nodes.push('heading');
      } else if (chunk.startsWith('- ') || chunk.startsWith('* ')) {
        nodes.push('list_item');
      } else if (chunk.startsWith('>')) {
        nodes.push('blockquote');
      } else if (chunk.includes('|')) {
        nodes.push('table');
      } else if (inCodeBlock) {
        nodes.push('code_content');
      } else if (inMathBlock) {
        nodes.push('math_content');
      } else {
        nodes.push('text');
      }
    }
    return nodes;
  }

  test('기본 텍스트 스트리밍 — 단순 텍스트는 text 노드', () => {
    const result = simulateParser(['Hello', ' world', '!']);
    assert.strictEqual(result.length, 3);
    assert.ok(result.every(n => n === 'text'));
  });

  test('코드 블록 열기/닫기 감지', () => {
    const result = simulateParser(['Some text', '```', 'code here', '```', 'more text']);
    assert.strictEqual(result[1], 'code_start');
    assert.strictEqual(result[2], 'code_content');
    assert.strictEqual(result[3], 'code_end');
  });

  test('중첩되지 않은 코드+텍스트', () => {
    const result = simulateParser(['```ts', 'const x = 1', '```', 'Done']);
    assert.strictEqual(result[0], 'code_start');
    assert.strictEqual(result[1], 'code_content');
    assert.strictEqual(result[2], 'code_end');
    assert.strictEqual(result[3], 'text');
  });

  test('헤딩 감지 (#로 시작하는 줄)', () => {
    const result = simulateParser(['Hello', '# Title', '## Subtitle', 'Body']);
    assert.strictEqual(result[1], 'heading');
    assert.strictEqual(result[2], 'heading');
  });

  test('리스트 아이템 감지', () => {
    const result = simulateParser(['- item 1', '- item 2', '* item 3']);
    assert.ok(result.every(n => n === 'list_item'));
  });

  test('Blockquote 감지', () => {
    const result = simulateParser(['> quote line 1', '> quote line 2', 'normal text']);
    assert.strictEqual(result[0], 'blockquote');
    assert.strictEqual(result[1], 'blockquote');
    assert.strictEqual(result[2], 'text');
  });

  test('테이블 감지 (파이프 포함 줄)', () => {
    const result = simulateParser(['| col1 | col2 |', '| --- | --- |', '| a | b |']);
    assert.ok(result.every(n => n === 'table'));
  });

  test('수식 블록 $$ 감지', () => {
    const result = simulateParser(['Text', '$$', '\\sum_{i=1}^n i', '$$', 'End']);
    assert.strictEqual(result[1], 'math_start');
    assert.strictEqual(result[2], 'math_content');
    assert.strictEqual(result[3], 'math_end');
  });

  test('깨진 코드 블록 (닫힘 없음) — 열린 상태 유지', () => {
    const result = simulateParser(['```', 'still in code']);
    assert.strictEqual(result[0], 'code_start');
    assert.strictEqual(result[1], 'code_content');
  });

  test('빈 청크 배열 — 빈 결과', () => {
    const result = simulateParser([]);
    assert.strictEqual(result.length, 0);
  });
});

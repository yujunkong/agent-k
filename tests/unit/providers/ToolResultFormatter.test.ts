/**
 * C0-T29: 단위 테스트 — ToolResultFormatter (OpenAI/Anthropic/Custom)
 */
import * as assert from 'assert';

suite('ToolResultFormatter', () => {
  interface ToolResult {
    toolCallId: string;
    name: string;
    content: string;
    isError?: boolean;
  }

  function formatOpenAI(results: ToolResult[]): any[] {
    return results.map(r => ({
      role: 'tool',
      tool_call_id: r.toolCallId,
      content: r.isError ? `Error: ${r.content}` : r.content
    }));
  }

  function formatAnthropic(results: ToolResult[]): any[] {
    return results.map(r => ({
      type: 'tool_result',
      tool_use_id: r.toolCallId,
      content: r.isError ? [{ type: 'text', text: `Error: ${r.content}` }] : [{ type: 'text', text: r.content }]
    }));
  }

  function formatCustom(results: ToolResult[]): any[] {
    return results.map(r => ({
      tool_call_id: r.toolCallId,
      tool_name: r.name,
      output: r.content.slice(0, 32000), // 32KB truncation
      is_error: r.isError || false
    }));
  }

  test('OpenAI 형식: 기본 툴 결과 포맷', () => {
    const result = formatOpenAI([{ toolCallId: 'call_1', name: 'grep', content: 'file.ts:10: match' }]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, 'tool');
    assert.strictEqual(result[0].tool_call_id, 'call_1');
  });

  test('OpenAI 형식: 에러 포함', () => {
    const result = formatOpenAI([{ toolCallId: 'call_2', name: 'edit_file', content: 'File not found', isError: true }]);
    assert.ok(result[0].content.startsWith('Error:'));
  });

  test('Anthropic 형식: 기본 포맷', () => {
    const result = formatAnthropic([{ toolCallId: 'call_1', name: 'grep', content: 'result' }]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'tool_result');
    assert.strictEqual(result[0].tool_use_id, 'call_1');
    assert.strictEqual(result[0].content[0].type, 'text');
  });

  test('Anthropic 형식: 에러 포함', () => {
    const result = formatAnthropic([{ toolCallId: 'call_2', name: 'edit_file', content: 'Error!', isError: true }]);
    assert.ok(result[0].content[0].text.startsWith('Error:'));
  });

  test('Custom 형식: 기본 포맷', () => {
    const result = formatCustom([{ toolCallId: 'call_1', name: 'grep', content: 'result' }]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tool_call_id, 'call_1');
    assert.strictEqual(result[0].tool_name, 'grep');
  });

  test('Custom 형식: 32KB 트렁케이션', () => {
    const longContent = 'a'.repeat(40000);
    const result = formatCustom([{ toolCallId: 'call_1', name: 'read_file', content: longContent }]);
    assert.ok(result[0].output.length <= 32000);
  });

  test('Custom 형식: 에러 플래그', () => {
    const result = formatCustom([{ toolCallId: 'call_3', name: 'run_terminal_cmd', content: 'Command failed', isError: true }]);
    assert.strictEqual(result[0].is_error, true);
  });

  test('빈 결과 배열', () => {
    assert.strictEqual(formatOpenAI([]).length, 0);
    assert.strictEqual(formatAnthropic([]).length, 0);
    assert.strictEqual(formatCustom([]).length, 0);
  });

  test('다중 결과', () => {
    const results: ToolResult[] = [
      { toolCallId: 'call_1', name: 'grep', content: 'a' },
      { toolCallId: 'call_2', name: 'glob', content: 'b' },
      { toolCallId: 'call_3', name: 'read_file', content: 'c', isError: true }
    ];
    const openai = formatOpenAI(results);
    assert.strictEqual(openai.length, 3);
    assert.strictEqual(openai[0].tool_call_id, 'call_1');
    assert.strictEqual(openai[2].tool_call_id, 'call_3');
  });
});

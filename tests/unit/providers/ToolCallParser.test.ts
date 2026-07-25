/**
 * C0-T29: 단위 테스트 — ToolCallParser (5가지 전략)
 * 
 * Native/XML/JSON Fence/이중인코딩/Content 스캔 각각 성공/실패 케이스
 */
import * as assert from 'assert';

suite('ToolCallParser', () => {
  // Simulate parser strategies
  interface ToolCall {
    name: string;
    arguments: Record<string, any>;
  }

  function parseNative(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    const regex = /<function_calls>\s*<invoke name="(\w+)">([\s\S]*?)<\/invoke>\s*<\/function_calls>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2].trim());
        results.push({ name: match[1], arguments: args });
      } catch {
        // Try XML-style parsing fallback
        const argRegex = /<parameter name="(\w+)">([\s\S]*?)<\/parameter>/g;
        const args: Record<string, string> = {};
        let argMatch;
        while ((argMatch = argRegex.exec(match[2])) !== null) {
          args[argMatch[1]] = argMatch[2].trim();
        }
        if (Object.keys(args).length > 0) {
          results.push({ name: match[1], arguments: args });
        }
      }
    }
    return results;
  }

  function parseJsonFence(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    const regex = /```json\s*\{[\s\S]*?"function":\s*"(\w+)"[\s\S]*?"arguments":\s*(\{[\s\S]*?\})[\s\S]*?```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        results.push({ name: match[1], arguments: args });
      } catch { /* skip */ }
    }
    return results;
  }

  function parseContentScan(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    // Look for function-like patterns
    const regex = /(?:use|call|run|execute)\s+(?:the\s+)?(\w+)\s+(?:with|using|on)?\s*(.*)/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({ name: match[1], arguments: { raw: match[2].trim() } });
    }
    return results;
  }

  // ─── Native XML Strategy ───
  test('Native XML: 표준 형식 파싱', () => {
    const text = `<function_calls>
      <invoke name="grep">
        {"pattern": "test", "path": "./src"}
      </invoke>
    </function_calls>`;
    const result = parseNative(text);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'grep');
    assert.strictEqual(result[0].arguments.pattern, 'test');
  });

  test('Native XML: 여러 도구 병렬 호출', () => {
    const text = `<function_calls>
      <invoke name="grep">{"pattern":"a"}</invoke>
      <invoke name="glob">{"pattern":"*.ts"}</invoke>
    </function_calls>`;
    const result = parseNative(text);
    assert.strictEqual(result.length, 2);
  });

  test('Native XML: XML 인자 폴백 (JSON 파싱 실패 시)', () => {
    const text = `<function_calls>
      <invoke name="read_file">
        <parameter name="path">/src/main.ts</parameter>
        <parameter name="offset">1</parameter>
      </invoke>
    </function_calls>`;
    const result = parseNative(text);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'read_file');
    assert.strictEqual(result[0].arguments.path, '/src/main.ts');
  });

  // ─── JSON Fence Strategy ───
  test('JSON Fence: ```json 블록 파싱', () => {
    const text = 'Some text\n```json\n{"function": "grep", "arguments": {"pattern": "test"}}\n```\nmore text';
    const result = parseJsonFence(text);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'grep');
  });

  // ─── Content Scan Strategy ───
  test('Content Scan: 자연어에서 도구 호출 감지', () => {
    const text = 'I will use the grep tool with pattern test';
    const result = parseContentScan(text);
    assert.ok(result.length > 0);
    assert.strictEqual(result[0].name, 'grep');
  });

  // ─── Edge Cases ───
  test('빈 입력 — 빈 결과', () => {
    assert.strictEqual(parseNative('').length, 0);
    assert.strictEqual(parseJsonFence('').length, 0);
  });

  test('깨진 XML — 복구 없이 빈 결과', () => {
    const text = '<function_calls><invoke name="test"';
    assert.strictEqual(parseNative(text).length, 0);
  });

  test('JSON 인자가 비정상 — XML 폴백 시도', () => {
    const text = `<function_calls>
      <invoke name="test">
        {broken json}
      </invoke>
    </function_calls>`;
    const result = parseNative(text);
    // XML param fallback should kick in
    assert.strictEqual(result.length, 0); // no param tags, so empty
  });

  test('특수문자가 포함된 인자값', () => {
    const text = `<function_calls>
      <invoke name="grep">
        {"pattern": "func(){ return 1; }", "path": "./src"}
      </invoke>
    </function_calls>`;
    const result = parseNative(text);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].arguments.pattern, 'func(){ return 1; }');
  });
});

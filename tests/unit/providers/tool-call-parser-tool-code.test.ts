/**
 * ToolCallParser — tool_code / name\\n{json} recovery (Qwen dumps)
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { toolCallParser } from '../../../src/providers/ToolCallParser';
import { stripFakeToolMarkup } from '../../../src/chat/displaySanitize';

describe('ToolCallParser tool_code recovery', () => {
  test('parses <tool_code> run_terminal_cmd + cmd json', () => {
    const raw = `<tool_code>
run_terminal_cmd
{"cmd": "cd /tmp && cargo check 2>&1", "description": "Rust build"}
</tool_code>`;
    const parsed = toolCallParser.parse(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'run_terminal_cmd');
    assert.equal(parsed[0].arguments.command, 'cd /tmp && cargo check 2>&1');
    assert.equal(parsed[0].strategy, 'tool-code');
  });

  test('parses bare name\\n{json} write_file', () => {
    const raw = `Creating main.rs now.

write_file
{"path": "src/main.rs", "content": "fn main() {}"}
`;
    const parsed = toolCallParser.parse(raw);
    assert.ok(parsed.some((p) => p.name === 'write_file'));
    const w = parsed.find((p) => p.name === 'write_file')!;
    assert.equal(w.arguments.path, 'src/main.rs');
    assert.match(String(w.arguments.content), /fn main/);
  });

  test('stripFakeToolMarkup removes tool_code dumps from display', () => {
    const raw = `검증합니다.

tool_code
run_terminal_cmd
{"cmd": "cargo check", "description": "check"}

완료.`;
    const cleaned = stripFakeToolMarkup(raw);
    assert.doesNotMatch(cleaned, /cargo check/);
    assert.doesNotMatch(cleaned, /tool_code/i);
    assert.match(cleaned, /검증합니다/);
  });
});

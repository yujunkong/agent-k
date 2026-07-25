/**
 * HARB-T19: AC-4 JSON Recovery (PRD-real)
 *
 * 깨진 tool JSON 10종 → ToolCallParser ≥80% 복구
 */
import * as assert from 'assert';

import { ToolCallParser } from '../../../src/providers/ToolCallParser';
import { AgentLoopController } from '../../../src/loop/AgentLoopController';

const BROKEN_TOOL_JSON_SAMPLES: string[] = [
  'Sure! ```json\n{"name":"grep","arguments":{"pattern":"foo"}}\n```',
  '<tool name="read_file">{"path":"src/a.ts"}</tool>',
  'Use this:\n```json\n{"name":"glob","arguments":{"pattern":"**/*.ts"}}\n```\nDone',
  'Trailing garbage ```json\n{"name":"list_dir","arguments":{"path":"."}}\n``` ok',
  '<tool name="grep">{"pattern":"bar"}</tool>',
  'Model said: ```json\n{"name":"read_lints","arguments":{"paths":["a.ts"]}}\n```',
  '<tool name="codebase_search">{"query":"auth flow"}</tool>',
  '```json\n{"name":"edit_file","arguments":{"path":"x.ts"}}\n```',
  'Almost valid ```json\n{"name":"read_file","arguments":{"path":"m.ts"}}\n``` end',
  '<tool name="run_terminal_cmd">{"command":"npm test"}</tool>',
];

suite('HARB AC-4: JSON Recovery', () => {
  test('AC-4: ToolCallParser recovers ≥8/10 broken payloads', () => {
    const parser = new ToolCallParser();
    let recovered = 0;

    for (const sample of BROKEN_TOOL_JSON_SAMPLES) {
      const calls = parser.parse(sample);
      if (calls.length > 0 && calls[0].name) {
        recovered += 1;
      }
    }

    assert.ok(
      recovered >= 8,
      `Expected ≥8 parses, got ${recovered}/10`
    );
  });

  test('AC-4: total parse failure increments controller jsonParseFailures', async () => {
    const loop = new AgentLoopController({
      mode: 'agent',
      maxTurns: 1,
      modelId: 'flash',
      mockResponse: {
        content: '```json\n{"name":"grep","arguments": broken\n```'
      }
    });

    await loop.start('trigger mock');
    assert.ok(loop.getJsonParseFailures() >= 1, 'Should record JSON parse failure');

    loop.recordJsonParseFailure(2);
    assert.ok(loop.getJsonParseFailures() >= 3);
  });
});

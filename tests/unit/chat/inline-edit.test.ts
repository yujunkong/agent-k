/**
 * Inline Edit 1-4d — instruction vs selection stay separate.
 */
import * as assert from 'assert';
import {
  formatInlineEditForPayload,
  inlineEditFileLabel,
  inlineEditLineCount,
  inlineEditRangeLabel,
  parseInlineEditHostMessage,
  toInlineEditAgentRequest
} from '../../../src/chat/inlineEdit';

suite('inlineEdit', () => {
  const hostMsg = {
    type: 'inline.edit.request',
    requestId: 'inline_abc',
    instruction: 'async/await로 리팩터링해',
    selection: {
      uri: 'file:///d:/workspace/agent-k/src/foo.ts',
      languageId: 'typescript',
      startLine: 41,
      startCharacter: 0,
      endLine: 57,
      endCharacter: 2,
      selectedText: Array.from({ length: 17 }, (_, i) => `line ${i + 1}`).join('\n')
    }
  };

  test('parseInlineEditHostMessage maps startCharacter → startColumn', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    assert.strictEqual(parsed!.instruction, 'async/await로 리팩터링해');
    assert.strictEqual(parsed!.context.startLine, 41);
    assert.strictEqual(parsed!.context.startColumn, 0);
    assert.strictEqual(parsed!.context.endLine, 57);
    assert.strictEqual(parsed!.context.endColumn, 2);
    assert.ok(!parsed!.instruction.includes('Selected code'));
    assert.ok(!parsed!.instruction.includes(parsed!.context.selectedText));
  });

  test('composer seed is instruction only — not selected code', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    const seed = parsed!.instruction;
    assert.strictEqual(seed, 'async/await로 리팩터링해');
    assert.ok(!seed.includes('```'));
    assert.ok(!seed.includes('line 1'));
  });

  test('toInlineEditAgentRequest carries instruction + range, not a dumped blob', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    const req = toInlineEditAgentRequest(parsed!.instruction, parsed!.context);
    assert.deepStrictEqual(Object.keys(req).sort(), [
      'endColumn',
      'endLine',
      'instruction',
      'languageId',
      'selectedText',
      'startColumn',
      'startLine',
      'uri'
    ]);
    assert.strictEqual(req.instruction, 'async/await로 리팩터링해');
    assert.strictEqual(req.uri, hostMsg.selection.uri);
    assert.ok(req.selectedText.startsWith('line 1'));
  });

  test('formatInlineEditForPayload is API context, not composer seed', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    const block = formatInlineEditForPayload(parsed!.context);
    assert.ok(block.includes('Inline edit target:'));
    assert.ok(block.includes('src/foo.ts'));
    assert.ok(block.includes('startLine: 41'));
    assert.ok(block.includes('```typescript'));
    assert.ok(block.includes('line 1'));
    assert.ok(!block.includes('async/await로 리팩터링해'));
  });

  test('display helpers: file, 1-based range, line count', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    assert.strictEqual(inlineEditFileLabel(parsed!.context.uri), 'src/foo.ts');
    assert.strictEqual(inlineEditRangeLabel(parsed!.context), 'L42-L58');
    assert.strictEqual(inlineEditLineCount(parsed!.context), 17);
  });

  test('rejects empty selection', () => {
    assert.strictEqual(
      parseInlineEditHostMessage({
        type: 'inline.edit.request',
        instruction: 'x',
        selection: { uri: 'file:///a.ts', selectedText: '' }
      }),
      null
    );
  });
});

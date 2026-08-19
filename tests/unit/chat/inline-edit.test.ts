/**
 * Inline Edit 1-4d — instruction vs selection stay separate.
 */
import * as assert from 'assert';
import {
  formatInlineEditForPayload,
  formatInlineEditStickyContext,
  formatInlineEditSystemContext,
  inlineEditFileLabel,
  inlineEditFsPath,
  inlineEditLineCount,
  inlineEditRangeLabel,
  parseInlineEditAgentRequest,
  parseInlineEditHostMessage,
  toInlineEditAgentRequest
} from '../../../src/chat/inlineEdit';
import { ContextAssembler } from '../../../src/agent/ContextAssembler';

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

  test('parseInlineEditAgentRequest reads chat.send.inlineEdit', () => {
    const req = parseInlineEditAgentRequest({
      instruction: 'async/await로 리팩터링해',
      selectedText: 'const x = 1;',
      uri: 'file:///d:/workspace/agent-k/src/foo.ts',
      languageId: 'typescript',
      startLine: 41,
      startColumn: 0,
      endLine: 57,
      endColumn: 2
    });
    assert.ok(req);
    assert.strictEqual(req!.instruction, 'async/await로 리팩터링해');
    assert.strictEqual(req!.startLine, 41);
    assert.strictEqual(req!.startColumn, 0);
    assert.strictEqual(inlineEditFsPath(req!.uri), 'd:/workspace/agent-k/src/foo.ts');
  });

  test('formatInlineEditSystemContext is rules/target/range only', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    const req = toInlineEditAgentRequest(parsed!.instruction, parsed!.context);
    const block = formatInlineEditSystemContext(req);
    assert.ok(block.includes('## Inline Edit'));
    assert.ok(block.includes(req.uri));
    assert.ok(block.includes('startLine: 41'));
    assert.ok(block.includes('startColumn: 0'));
    assert.ok(block.includes('endLine: 57'));
    assert.ok(block.includes('endColumn: 2'));
    assert.ok(block.includes('L42-L58'));
    assert.ok(block.includes('edit_file'));
    assert.ok(block.includes('oldText'));
    assert.ok(!block.includes(req.instruction));
    assert.ok(!block.includes('```'));
    assert.ok(!block.includes('line 1'));
  });

  test('formatInlineEditStickyContext holds instruction + selected source', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    const req = toInlineEditAgentRequest(parsed!.instruction, parsed!.context);
    const block = formatInlineEditStickyContext(req);
    assert.ok(block.includes('## Inline Edit selection'));
    assert.ok(block.includes(req.instruction));
    assert.ok(block.includes('```typescript'));
    assert.ok(block.includes('line 1'));
    assert.ok(!block.includes('startLine: 41'));
  });

  test('ContextAssembler splits rules into system and source into sticky', () => {
    const parsed = parseInlineEditHostMessage(hostMsg);
    assert.ok(parsed);
    const req = toInlineEditAgentRequest(parsed!.instruction, parsed!.context);
    const assembler = new ContextAssembler();
    const assembly = assembler.assemble(
      'agent',
      [{ role: 'user', content: req.instruction }],
      { tier: 'A', inlineEdit: req, projectRules: '' }
    );
    const system = assembly.slots.find((s) => s.name === 'system')?.content || '';
    const sticky = assembly.slots.find((s) => s.name === 'sticky')?.content || '';
    const firstLine = req.selectedText.split('\n')[0];
    assert.ok(system.includes('## Inline Edit'));
    assert.ok(system.includes(req.uri));
    assert.ok(system.includes('edit_file'));
    assert.ok(!system.includes(firstLine));
    assert.ok(!system.includes(req.instruction));
    assert.ok(sticky.includes('## Inline Edit selection'));
    assert.ok(sticky.includes(firstLine));
    assert.ok(sticky.includes(req.instruction));
    assert.ok(!sticky.includes('startLine: 41'));
  });
});

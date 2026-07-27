/**
 * HARB-T18: AC-3 Ask Mode Accuracy (PRD-real)
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { AgentLoopController } from '../../../src/loop/AgentLoopController';
import { registerReadTools } from '../../../src/tools/readTools';
import { registerEditTools } from '../../../src/tools/editTools';

/** 인용 스니펫이 파일 바이트와 100% 일치하는지 검사 */
export function quoteMatchesFileBytes(filePath: string, quotedSnippet: string): boolean {
  const bytes = fs.readFileSync(filePath);
  const snippetBytes = Buffer.from(quotedSnippet, 'utf-8');
  return bytes.includes(snippetBytes);
}

suite('HARB AC-3: Ask Mode Accuracy', () => {
  let file: string;
  let dir: string;

  suiteSetup(() => {
    registerReadTools();
    registerEditTools();
  });

  setup(() => {
    dir = fs.mkdtempSync(path.join(process.cwd(), '.harb-ac3-'));
    file = path.join(dir, 'sample.ts');
    fs.writeFileSync(file, 'export const ANSWER = 42;\n', 'utf-8');
  });

  teardown(() => {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AC-3: ask mode blocks edit_file; read quote matches disk', async () => {
    const loop = new AgentLoopController({ mode: 'ask', maxTurns: 2, modelId: 'flash', tier: 'A' });

    const edit = await loop.dispatchTool('edit_file', {
      path: file,
      hunks: [{ oldText: '42', newText: '99' }]
    });
    assert.strictEqual(edit.success, false, 'Ask mode must not allow edit_file');

    const read = await loop.dispatchTool('read_file', { path: file });
    assert.strictEqual(read.success, true);
    const content = (read.data as { content?: string }).content || '';
    const snippet = 'export const ANSWER = 42;';
    assert.ok(quoteMatchesFileBytes(file, snippet), 'Quoted snippet must match file bytes exactly');
    assert.ok(content.includes(snippet), 'read_file content should include exact line');
  });
});

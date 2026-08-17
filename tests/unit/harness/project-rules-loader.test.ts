/**
 * ADDON-T08: project rules auto-load unit tests
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadProjectRulesFromFs,
  formatProjectRulesBlock,
  getProjectRulesCached,
  invalidateProjectRulesCache,
  listProjectRuleFiles,
  titleFromRuleContent,
  PROJECT_RULES_FILES,
  DEFAULT_RULES_FILE,
  PROJECT_CUSTOM_RULES_DIR,
} from '../../../src/harness/ProjectRulesLoader';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-rules-'));
}

suite('ADDON-T08 ProjectRulesLoader', () => {
  test('returns empty string when no rules files exist', () => {
    const dir = makeTempDir();
    assert.strictEqual(loadProjectRulesFromFs(dir), '');
  });

  test('loads a single AGENTS.md file', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Always write tests.');
    const content = loadProjectRulesFromFs(dir);
    assert.ok(content.includes('Always write tests.'));
    assert.ok(content.includes('AGENTS.md'));
  });

  test('concatenates multiple rules files in discovery order', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, '.clinerules'), 'clinerules content');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'agents content');
    fs.writeFileSync(path.join(dir, '.agentrules'), 'agentrules content');
    const content = loadProjectRulesFromFs(dir);

    const agentsIdx = content.indexOf('agents content');
    const agentrulesIdx = content.indexOf('agentrules content');
    const clinerulesIdx = content.indexOf('clinerules content');
    assert.ok(agentsIdx >= 0 && agentrulesIdx >= 0 && clinerulesIdx >= 0);
    // PROJECT_RULES_FILES order: AGENTS.md, .cursorrules, .agentrules, .clinerules
    assert.ok(agentsIdx < agentrulesIdx);
    assert.ok(agentrulesIdx < clinerulesIdx);
  });

  test('truncates to maxChars', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'x'.repeat(500));
    const content = loadProjectRulesFromFs(dir, 50);
    assert.ok(content.length < 500);
    assert.ok(content.includes('truncated'));
  });

  test('never throws on missing/invalid rootDir', () => {
    assert.doesNotThrow(() => loadProjectRulesFromFs(''));
    assert.doesNotThrow(() => loadProjectRulesFromFs('/definitely/does/not/exist/xyz'));
  });

  test('formatProjectRulesBlock wraps content with PROJECT RULES header', () => {
    const block = formatProjectRulesBlock('some rule text');
    assert.ok(block.startsWith('## PROJECT RULES'));
    assert.ok(block.includes('some rule text'));
  });

  test('formatProjectRulesBlock is no-op on empty content', () => {
    assert.strictEqual(formatProjectRulesBlock(''), '');
    assert.strictEqual(formatProjectRulesBlock('   '), '');
  });

  test('getProjectRulesCached returns fresh content after file changes', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(filePath, 'first version');
    const first = getProjectRulesCached(dir);
    assert.ok(first.includes('first version'));

    // Force a distinct mtime (some filesystems have coarse mtime resolution)
    const future = new Date(Date.now() + 5000);
    fs.writeFileSync(filePath, 'second version');
    fs.utimesSync(filePath, future, future);

    const second = getProjectRulesCached(dir);
    assert.ok(second.includes('second version'));
    assert.ok(!second.includes('first version'));
  });

  test('invalidateProjectRulesCache clears cache for a specific root', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(filePath, 'v1');
    getProjectRulesCached(dir);
    invalidateProjectRulesCache(dir);
    // Should not throw after invalidation and should re-read from disk
    const content = getProjectRulesCached(dir);
    assert.ok(content.includes('v1'));
  });

  test('PROJECT_RULES_FILES has the four expected file names in order', () => {
    assert.deepStrictEqual(
      [...PROJECT_RULES_FILES],
      ['AGENTS.md', '.cursorrules', '.agentrules', '.clinerules']
    );
  });

  test('listProjectRuleFiles always includes basic .agentrules', () => {
    const dir = makeTempDir();
    const listed = listProjectRuleFiles(dir);
    assert.strictEqual(listed[0]?.kind, 'basic');
    assert.strictEqual(listed[0]?.relPath, DEFAULT_RULES_FILE);
    assert.strictEqual(listed.length, 1);
  });

  test('loads custom rules from .agentk/rules after root files', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.agentk', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agentrules'), 'basic content');
    fs.writeFileSync(path.join(dir, '.agentk', 'rules', 'korean.md'), 'Always respond in Korean');
    fs.writeFileSync(path.join(dir, '.agentk', 'rules', 'skip.bin'), 'not a rule');
    const content = loadProjectRulesFromFs(dir);
    assert.ok(content.includes('basic content'));
    assert.ok(content.includes('Always respond in Korean'));
    assert.ok(content.includes(`${PROJECT_CUSTOM_RULES_DIR}/korean.md`));
    assert.ok(!content.includes('not a rule'));
    assert.ok(content.indexOf('basic content') < content.indexOf('Always respond in Korean'));
  });

  test('listProjectRuleFiles includes custom markdown files', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.agentk', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agentk', 'rules', 'korean.md'), '# Always respond in Korean\n');
    const listed = listProjectRuleFiles(dir);
    assert.strictEqual(listed.length, 2);
    assert.strictEqual(listed[1]?.kind, 'custom');
    assert.strictEqual(listed[1]?.fileName, 'korean.md');
  });

  test('titleFromRuleContent prefers the first heading', () => {
    assert.strictEqual(
      titleFromRuleContent('# Always respond in Korean\n\nDetails', 'fallback'),
      'Always respond in Korean'
    );
    assert.strictEqual(titleFromRuleContent('', '기본 룰'), '기본 룰');
  });
});

/**
 * HARNESS-005 — ProjectRulesLoader unit tests (ported from v2.1 ADDON-T08).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CURSOR_RULES_DIR,
  DEFAULT_RULES_FILE,
  PROJECT_CUSTOM_RULES_DIR,
  PROJECT_RULES_FILES,
  formatProjectRulesBlock,
  getProjectRulesCached,
  invalidateProjectRulesCache,
  listProjectRuleFiles,
  loadProjectRulesFromFs,
  resolveProjectRulesContent,
  titleFromRuleContent,
} from './ProjectRulesLoader';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-rules-'));
}

const tempDirs: string[] = [];

afterEach(() => {
  invalidateProjectRulesCache();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (!dir) break;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

describe('HARNESS-005 ProjectRulesLoader', () => {
  it('returns empty string when no rules files exist', () => {
    expect(loadProjectRulesFromFs(temp())).toBe('');
  });

  it('loads a single AGENTS.md file', () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Always write tests.');
    const content = loadProjectRulesFromFs(dir);
    expect(content).toContain('Always write tests.');
    expect(content).toContain('AGENTS.md');
  });

  it('concatenates multiple rules files in discovery order', () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, '.clinerules'), 'clinerules content');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'agents content');
    fs.writeFileSync(path.join(dir, '.agentrules'), 'agentrules content');
    const content = loadProjectRulesFromFs(dir);

    const agentsIdx = content.indexOf('agents content');
    const agentrulesIdx = content.indexOf('agentrules content');
    const clinerulesIdx = content.indexOf('clinerules content');
    expect(agentsIdx).toBeGreaterThanOrEqual(0);
    expect(agentrulesIdx).toBeGreaterThanOrEqual(0);
    expect(clinerulesIdx).toBeGreaterThanOrEqual(0);
    expect(agentsIdx).toBeLessThan(agentrulesIdx);
    expect(agentrulesIdx).toBeLessThan(clinerulesIdx);
  });

  it('truncates to maxChars', () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'x'.repeat(500));
    const content = loadProjectRulesFromFs(dir, 50);
    expect(content.length).toBeLessThan(500);
    expect(content).toContain('truncated');
  });

  it('never throws on missing/invalid rootDir', () => {
    expect(() => loadProjectRulesFromFs('')).not.toThrow();
    expect(() =>
      loadProjectRulesFromFs('/definitely/does/not/exist/xyz')
    ).not.toThrow();
  });

  it('formatProjectRulesBlock wraps content with PROJECT RULES header', () => {
    const block = formatProjectRulesBlock('some rule text');
    expect(block.startsWith('## PROJECT RULES')).toBe(true);
    expect(block).toContain('some rule text');
  });

  it('formatProjectRulesBlock is no-op on empty content', () => {
    expect(formatProjectRulesBlock('')).toBe('');
    expect(formatProjectRulesBlock('   ')).toBe('');
  });

  it('getProjectRulesCached returns fresh content after file changes', () => {
    const dir = temp();
    const filePath = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(filePath, 'first version');
    const first = getProjectRulesCached(dir);
    expect(first).toContain('first version');

    const future = new Date(Date.now() + 5000);
    fs.writeFileSync(filePath, 'second version');
    fs.utimesSync(filePath, future, future);

    const second = getProjectRulesCached(dir);
    expect(second).toContain('second version');
    expect(second).not.toContain('first version');
  });

  it('invalidateProjectRulesCache clears cache for a specific root', () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'v1');
    getProjectRulesCached(dir);
    invalidateProjectRulesCache(dir);
    expect(getProjectRulesCached(dir)).toContain('v1');
  });

  it('PROJECT_RULES_FILES has the four expected file names in order', () => {
    expect([...PROJECT_RULES_FILES]).toEqual([
      'AGENTS.md',
      '.cursorrules',
      '.agentrules',
      '.clinerules',
    ]);
  });

  it('listProjectRuleFiles always includes basic .agentrules', () => {
    const listed = listProjectRuleFiles(temp());
    expect(listed[0]?.kind).toBe('basic');
    expect(listed[0]?.relPath).toBe(DEFAULT_RULES_FILE);
    expect(listed.length).toBe(1);
  });

  it('loads custom rules from .agentk/rules after root files', () => {
    const dir = temp();
    fs.mkdirSync(path.join(dir, '.agentk', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agentrules'), 'basic content');
    fs.writeFileSync(
      path.join(dir, '.agentk', 'rules', 'korean.md'),
      'Always respond in Korean'
    );
    fs.writeFileSync(path.join(dir, '.agentk', 'rules', 'skip.bin'), 'not a rule');
    const content = loadProjectRulesFromFs(dir);
    expect(content).toContain('basic content');
    expect(content).toContain('Always respond in Korean');
    expect(content).toContain(`${PROJECT_CUSTOM_RULES_DIR}/korean.md`);
    expect(content).not.toContain('not a rule');
    expect(content.indexOf('basic content')).toBeLessThan(
      content.indexOf('Always respond in Korean')
    );
  });

  it('loads .cursor/rules mdc files', () => {
    const dir = temp();
    fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.cursor', 'rules', 'core.mdc'),
      '# Core package only\n'
    );
    const content = loadProjectRulesFromFs(dir);
    expect(content).toContain('Core package only');
    expect(content).toContain(`${CURSOR_RULES_DIR}/core.mdc`);
  });

  it('listProjectRuleFiles includes custom markdown files', () => {
    const dir = temp();
    fs.mkdirSync(path.join(dir, '.agentk', 'rules'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.agentk', 'rules', 'korean.md'),
      '# Always respond in Korean\n'
    );
    const listed = listProjectRuleFiles(dir);
    expect(listed.length).toBe(2);
    expect(listed[1]?.kind).toBe('custom');
    expect(listed[1]?.fileName).toBe('korean.md');
  });

  it('titleFromRuleContent prefers the first heading', () => {
    expect(
      titleFromRuleContent('# Always respond in Korean\n\nDetails', 'fallback')
    ).toBe('Always respond in Korean');
    expect(titleFromRuleContent('', '기본 룰')).toBe('기본 룰');
  });

  it('resolveProjectRulesContent prefers explicit override', () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'from disk');
    expect(
      resolveProjectRulesContent({
        workspaceRoot: dir,
        projectRules: 'explicit override',
      })
    ).toBe('explicit override');
  });
});

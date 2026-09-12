/**
 * SKILL-001~003 unit tests (v2.1 동작 동등)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  SkillRegistry,
  checkSkillFeature,
  getSkillRegistry,
  resetSkillRegistryForTests,
} from './SkillRegistry';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-skills-'));
  resetSkillRegistryForTests();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  resetSkillRegistryForTests();
});

describe('SKILL-001 SkillRegistry load/pin', () => {
  it('loads skills from directory and extracts description', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'greet.md'),
      '# Greeting skill\n\nSay hello politely.',
    );
    const registry = new SkillRegistry(tmpDir);
    const skills = registry.loadAll();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('greet');
    expect(skills[0].description).toBe('Greeting skill');
    expect(skills[0].pinned).toBe(false);
  });

  it('pin/unpin controls injection', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A\ncontent-a');
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();

    expect(registry.pin('a')).toBe(true);
    expect(registry.pin('missing')).toBe(false);
    expect(registry.isPinned('a')).toBe(true);
    expect(registry.getPinnedSkills()).toHaveLength(1);

    registry.unpin('a');
    expect(registry.isPinned('a')).toBe(false);
    expect(registry.getPinnedSkills()).toHaveLength(0);
  });

  it('reload picks up file changes and deletes missing skills', () => {
    const file = path.join(tmpDir, 'x.md');
    fs.writeFileSync(file, '# X\nv1');
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();

    fs.writeFileSync(file, '# X2\nv2');
    const updated = registry.reload('x');
    expect(updated?.description).toBe('X2');

    fs.rmSync(file);
    expect(registry.reload('x')).toBeNull();
    expect(registry.get('x')).toBeUndefined();
  });
});

describe('SKILL-002 injectPinnedSkills', () => {
  it('no pinned skills → no injection', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A\ncontent-a');
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();

    const result = registry.injectPinnedSkills('base prompt');
    expect(result.injected).toBe(false);
    expect(result.prompt).toBe('base prompt');
    expect(result.warnings).toHaveLength(0);
  });

  it('pinned skills are injected with skill tags', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A\ncontent-a');
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();
    registry.pin('a');

    const result = registry.injectPinnedSkills('base prompt');
    expect(result.injected).toBe(true);
    expect(result.prompt).toContain('base prompt');
    expect(result.prompt).toContain('<skill name="a">');
    expect(result.prompt).toContain('content-a');
  });

  it('unpin stops injection immediately', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A\ncontent-a');
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();
    registry.pin('a');
    registry.unpin('a');

    expect(registry.injectPinnedSkills('base').injected).toBe(false);
  });

  it('Tier A truncates oversized pinned skills with warning', () => {
    fs.writeFileSync(path.join(tmpDir, 'big.md'), `# Big\n${'x'.repeat(5000)}`);
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();
    registry.pin('big');

    const result = registry.injectPinnedSkills('base', true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Tier A');
    expect(result.prompt).toContain('(truncated for Tier A)');
  });
});

describe('SKILL-001 secret masking', () => {
  it('masks plaintext secrets in skill content', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'leaky.md'),
      '# Leaky\napi_key = "sk-abcdefghijklmnopqrstuvw"',
    );
    const registry = new SkillRegistry(tmpDir);
    registry.loadAll();

    const skill = registry.get('leaky');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('sk-abcdefghijklmnopqrstuvw');
    expect(skill!.content).toContain('[REDACTED]');
  });
});

describe('SKILL-003 feature flag', () => {
  it('allowed by default', () => {
    expect(checkSkillFeature().allowed).toBe(true);
  });

  it('denied when enabled === false', () => {
    const result = checkSkillFeature({ enabled: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });
});

describe('SKILL-001 singleton', () => {
  it('getSkillRegistry returns the same instance', () => {
    const a = getSkillRegistry(tmpDir);
    const b = getSkillRegistry();
    expect(a).toBe(b);
  });
});

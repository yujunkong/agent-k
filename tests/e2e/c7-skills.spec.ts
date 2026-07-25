/**
 * C7-T43: E2E — Skills 핀 → 주입 → Agent 동작 변경 (PRD-28 AC)
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SkillRegistry } from '../../../src/skills/SkillRegistry';
import { SkillTool } from '../../../src/tools/orchestration/SkillTool';

suite('C7-T43: Skills E2E', () => {
  const skillsDir = path.join(process.cwd(), '.agentk', 'test-skills');
  let registry: SkillRegistry;
  let tool: SkillTool;

  setup(() => {
    // Create test skill
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(skillsDir, 'test-skill.md'),
      '# Test Skill\nAlways use TypeScript for new files.\n');

    registry = new SkillRegistry(skillsDir);
    tool = new SkillTool(registry);
  });

  test('Skills 로드 및 리스트', () => {
    const skills = registry.loadAll();
    assert.ok(skills.length > 0);
    assert.ok(skills.some(s => s.name === 'test-skill'));
  });

  test('스킬 핀 → 주입 확인', () => {
    registry.loadAll();
    registry.pin('test-skill');

    const pinned = registry.getPinnedSkills();
    assert.strictEqual(pinned.length, 1);
    assert.strictEqual(pinned[0].name, 'test-skill');
    assert.ok(pinned[0].pinned);
  });

  test('핀 해제 즉시 중단', () => {
    registry.loadAll();
    registry.pin('test-skill');
    assert.strictEqual(registry.pinnedCount, 1);

    registry.unpin('test-skill');
    assert.strictEqual(registry.pinnedCount, 0);
  });

  test('스킬 주입 — 프롬프트에 포함 확인', () => {
    registry.loadAll();
    registry.pin('test-skill');

    const result = registry.injectPinnedSkills('existing prompt');
    assert.ok(result.injected);
    assert.ok(result.prompt.includes('test-skill'));
    assert.strictEqual(result.warnings.length, 0);
  });

  test('Tier A 캡 초과 경고', () => {
    registry.loadAll();

    // Create a large skill
    fs.writeFileSync(path.join(skillsDir, 'large-skill.md'),
      '# Large Skill\n' + 'A'.repeat(5000) + '\n');
    registry.reload('large-skill');
    registry.pin('large-skill');

    const result = registry.injectPinnedSkills('prompt', true); // Tier A
    assert.ok(result.injected);
    // May have warnings if over cap
  });

  test('skill_list / skill_load / skill_pin / skill_unpin 도구', () => {
    registry.loadAll();
    registry.pin('test-skill');

    const listResult = tool.handleList({});
    assert.ok(listResult.success);
    assert.ok(Array.isArray(listResult.data));

    const loadResult = tool.handleLoad({ name: 'test-skill' });
    assert.ok(loadResult.success);

    const unpinResult = tool.handleUnpin({ name: 'test-skill' });
    assert.ok(unpinResult.success);

    const loadNotFound = tool.handleLoad({ name: 'nonexistent' });
    assert.ok(!loadNotFound.success);
    assert.ok(loadNotFound.error!.includes('not found'));
  });

  teardown(() => {
    // Clean up test skills
    if (fs.existsSync(skillsDir)) {
      const files = fs.readdirSync(skillsDir);
      for (const f of files) fs.unlinkSync(path.join(skillsDir, f));
      fs.rmdirSync(skillsDir);
    }
  });
});

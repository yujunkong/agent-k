/**
 * Plan draft naming contract — plan_<hash>.md under .agentk/plans/tmp/
 * (Does not import vscode-backed PlanStorage.)
 */
import * as assert from 'assert';
import * as crypto from 'crypto';

/** Mirrors PlanStorage.makePlanId */
function makePlanId(content: string, title?: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${Date.now()}\n${title || ''}\n${content}`)
    .digest('hex')
    .slice(0, 10);
  return `plan_${hash}`;
}

/** Mirrors savePlan existingSlug gate + ChatApp slugForSave */
const REUSABLE_SLUG = /^plan_[a-f0-9]+$/i;

suite('PlanStorage naming', () => {
  test('makePlanId → plan_<10 hex chars>', () => {
    const id = makePlanId('# Title\n\n- [ ] step', 'My Plan');
    assert.ok(REUSABLE_SLUG.test(id), `got ${id}`);
    assert.strictEqual(id.length, 'plan_'.length + 10);
  });

  test('makePlanId is unique per call (timestamp in hash input)', async () => {
    const a = makePlanId('same', 'same');
    await new Promise((r) => setTimeout(r, 2));
    const b = makePlanId('same', 'same');
    assert.notStrictEqual(a, b);
  });

  test('plan_pending is not a reusable file stem', () => {
    assert.ok(!REUSABLE_SLUG.test('plan_pending'));
    assert.ok(REUSABLE_SLUG.test('plan_a1b2c3d4e5'));
  });

  test('draft path shape: .agentk/plans/tmp/plan_<hash>.md', () => {
    const slug = makePlanId('body', 't');
    const rel = `.agentk/plans/tmp/${slug}.md`;
    assert.ok(rel.startsWith('.agentk/plans/tmp/plan_'));
    assert.ok(rel.endsWith('.md'));
  });
});

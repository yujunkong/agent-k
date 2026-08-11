import * as assert from 'assert';
import {
  PlanToAgent,
  compactMessagesForPlanExecute,
  compactHistoryForBuildHandoff,
  looksLikePlanHandoffLeak,
  buildKickoffUserMessage,
  PLAN_EXECUTE_KICKOFF
} from '../../../src/plan/PlanToAgent';
import type { PlanDocument } from '../../../src/plan/PlanGenerator';

suite('PlanToAgent handoff (OpenCode-aligned)', () => {
  const doc: PlanDocument = {
    slug: 'plan_ab12',
    title: 'Test Plan',
    content: '# Test Plan\n\n- [ ] Step one\n- [ ] Step two\n',
    sections: [],
    todoCount: 2,
    createdAt: Date.now()
  };

  test('kickoff is short OpenCode-style; plan stays in system addon', () => {
    const p = new PlanToAgent();
    p.setPlanDocument(doc);
    const addon = p.buildHandoffSystemAddon(doc, 'research notes', [
      { question: 'Q?', answer: 'A' }
    ]);
    assert.ok(addon.includes('Approved Implementation Plan'));
    assert.ok(addon.includes('BUILD mode'));
    assert.ok(addon.includes('Step one'));
    assert.ok(addon.includes('research notes'));
    assert.ok(/Do not reprint Review UI chrome/.test(addon));

    const kick = p.buildKickoffUserMessage();
    assert.ok(/has been approved/.test(kick));
    assert.ok(/plan_ab12/.test(kick));
    assert.ok(kick.length < 280);
    assert.ok(!kick.includes('# Test Plan'));
    assert.ok(!kick.includes(doc.content));
    assert.ok(!/View Plans/.test(kick));
    assert.ok(PLAN_EXECUTE_KICKOFF.length < 280);
  });

  test('buildKickoffUserMessage without ref stays generic', () => {
    const kick = buildKickoffUserMessage();
    assert.ok(/has been approved/.test(kick));
    assert.ok(/Execute the plan/.test(kick));
  });

  test('compactMessagesForPlanExecute drops Review chrome (no echoable stub)', () => {
    const out = compactMessagesForPlanExecute([
      {
        role: 'assistant',
        content:
          '전체 계획은 **Review 창**에 저장했습니다. 상단 **View Plans / Reject / Confirm**으로 진행하세요.\n\n## 진행 순서 (TODO)\n1. A'
      },
      { role: 'user', content: '승인' },
      { role: 'assistant', content: '일반 진행 보고' }
    ]);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].content, '승인');
    assert.strictEqual(out[1].content, '일반 진행 보고');
    assert.ok(!out.some((m) => /View Plans|Earlier: plan drafted/i.test(m.content)));
  });

  test('compactHistoryForBuildHandoff also drops long Plan research essays', () => {
    const longResearch = 'A'.repeat(1500);
    const out = compactHistoryForBuildHandoff([
      { role: 'assistant', content: longResearch },
      { role: 'user', content: '답: 전체 마이그레이션' },
      {
        role: 'assistant',
        content:
          '전체 계획은 **Review 창**에 저장. **View Plans / Reject / Confirm**'
      },
      { role: 'user', content: '승인 실행' }
    ]);
    assert.ok(!out.some((m) => m.content === longResearch));
    assert.ok(!out.some((m) => /View Plans/.test(m.content)));
    assert.ok(out.some((m) => m.content === '답: 전체 마이그레이션'));
    assert.ok(out.some((m) => m.content === '승인 실행'));
  });

  test('looksLikePlanHandoffLeak catches echoed stubs', () => {
    assert.ok(
      looksLikePlanHandoffLeak(
        '[Earlier: plan drafted for Review. User approved it. Full plan is in the system prompt — do not reprint Review chrome or the TODO list.]'
      )
    );
  });

  test('buildTransitionContext no longer dumps plan into user role', () => {
    const p = new PlanToAgent();
    const t = p.buildTransitionContext(doc, '', []);
    assert.strictEqual(t.messages[0]?.role, 'user');
    assert.ok(!t.messages[0]?.content.includes('# Test Plan'));
    assert.ok(t.systemPrompt.includes('# Test Plan'));
    assert.ok(/has been approved/.test(t.messages[0]?.content || ''));
  });
});

/**
 * Parallel chat tabs must not share one PlanModeController.
 * Background acceptGeneratedPlan / moveToReview would otherwise open Review on the wrong tab.
 */
import * as assert from 'assert';
import { PlanModeControllerAdapter } from '../../../../src/plan/v2/PlanModeControllerAdapter';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function makePlan(): PlanDocument {
  return {
    id: 'plan_iso_1',
    goal: 'Isolate plan controllers per tab',
    summary: 'Isolate plan controllers per tab',
    tasks: [
      {
        id: 'task-1',
        title: 'Keep tabs isolated',
        description: 'd',
        files: [{ path: 'src/a.ts', intent: 'create' }],
        dependencies: [],
        verification: []
      }
    ],
    risks: [],
    createdAt: Date.now()
  };
}

suite('PlanModeControllerAdapter tab isolation', () => {
  test('each adapter owns a distinct legacy PlanModeController', () => {
    const analysis = new PlanModeControllerAdapter('session-analysis');
    const plan = new PlanModeControllerAdapter('session-plan');
    assert.notStrictEqual(analysis.legacy, plan.legacy);
  });

  test('acceptGeneratedPlan on plan tab does not move analysis controller to review', async () => {
    const analysis = new PlanModeControllerAdapter('session-analysis');
    const plan = new PlanModeControllerAdapter('session-plan');

    let analysisStage = analysis.legacy.getState().stage;
    let planStage = plan.legacy.getState().stage;
    analysis.legacy.onStageChangeCallback((s) => {
      analysisStage = s;
    });
    plan.legacy.onStageChangeCallback((s) => {
      planStage = s;
    });

    await plan.acceptGeneratedPlan(makePlan(), {
      attempts: 1,
      researchContext: 'research notes'
    });

    assert.strictEqual(planStage, 'review');
    assert.ok(plan.legacy.getState().planDocument?.content?.trim());
    assert.notStrictEqual(analysisStage, 'review');
    assert.strictEqual(analysis.legacy.getState().planDocument, null);
  });
});

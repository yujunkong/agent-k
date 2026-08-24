/**
 * TEST-006 — PlanSession phase transitions + card-oriented approve.
 */

import { describe, expect, it } from 'vitest';
import { PlanSession } from './session/PlanSession';
import { buildExecutionPlan } from './execution/buildExecutionPlan';
import type { PlanDocument } from './session/schema';
import { createPlanWatchdog, PLAN_GENERATE_TIMEOUT_MS } from './watchdog';
import { serializePlanDocument, parsePlanDocument } from './storage';
import { SESSION_PHASE_TO_R004 } from '@agent-k/shared';

function samplePlan(overrides?: Partial<PlanDocument>): PlanDocument {
  return {
    id: 'plan_test_1',
    goal: 'Ship Plan Card',
    summary: 'Implement Plan Card pipeline',
    tasks: [
      {
        id: 't1',
        title: 'Extract domain',
        description: 'Move session to packages/plan',
        files: [{ path: 'packages/plan/src/index.ts', intent: 'modify' }],
        dependencies: [],
        verification: ['npm run typecheck -w @agent-k/plan'],
      },
      {
        id: 't2',
        title: 'Wire host',
        description: 'planGenerate uses generatePlanForHost',
        files: [{ path: 'packages/host/src/planGenerate.ts', intent: 'modify' }],
        dependencies: ['t1'],
        verification: ['npm run typecheck -w @agent-k/host'],
      },
    ],
    risks: [{ id: 'r1', risk: 'Boundary leak', mitigation: 'Re-export only' }],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('TEST-006 Plan session / card / execution', () => {
  it('maps session phases to R-004 labels', () => {
    expect(SESSION_PHASE_TO_R004.review).toBe('Reviewing');
    expect(SESSION_PHASE_TO_R004.executing).toBe('Executing');
  });

  it('walks research → generated → review → approved', () => {
    const session = new PlanSession('s1');
    const now = Date.now();
    session.recordEvent({ type: 'plan.started', goal: 'Ship Plan Card', timestamp: now });
    expect(session.getPhase()).toBe('research');
    session.recordEvent({
      type: 'research.completed',
      findings: 'card UX',
      timestamp: now + 1,
    });
    expect(session.getPhase()).toBe('planning');
    const plan = samplePlan();
    session.recordEvent({
      type: 'plan.generated',
      plan,
      attempt: 1,
      timestamp: now + 2,
    });
    expect(session.getPhase()).toBe('review');
    expect(session.getPlan()?.id).toBe('plan_test_1');
    session.recordEvent({
      type: 'plan.approved',
      taskIds: ['t1'],
      timestamp: now + 3,
    });
    expect(session.getPhase()).toBe('executing');
    expect(session.getState().approvedTaskIds).toEqual(['t1']);
  });

  it('builds an execution DAG from the card document', () => {
    const plan = buildExecutionPlan(samplePlan());
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].id).toBe('t1');
    expect(plan.status).toMatch(/draft|approved/);
  });

  it('round-trips PlanDocument JSON for storage', () => {
    const doc = samplePlan();
    const raw = serializePlanDocument(doc);
    expect(parsePlanDocument(raw).summary).toBe(doc.summary);
  });

  it('fires plan watchdog on timeout', async () => {
    let fired = false;
    const wd = createPlanWatchdog({
      timeoutMs: 20,
      onTimeout: () => {
        fired = true;
      },
    });
    expect(PLAN_GENERATE_TIMEOUT_MS).toBe(180_000);
    await new Promise((r) => setTimeout(r, 40));
    expect(fired).toBe(true);
    wd.clear();
  });
});

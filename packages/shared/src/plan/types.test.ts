/**
 * SHARED-PLAN-001 — PlanDocument / TaskStatus type guards.
 */

import { describe, expect, it } from 'vitest';
import {
  isPlanSessionPhase,
  isTaskStatus,
  SESSION_PHASE_TO_R004,
  TASK_STATUS_VALUES,
} from './types';

describe('SHARED-PLAN-001 plan types', () => {
  it('accepts known task statuses', () => {
    for (const s of TASK_STATUS_VALUES) {
      expect(isTaskStatus(s)).toBe(true);
    }
    expect(isTaskStatus('done')).toBe(false);
  });

  it('maps session phases to R-004', () => {
    expect(SESSION_PHASE_TO_R004.review).toBe('Reviewing');
    expect(SESSION_PHASE_TO_R004.executing).toBe('Executing');
    expect(isPlanSessionPhase('review')).toBe(true);
    expect(isPlanSessionPhase('Reviewing')).toBe(false);
  });
});

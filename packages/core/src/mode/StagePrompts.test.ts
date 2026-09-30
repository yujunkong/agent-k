/**
 * V31-PLAN-01 — plan/debug stage prompt injection.
 */
import { describe, expect, it } from 'vitest';
import { PLAN_STAGE_PROMPTS, injectStagePrompt } from './StagePrompts';

describe('V31-PLAN-01 injectStagePrompt', () => {
  it('returns the base unchanged when no stage applies', () => {
    expect(injectStagePrompt('base', {})).toBe('base');
  });

  it('injects the plan stage prompt', () => {
    const out = injectStagePrompt('base', { planStage: 'planning' });
    expect(out).toContain('## Plan stage: planning');
    expect(out).toContain('PLANNING stage');
    expect(out).toContain('Do NOT implement');
  });

  it('injects the debug stage prompt', () => {
    const out = injectStagePrompt('base', { debugStage: 'hypothesis' });
    expect(out).toContain('## Debug stage: hypothesis');
    expect(out).toContain('root-cause hypotheses');
  });

  it('injects both when both are set', () => {
    const out = injectStagePrompt('base', {
      planStage: 'review',
      debugStage: 'fix',
    });
    expect(out).toContain('## Plan stage: review');
    expect(out).toContain('## Debug stage: fix');
  });

  it('exposes all five plan stage prompts', () => {
    for (const stage of ['research', 'questions', 'planning', 'review', 'build'] as const) {
      expect(PLAN_STAGE_PROMPTS[stage].length).toBeGreaterThan(40);
    }
  });
});

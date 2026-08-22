/**
 * MODE-001…009 — mode registry / sticky / override / handoff.
 */
import { describe, expect, it } from 'vitest';
import {
  ManualModeOverride,
  PlanV2StickyState,
  StickyModeStore,
  buildPlanToAgentHandoff,
  classifyAutoMode,
  createAskModeConfig,
  modeRegistry,
} from './index';

describe('mode domain (MODE-001…009)', () => {
  it('Ask mode is read-only and blocks write tools', () => {
    const ask = createAskModeConfig();
    expect(ask.readOnly).toBe(true);
    expect(modeRegistry.isToolAllowed('ask', 'read_file')).toBe(true);
    expect(modeRegistry.isToolAllowed('ask', 'write_file')).toBe(false);
  });

  it('Auto classifier picks debug/plan/ask/agent', () => {
    expect(classifyAutoMode('debug this crash stack trace').mode).toBe('debug');
    expect(classifyAutoMode('design an architecture plan').mode).toBe('plan');
    expect(classifyAutoMode('what is ContextAssembler?').mode).toBe('ask');
    expect(classifyAutoMode('implement the feature').mode).toBe('agent');
  });

  it('Manual override beats sticky and auto', () => {
    const sticky = new StickyModeStore();
    sticky.set('agent');
    const planSticky = new PlanV2StickyState();
    const manual = new ManualModeOverride();
    manual.set('ask');
    expect(manual.resolve('implement something', sticky, planSticky)).toBe('ask');
  });

  it('Plan V2 sticky forces plan mode while researching', () => {
    const sticky = new StickyModeStore();
    const planSticky = new PlanV2StickyState();
    planSticky.setStage('research');
    const manual = new ManualModeOverride();
    expect(manual.resolve('hello', sticky, planSticky)).toBe('plan');
  });

  it('Plan → Agent handoff builds agent payload', () => {
    const handoff = buildPlanToAgentHandoff({
      planMarkdown: '# Plan\n\n1. Do the thing',
      answers: [{ question: 'Scope?', answer: 'Core only' }],
    });
    expect(handoff.mode).toBe('agent');
    expect(handoff.userMessage).toContain('Approved Implementation Plan');
    expect(handoff.systemPrompt).toContain('AGENT mode');
  });
});

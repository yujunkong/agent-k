/**
 * MODE-001…009 — mode registry / sticky / override / handoff.
 */
import { describe, expect, it } from 'vitest';
import {
  ManualModeOverride,
  PlanSchemaStickyState,
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
    const planSticky = new PlanSchemaStickyState();
    const manual = new ManualModeOverride();
    manual.set('ask');
    expect(manual.resolve('implement something', sticky, planSticky)).toBe('ask');
  });

  it('Plan V2 sticky forces plan mode while researching', () => {
    const sticky = new StickyModeStore();
    const planSticky = new PlanSchemaStickyState();
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

  it('Every mode prompt carries thinking-brevity + concise-reply rules', () => {
    for (const cfg of modeRegistry.listModes()) {
      expect(cfg.systemPrompt).toContain('Thinking style: think briefly and precisely.');
      expect(cfg.systemPrompt).toContain('Never use thinking to draft the user-facing reply.');
      expect(cfg.systemPrompt).toContain('Reply style: be concise.');
    }
    const handoff = buildPlanToAgentHandoff({ planMarkdown: '# Plan' });
    expect(handoff.systemPrompt).toContain('Thinking style: think briefly and precisely.');
    expect(handoff.systemPrompt).toContain('Reply style: be concise.');
  });

  it('Per-mode response shaping markers are present', () => {
    const prompts = Object.fromEntries(
      modeRegistry.listModes().map((cfg) => [cfg.name, cfg.systemPrompt])
    );
    // ask — answer first, file:line refs, one follow-up offer max
    expect(prompts.ask).toContain('Answer first: direct answer in 1–3 sentences');
    expect(prompts.ask).toContain('file:line references');
    expect(prompts.ask).toContain('at most one short follow-up offer');
    // agent — act, don't narrate
    expect(prompts.agent).toContain("Act, don't narrate");
    expect(prompts.agent).toContain('what changed (files/diffs) + verification result + any risk');
    // plan — structured doc, clarify before writing
    expect(prompts.plan).toContain('structured plan document');
    expect(prompts.plan).toContain('clarifying questions BEFORE writing the plan');
    // debug — scientific-method framing, no fix before root cause
    expect(prompts.debug).toContain('scientific-method terms');
    expect(prompts.debug).toContain('hypothesis (one sentence)');
    expect(prompts.debug).toContain('Do not jump to a fix before the root cause is confirmed');
  });
});

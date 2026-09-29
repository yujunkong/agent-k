/**
 * V31-MODE-01 — full mode system prompt snapshot (drift guard).
 *
 * Marker assertions live in mode.test.ts; this file pins the FULL prompt text
 * for ask/agent/plan/debug so any wording change is reviewed explicitly.
 */
import { describe, expect, it } from 'vitest';
import { modeRegistry } from './ModeRegistry';

describe('V31-MODE-01 mode prompt snapshot', () => {
  it('ask system prompt', () => {
    expect(modeRegistry.getModeConfig('ask').systemPrompt).toMatchSnapshot();
  });

  it('agent system prompt', () => {
    expect(modeRegistry.getModeConfig('agent').systemPrompt).toMatchSnapshot();
  });

  it('plan system prompt', () => {
    expect(modeRegistry.getModeConfig('plan').systemPrompt).toMatchSnapshot();
  });

  it('debug system prompt', () => {
    expect(modeRegistry.getModeConfig('debug').systemPrompt).toMatchSnapshot();
  });
});

import { describe, expect, it } from 'vitest';
import { FRAME_HEADER, injectProblemFramePrompt } from './FramePromptInjector';
import {
  DefaultProblemFramePolicy,
  explainFrameDenial,
} from './ProblemFramePolicy';
import { formatFrameSummary, parseProblemFrame } from './parseProblemFrame';
import type { ProblemFrame } from '@agent-k/shared';

const RAW = `<problem_frame>{"intent":{"outcome":"tests pass","constraints":["no UI"],"ambiguous":false},"symptom":"red test","doneWhen":"vitest green","hypotheses":[{"claim":"off-by-one","killIf":"line 10 is correct"},{"claim":"h2","killIf":"k2"},{"claim":"h3","killIf":"k3"},{"claim":"h4","killIf":"k4"}],"nonGoals":["rewrite"]}</problem_frame>`;

function readyFrame(): ProblemFrame {
  return {
    intent: { outcome: 'tests pass', constraints: [], ambiguous: false },
    symptom: 'red',
    doneWhen: 'green',
    hypotheses: [{ claim: 'off-by-one', killIf: 'line is correct' }],
    nonGoals: [],
    observationDone: true,
  };
}

describe('V31-FRAME-01', () => {
  it('parses a frame and drops hypotheses past 3', () => {
    const frame = parseProblemFrame(`note\n${RAW}`);
    expect(frame?.intent.outcome).toBe('tests pass');
    expect(frame?.hypotheses).toHaveLength(3);
    expect(frame?.observationDone).toBe(false);
    expect(formatFrameSummary(frame!)).toContain('doneWhen: vitest green');
  });

  it('conversation prompt has no frame block', () => {
    const out = injectProblemFramePrompt('sys', 'conversation');
    expect(out).not.toContain(FRAME_HEADER);
  });

  it('task prompt injects once', () => {
    const once = injectProblemFramePrompt('sys', 'task');
    const twice = injectProblemFramePrompt(once, 'task');
    expect(twice.match(/## Problem frame/g)).toHaveLength(1);
  });

  it('blocks writes until observation, then allows', () => {
    const policy = new DefaultProblemFramePolicy();
    const frame = readyFrame();
    frame.observationDone = false;
    expect(policy.allowWrite(frame, 'task')).toBe(false);
    expect(explainFrameDenial(frame, 'task', 'edit_file')).toMatch(/Read the relevant file/);
    frame.observationDone = true;
    expect(policy.allowWrite(frame, 'task')).toBe(true);
    expect(explainFrameDenial(frame, 'task', 'edit_file')).toBeNull();
  });

  it('ambiguous allows only ask_question', () => {
    const frame = readyFrame();
    frame.intent.ambiguous = true;
    expect(explainFrameDenial(frame, 'task', 'edit_file')).toMatch(/ask_question/);
    expect(explainFrameDenial(frame, 'task', 'grep')).toMatch(/ask_question/);
    expect(explainFrameDenial(frame, 'task', 'ask_question')).toBeNull();
  });

  it('question never opens the edit gate', () => {
    expect(explainFrameDenial(readyFrame(), 'question', 'write_file')).toMatch(/read-only/);
    expect(explainFrameDenial(readyFrame(), 'question', 'read_file')).toBeNull();
  });
});

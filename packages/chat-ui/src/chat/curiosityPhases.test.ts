import { describe, expect, it } from 'vitest';
import {
  buildCuriosityPhases,
  coalesceAdjacentThinkingSteps
} from './curiosityPhases';
import type { CuriosityStep } from './curiosityPhases';
import { lastBoundaryStepId, sealBodyBeforeTools } from './sealTurnProse';
import type { ChatMessage } from './types';

function step(partial: Partial<CuriosityStep> & { id: string; kind: string }): CuriosityStep {
  return {
    label: partial.label || partial.kind,
    itemStatus: 'done',
    turn: 1,
    ...partial
  };
}

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'a',
    role: 'assistant',
    content: '',
    status: 'streaming',
    timestamp: 1,
    ...partial
  };
}

describe('coalesceAdjacentThinkingSteps', () => {
  it('does not merge sealed Thoughts with different ids (keeps Cursor breaks)', () => {
    const merged = coalesceAdjacentThinkingSteps([
      step({
        id: 'tl_thinking_1',
        kind: 'thinking',
        detail: 'before tools',
        durationMs: 500,
        itemStatus: 'done'
      }),
      step({
        id: 'tl_thinking_1_s1',
        kind: 'thinking',
        detail: 'after tools',
        durationMs: 1500,
        itemStatus: 'done'
      }),
      step({ id: 'r1', kind: 'reading', toolName: 'read_file' }),
      step({
        id: 'tl_thinking_1_s2',
        kind: 'thinking',
        detail: 'later',
        durationMs: 2000,
        itemStatus: 'done'
      })
    ]);
    expect(merged.map((s) => s.id)).toEqual([
      'tl_thinking_1',
      'tl_thinking_1_s1',
      'r1',
      'tl_thinking_1_s2'
    ]);
    expect(merged[0].detail).toBe('before tools');
    expect(merged[1].detail).toBe('after tools');
  });

  it('merges same-id live Thought stream fragments', () => {
    const merged = coalesceAdjacentThinkingSteps([
      step({
        id: 'tl_thinking_1',
        kind: 'thinking',
        detail: 'hel',
        itemStatus: 'running'
      }),
      step({
        id: 'tl_thinking_1',
        kind: 'thinking',
        detail: 'hello',
        itemStatus: 'running'
      })
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].detail).toBe('hello');
    expect(merged[0].itemStatus).toBe('running');
  });
});

describe('buildCuriosityPhases Exploring cuts', () => {
  it('cuts Exploring at visible mid dig (proseAfter), not fold into Thought', () => {
    const phases = buildCuriosityPhases(
      [
        step({ id: 'r1', kind: 'reading', toolName: 'read_file', label: 'Read' }),
        step({ id: 'r2', kind: 'reading', toolName: 'read_file', label: 'Read' }),
        step({ id: 'r3', kind: 'reading', toolName: 'read_file', label: 'Read' })
      ],
      [
        {
          id: 'p0',
          turn: 1,
          content: '프로젝트 구조를 분석하기 위해 워크스페이스를 탐색하겠습니다.'
        },
        {
          id: 'p1',
          turn: 1,
          content: '테스트 파일과 추가 문서를 확인하겠습니다.',
          afterStepId: 'r2'
        }
      ]
    );

    const explore1 = phases.find((p) =>
      p.rows.some((r) => r.type === 'tool' && r.step.id === 'r1')
    );
    expect(explore1?.rows.filter((r) => r.type === 'tool').map((r) => r.step.id)).toEqual([
      'r1',
      'r2'
    ]);
    expect(explore1?.resolved).toBe(true);
    expect(
      explore1?.proseAfter.some((n) => n.content.includes('테스트 파일'))
    ).toBe(true);
    // Comment: must not swallow mid dig into Thought accordion
    expect(String(explore1?.openingThought?.detail || '')).not.toContain(
      '테스트 파일'
    );
    const explore2 = phases.find((p) =>
      p.rows.some((r) => r.type === 'tool' && r.step.id === 'r3')
    );
    expect(explore2).toBeTruthy();
    expect(phases[0].leadProse.some((n) => n.content.includes('프로젝트 구조'))).toBe(
      true
    );
  });

  it('does not split Ran batch when dig prose arrives between commands', () => {
    const phases = buildCuriosityPhases(
      [
        step({
          id: 'c1',
          kind: 'running',
          toolName: 'run_terminal_cmd',
          label: 'Ran'
        }),
        step({
          id: 'c2',
          kind: 'running',
          toolName: 'run_terminal_cmd',
          label: 'Ran'
        })
      ],
      [
        {
          id: 'p1',
          turn: 1,
          content: 'Let me rewrite the file with proper egui API usage:',
          afterStepId: 'c1'
        }
      ]
    );
    const cmdPhases = phases.filter((p) => p.actions.length > 0);
    expect(cmdPhases).toHaveLength(1);
    expect(cmdPhases[0].actions.map((a) => a.id)).toEqual(['c1', 'c2']);
    expect(cmdPhases[0].proseAfter.some((n) => n.content.includes('rewrite'))).toBe(
      true
    );
  });

  it('cuts Exploring at Edit and Command actions', () => {
    const phases = buildCuriosityPhases([
      step({ id: 'r1', kind: 'reading', toolName: 'read_file' }),
      step({
        id: 'e1',
        kind: 'editing',
        toolName: 'edit_file',
        label: 'Edited'
      }),
      step({ id: 'r2', kind: 'reading', toolName: 'read_file' }),
      step({
        id: 'c1',
        kind: 'running',
        toolName: 'run_terminal_cmd',
        label: 'Ran'
      })
    ]);

    expect(phases.length).toBeGreaterThanOrEqual(3);
    const explore1 = phases.find((p) =>
      p.rows.some((r) => r.type === 'tool' && r.step.id === 'r1')
    );
    expect(explore1?.resolved).toBe(true);
    const editPhase = phases.find((p) => p.actions.some((a) => a.id === 'e1'));
    expect(editPhase).toBeTruthy();
    expect(editPhase?.rows.some((r) => r.type === 'tool')).toBe(false);
    const explore2 = phases.find((p) =>
      p.rows.some((r) => r.type === 'tool' && r.step.id === 'r2')
    );
    expect(explore2?.resolved).toBe(true);
    const cmdPhase = phases.find((p) => p.actions.some((a) => a.id === 'c1'));
    expect(cmdPhase).toBeTruthy();
  });

  it('puts SubagentRunRow in its own phase (not under live Thought)', () => {
    const phases = buildCuriosityPhases([
      step({
        id: 't1',
        kind: 'thinking',
        detail: 'planning spawn',
        itemStatus: 'running'
      }),
      step({
        id: 'tl_subagent_x',
        kind: 'subagent',
        label: 'Verify phase 1',
        toolName: 'task_run',
        subagentId: 'x',
        itemStatus: 'running'
      })
    ]);
    const thoughtPhase = phases.find((p) => p.openingThought?.id === 't1');
    const taskPhase = phases.find((p) =>
      p.actions.some((a) => a.id === 'tl_subagent_x')
    );
    expect(thoughtPhase).toBeTruthy();
    expect(taskPhase).toBeTruthy();
    expect(thoughtPhase).not.toBe(taskPhase);
    expect(taskPhase?.openingThought).toBeUndefined();
  });

  it('places next Thought below Subagent (does not revive sealed Thought above)', () => {
    const phases = buildCuriosityPhases([
      step({
        id: 't1',
        kind: 'thinking',
        detail: 'spawn decision',
        itemStatus: 'done'
      }),
      step({
        id: 'tl_subagent_x',
        kind: 'subagent',
        label: 'Verify',
        toolName: 'task_run',
        subagentId: 'x',
        itemStatus: 'running'
      }),
      step({
        id: 't2',
        kind: 'thinking',
        detail: 'waiting on child',
        itemStatus: 'running'
      })
    ]);
    const ids = phases.map((p) => ({
      thought: p.openingThought?.id,
      tasks: p.actions.map((a) => a.id)
    }));
    expect(ids[0]?.thought).toBe('t1');
    expect(ids[1]?.tasks).toContain('tl_subagent_x');
    expect(ids[2]?.thought).toBe('t2');
    // t1 must not absorb t2
    expect(phases[0].openingThought?.detail).toBe('spawn decision');
  });

  it('puts post-spawn Ran in a phase below Subagent (not glued under it)', () => {
    const phases = buildCuriosityPhases([
      step({
        id: 'tl_subagent_x',
        kind: 'subagent',
        label: 'Audit',
        toolName: 'task_run',
        subagentId: 'x',
        itemStatus: 'running'
      }),
      step({
        id: 'c1',
        kind: 'running',
        toolName: 'run_terminal_cmd',
        label: 'Ran',
        detail: 'git status'
      })
    ]);
    const subPhase = phases.find((p) =>
      p.actions.some((a) => a.id === 'tl_subagent_x')
    );
    const ranPhase = phases.find((p) => p.actions.some((a) => a.id === 'c1'));
    expect(subPhase).toBeTruthy();
    expect(ranPhase).toBeTruthy();
    expect(subPhase).not.toBe(ranPhase);
    expect(phases.indexOf(subPhase!) < phases.indexOf(ranPhase!)).toBe(true);
  });

  it('does not sort Subagent after Explore due to digits in task id', () => {
    const phases = buildCuriosityPhases([
      step({
        id: 'tl_subagent_subagent-mt5sznft-q1zbft',
        kind: 'subagent',
        label: 'Quality pass',
        toolName: 'task_run',
        turn: 5, // poisoned (old inferTurnFromId)
        itemStatus: 'running'
      }),
      step({
        id: 'r1',
        kind: 'reading',
        toolName: 'read_file',
        turn: 1,
        itemStatus: 'done'
      })
    ]);
    // Same turn bucket — list order: subagent then read (not turn 5 after turn 1)
    expect(phases[0]?.actions.some((a) => a.id.includes('tl_subagent_'))).toBe(
      true
    );
    const explore = phases.find((p) =>
      p.rows.some((r) => r.type === 'tool' && r.step.id === 'r1')
    );
    expect(explore).toBeTruthy();
    expect(phases.indexOf(phases[0]!) < phases.indexOf(explore!)).toBe(true);
  });
});

describe('sealBodyBeforeTools afterStepId', () => {
  it('anchors mid-reply after last explore step', () => {
    const before = msg({
      content: '테스트 파일과 추가 문서를 확인하겠습니다.',
      steps: [
        {
          id: 'r1',
          kind: 'reading',
          label: 'Read',
          toolName: 'read_file',
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    expect(lastBoundaryStepId(before, 1)).toBe('r1');
    const after = sealBodyBeforeTools(before, 1);
    expect(after.turnProse?.[0].afterStepId).toBe('r1');
    expect(after.turnProse?.[0].content).toContain('테스트 파일');
  });

  it('first seal before tools has no afterStepId (chronological, not hoist)', () => {
    const after = sealBodyBeforeTools(
      msg({
        content: '프로젝트 구조를 분석하기 위해 워크스페이스를 탐색하겠습니다.'
      }),
      1
    );
    expect(after.turnProse?.[0].afterStepId).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { buildCuriosityPhases } from './curiosityPhases';
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

describe('buildCuriosityPhases Exploring cuts', () => {
  it('cuts Exploring at mid-message anchored after a Read step', () => {
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

    const withTools = phases.filter((p) => p.rows.some((r) => r.type === 'tool'));
    expect(withTools.length).toBeGreaterThanOrEqual(2);
    expect(withTools[0].resolved).toBe(true);
    expect(withTools[0].proseAfter.some((n) => n.content.includes('테스트 파일'))).toBe(
      true
    );
    // First dig intent stays chronological lead — not re-hoisted after the cut
    expect(phases[0].leadProse.some((n) => n.content.includes('프로젝트 구조'))).toBe(
      true
    );
    const toolIds = withTools.flatMap((p) =>
      p.rows.filter((r) => r.type === 'tool').map((r) => r.step.id)
    );
    expect(toolIds).toEqual(['r1', 'r2', 'r3']);
    expect(withTools[0].rows.filter((r) => r.type === 'tool').map((r) => r.step.id)).toEqual([
      'r1',
      'r2'
    ]);
    expect(withTools[1].rows.filter((r) => r.type === 'tool').map((r) => r.step.id)).toEqual([
      'r3'
    ]);
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

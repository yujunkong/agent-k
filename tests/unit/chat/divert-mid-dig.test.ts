/// <reference types="node" />
/// <reference types="mocha" />
import * as assert from 'assert';
import {
  divertMidDigContent,
  threadHasCompletedPlanResearch,
  sealBodyBeforeTools,
  recoverHiddenFindings,
  hoistStaleStepStartToTimeline
} from '../../../src/chat/sealTurnProse';
import {
  looksLikePlanStepStart,
  looksLikePlanStepComplete
} from '../../../src/chat/turnProseSplit';
import type { ChatMessage } from '../../../src/chat/types';

function baseMsg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: '',
    status: 'streaming',
    timestamp: Date.now(),
    steps: [
      {
        id: 't1',
        kind: 'reading',
        label: 'Read',
        turn: 1,
        itemStatus: 'done'
      }
    ],
    ...over
  };
}

suite('divertMidDigContent', () => {
  test('Exploring 이후 안녕하세요 재시작은 Thought로 보낸다', () => {
    const msg = baseMsg();
    const out = divertMidDigContent(
      msg,
      '안녕하세요! 프로젝트의 문제점 파악과 개선 방향 계획을 잡아보겠습니다. 먼저 프로젝트 구조와 핵심 파일들을 살펴보겠습니다.',
      2
    );
    assert.ok(out);
    assert.strictEqual(out!.content, '');
    assert.ok(
      (out!.steps || []).some(
        (s) => s.kind === 'thinking' && /안녕하세요/.test(String(s.detail || ''))
      )
    );
  });

  test('planning 단계 새 버블의 구조 파악 lead도 Thought로 보낸다', () => {
    const msg = baseMsg({ steps: [] });
    const out = divertMidDigContent(
      msg,
      '프로젝트 구조를 파악하겠습니다. 먼저 세 가지 폴더를 동시에 살펴보겠습니다.',
      1,
      { foldPlanningDigs: true }
    );
    assert.ok(out);
    assert.strictEqual(out!.content, '');
  });

  test('이전 리서치 후 새 버블의 안녕하세요 재시작도 Thought로 보낸다', () => {
    const msg = baseMsg({ steps: [] });
    const out = divertMidDigContent(
      msg,
      '안녕하세요! 프로젝트 수정 계획을 세워보겠습니다. 먼저 프로젝트 구조를 파악하겠습니다.',
      1,
      { foldRepeatResearchDigs: true }
    );
    assert.ok(out);
    assert.strictEqual(out!.content, '');
    assert.ok(
      (out!.steps || []).some(
        (s) => s.kind === 'thinking' && /안녕하세요/.test(String(s.detail || ''))
      )
    );
  });

  test('첫 리서치 턴(이전 탐색 없음) 인사는 body에 남긴다', () => {
    const msg = baseMsg({ steps: [] });
    const out = divertMidDigContent(
      msg,
      '안녕하세요! 프로젝트 수정 계획을 세워보겠습니다. 먼저 프로젝트 구조를 파악하겠습니다.',
      1
    );
    assert.strictEqual(out, null);
  });

  test('긴 연구 요약은 body에 남긴다', () => {
    const text = [
      '꽤 깊이 파봤습니다. 현재 상태를 정리하면:',
      '',
      '**Python 백엔드**',
      '- FastAPI',
      '- 서비스 모듈 25개+',
      '',
      '이제 결정이 필요한 부분만 여쭤보겠습니다.'
    ].join('\n');
    const out = divertMidDigContent(baseMsg(), text, 2);
    assert.strictEqual(out, null);
  });
});

suite('threadHasCompletedPlanResearch', () => {
  test('탐색+요약이 끝난 assistant가 있으면 true', () => {
    const ok = threadHasCompletedPlanResearch([
      {
        id: 'u1',
        role: 'user',
        content: '계획 세워줘',
        status: 'complete',
        timestamp: 1
      },
      {
        id: 'a1',
        role: 'assistant',
        content:
          '꽤 깊이 파봤습니다. 현재 상태를 정리하면 여러 구조적 이슈가 있습니다.',
        status: 'complete',
        timestamp: 2,
        steps: [
          { id: 's1', kind: 'reading', label: 'Read', turn: 1, itemStatus: 'done' },
          { id: 's2', kind: 'searching', label: 'Search', turn: 1, itemStatus: 'done' }
        ]
      },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: 3
      }
    ], 'a2');
    assert.strictEqual(ok, true);
  });

  test('아직 리서치 전이면 false', () => {
    const ok = threadHasCompletedPlanResearch([
      {
        id: 'u1',
        role: 'user',
        content: '계획 세워줘',
        status: 'complete',
        timestamp: 1
      }
    ]);
    assert.strictEqual(ok, false);
  });
});

suite('recoverHiddenFindings', () => {
  test('Thought에만 남은 번호 목록을 turnProse로 올린다', () => {
    const findings = [
      'Main issues:',
      '1. Mixed identifiers',
      '2. Separation of concerns',
      '3. Missing types',
      '4. Health gaps',
      '5. collector_status',
      '6. No scheduler',
      '7. corp_codes',
      '8. Search P0'
    ].join('\n');
    const msg = baseMsg({
      content: '**악하겠습니다.**',
      steps: [
        {
          id: 't1',
          kind: 'reading',
          label: 'Read',
          turn: 1,
          itemStatus: 'done'
        },
        {
          id: 'th1',
          kind: 'thinking',
          label: 'Thought',
          detail: findings,
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    const out = recoverHiddenFindings(msg);
    assert.strictEqual(out.content, '');
    assert.ok((out.turnProse || []).some((p) => /Mixed identifiers/.test(p.content)));
  });

  test('divert 이후 조각 본문은 Thought로 계속 접는다', () => {
    const msg = baseMsg({
      content: '',
      steps: [
        {
          id: 't1',
          kind: 'reading',
          label: 'Read',
          turn: 1,
          itemStatus: 'done'
        },
        {
          id: 'th1',
          kind: 'thinking',
          label: 'Thought',
          detail: 'Looking at the project layout next.',
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    const out = divertMidDigContent(msg, '악하겠습니다.', 1);
    assert.ok(out);
    assert.strictEqual(out!.content, '');
    assert.ok(
      (out!.steps || []).some(
        (s) => s.kind === 'thinking' && /악하겠습니다/.test(String(s.detail || ''))
      )
    );
  });

  test('짧은 중간 문장은 length만으로 Thought에 접지 않는다', () => {
    const msg = baseMsg({
      content: '',
      steps: [
        {
          id: 't1',
          kind: 'reading',
          label: 'Read',
          turn: 1,
          itemStatus: 'done'
        },
        {
          id: 'th1',
          kind: 'thinking',
          label: 'Thought',
          detail: 'Scanning modules.',
          turn: 1,
          itemStatus: 'running'
        }
      ]
    });
    // Previously: midDigFoldActive && length < 80 folded this, then the next
    // tokens ("으로 파악했습니다…") appeared as a truncated body.
    const out = divertMidDigContent(
      msg,
      '이 프로젝트는 FastAPI 기반',
      1
    );
    assert.strictEqual(out, null);
  });

  test('조사로 시작하는 잘린 본문은 orphan으로 Thought에 접는다', () => {
    const msg = baseMsg({
      content: '',
      steps: [
        {
          id: 't1',
          kind: 'reading',
          label: 'Read',
          turn: 1,
          itemStatus: 'done'
        },
        {
          id: 'th1',
          kind: 'thinking',
          label: 'Thought',
          detail: '이 프로젝트는 FastAPI 기반',
          turn: 1,
          itemStatus: 'running'
        }
      ]
    });
    const out = divertMidDigContent(
      msg,
      '**으로 파악했습니다. 이제 문제점을 찾기 위해 핵심 영역을 깊이 파고들겠습니다.**',
      1
    );
    assert.ok(out);
    assert.strictEqual(out!.content, '');
    assert.ok(
      (out!.steps || []).some(
        (s) => s.kind === 'thinking' && /으로 파악했습니다/.test(String(s.detail || ''))
      )
    );
  });
});

suite('sealBodyBeforeTools — ask_question 직전 findings', () => {
  test('번호 매긴 문제 목록은 Thought가 아니라 turnProse로 남긴다', () => {
    const findings = [
      '꽤 깊이 파봤습니다. 확인된 주요 문제점은 다음과 같습니다:',
      '',
      '1. 중국어 식별자 혼재',
      '2. 관심사 분리 부족',
      '3. 타입 추출 미흡',
      '4. 헬스 모니터링 공백',
      '5. collector_status 미갱신',
      '6. 스케줄러 부재',
      '7. corp_codes 갱신 없음',
      '8. FE 검색 P0 미구현',
      '',
      '이제 어떤 항목을 수정 계획에 넣을지 확인하겠습니다.'
    ].join('\n');
    const msg = baseMsg({ content: findings });
    const out = sealBodyBeforeTools(msg, 1);
    assert.strictEqual(out.content, '');
    assert.ok((out.turnProse || []).some((p) => /중국어 식별자/.test(p.content)));
    assert.ok(
      !(out.steps || []).some(
        (s) => s.kind === 'thinking' && /중국어 식별자/.test(String(s.detail || ''))
      )
    );
  });

  test('English numbered findings stay as turnProse before ask_question', () => {
    const findings = [
      'Main issues found:',
      '1. Mixed Chinese identifiers',
      '2. Separation of concerns',
      '3. Missing types',
      '4. Health gaps',
      '5. collector_status',
      '6. No scheduler',
      '7. corp_codes stale',
      '8. Search P0',
      '',
      "I'll confirm which to include next."
    ].join('\n');
    const out = sealBodyBeforeTools(baseMsg({ content: findings }), 1);
    assert.ok((out.turnProse || []).some((p) => /Mixed Chinese/.test(p.content)));
    assert.ok(
      !(out.steps || []).some(
        (s) => s.kind === 'thinking' && /Mixed Chinese/.test(String(s.detail || ''))
      )
    );
  });

  test('Step 완료 진행보고는 Thought가 아니라 turnProse로 남긴다', () => {
    const progress =
      'Step 1 완료 ✅ — `_NEWS_CACHE` 중복 정의 제거\n\n---\n\n## Step 2: BUG-2 진행 중';
    const out = sealBodyBeforeTools(baseMsg({ content: progress }), 1);
    assert.strictEqual(out.content, '');
    assert.ok((out.turnProse || []).some((p) => /Step 1 완료/.test(p.content)));
    assert.ok(
      !(out.steps || []).some(
        (s) => s.kind === 'thinking' && /Step 1 완료/.test(String(s.detail || ''))
      )
    );
  });

  test('divert는 Step 진행보고를 Thought로 접지 않는다', () => {
    const out = divertMidDigContent(
      baseMsg(),
      'Step 1 완료 ✅ — stock.py 중복 제거. Step 2 진행합니다.',
      1
    );
    assert.strictEqual(out, null);
  });

  test('편집 후 Planning next moves 재계획은 Thought로 접는다', () => {
    const msg = baseMsg({
      steps: [
        {
          id: 'e1',
          kind: 'editing',
          label: 'Edited',
          toolName: 'edit_file',
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    const dump = [
      '**Planning next moves**',
      '',
      'I have the full picture. I need to:',
      '1. Modify main.py',
      '2. Convert routers',
      '',
      'Let me start with main.py:'
    ].join('\n');
    const out = divertMidDigContent(msg, dump, 2);
    assert.ok(out);
    assert.strictEqual(out!.content, '');
    assert.ok(
      (out!.steps || []).some(
        (s) => s.kind === 'thinking' && /Planning next moves|full picture/i.test(String(s.detail || ''))
      )
    );
  });
});

suite('hoistStaleStepStartToTimeline', () => {
  test('본문의 Step 시작을 turn 1 타임라인 앞으로 올린다', () => {
    const start =
      'Step 1(T1)부터 시작합니다. types.ts 고유 타입을 types/로 이동합니다.';
    const done = 'Step 1 완료 — types.ts re-export 전환. Step 2 진행합니다.';
    const msg = baseMsg({
      content: start,
      turnProse: [{ id: 'p2', turn: 3, content: done }],
      steps: [
        {
          id: 'e1',
          kind: 'editing',
          label: 'Edited',
          toolName: 'edit_file',
          turn: 2,
          itemStatus: 'done'
        }
      ]
    });
    const out = hoistStaleStepStartToTimeline(msg);
    assert.strictEqual(out.content, '');
    assert.ok((out.turnProse || []).length >= 2);
    assert.ok(looksLikePlanStepStart(out.turnProse![0].content));
    assert.strictEqual(out.turnProse![0].turn, 1);
    assert.ok(looksLikePlanStepComplete(out.turnProse![1].content));
  });
});

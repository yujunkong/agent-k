import * as assert from 'assert';
import { createAssistantStreamSession } from '../../../src/chat/assistantStreamSession';
import type { ChatMessage } from '../../../src/chat/types';
import type { PendingQuestion } from '../../../src/tools/session/AskQuestionTool';

function emptyRefs() {
  const messages: ChatMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: 1
    }
  ];
  return {
    stepStartRef: { current: {} as Record<string, number> },
    turnNumberRef: { current: 1 },
    sessionIdRef: { current: 'sess-1' },
    loopSessionIdRef: { current: 'sess-1' as string | null },
    parkedAwaitingRef: {
      current: null as { sessionId: string; questions: PendingQuestion[] } | null
    },
    messagesRef: { current: messages },
    planStageRef: { current: 'research' },
    pendingQuestionsRef: { current: [] as PendingQuestion[] },
    promotePlanOnCompleteRef: { current: false }
  };
}

suite('createAssistantStreamSession', () => {
  test('debugStage deltas sync the debug FSM (send and regenerate share this path)', () => {
    const refs = emptyRefs();
    const stages: string[] = [];
    const { onDelta } = createAssistantStreamSession({
      ...refs,
      mode: 'debug',
      planController: {
        enterQuestionsStage() {},
        addQuestion() {},
        getQuestions: () => []
      },
      debugController: {
        getStage: () => 'hypothesis',
        getHypotheses: () => [],
        addHypothesis() {
          return {} as never;
        },
        syncStageFromHost(stage) {
          stages.push(stage);
        }
      },
      planV2HasPlan: () => false,
      setMessages: () => {},
      setPendingQuestions: () => {},
      setShowClarifying: () => {},
      setAwaitingUser: () => {},
      setDebugTick: () => {},
      setError: () => {},
      promotePlanToReview: () => {}
    });

    onDelta({ debugStage: 'instrument' });
    assert.deepStrictEqual(stages, ['instrument']);
  });

  test('isStale drops deltas after stop/regenerate epoch bump', () => {
    const refs = emptyRefs();
    let stale = true;
    const stages: string[] = [];
    const { onDelta } = createAssistantStreamSession({
      ...refs,
      isStale: () => stale,
      mode: 'debug',
      planController: {
        enterQuestionsStage() {},
        addQuestion() {},
        getQuestions: () => []
      },
      debugController: {
        getStage: () => 'hypothesis',
        getHypotheses: () => [],
        addHypothesis() {
          return {} as never;
        },
        syncStageFromHost(stage) {
          stages.push(stage);
        }
      },
      planV2HasPlan: () => false,
      setMessages: () => {},
      setPendingQuestions: () => {},
      setShowClarifying: () => {},
      setAwaitingUser: () => {},
      setDebugTick: () => {},
      setError: () => {},
      promotePlanToReview: () => {}
    });
    onDelta({ debugStage: 'instrument' });
    assert.deepStrictEqual(stages, []);
  });
});

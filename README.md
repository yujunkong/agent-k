# Agent-K Mode Auto Classifier (B)

실제 레포 구조(`yujunkong/agent-k` v2.1) 기준으로 작성됨.

## 파일 배치

```
src/agent/
  modeClassifier.ts   ← 새로 추가
  types.ts            ← 기존 Mode 타입 재사용 (수정 불필요)
  modeRegistry.ts     ← maxTurns 등은 여기 (이미 50으로 바꿨다면 OK)
```

## 적용 방법

1. `src/agent/modeClassifier.ts` 를 프로젝트에 복사
2. `ChatApp.tsx` (또는 메시지 전송 핸들러)에서 사용자 메시지 전송 직전 호출
3. 결정된 mode를 AgentLoopController / HostToolLoop config에 전달

## 호출 예시

```ts
import { classifyMode } from '../agent/modeClassifier';
// 또는 ChatApp 위치에 따라
// import { classifyMode } from './agent/modeClassifier';

const decision = classifyMode({
  userMessage: text,
  previousMode: currentMode,
  previousWasActive: lastHadToolCalls,
});

console.log('[agent-k:mode]', decision);

// decision.mode 를 loop에 넘김
const mode = decision.mode;
```

## Sticky 동작

- 직전 모드가 agent/debug 이고 도구를 쓰고 있었으면 → 명시적 전환 신호 없을 때 유지
- "계획만", "질문만", "디버깅만", "그만" 등이 있으면 전환
- 그 외 키워드 휴리스틱 → 낮으면 fallback

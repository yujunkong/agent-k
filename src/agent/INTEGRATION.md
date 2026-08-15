# ChatApp 연동 가이드

## 1. import

ChatApp.tsx 기준:

```ts
import { classifyMode } from '../agent/modeClassifier';
import type { Mode } from '../agent/types';
```

## 2. 메시지 전송 핸들러에 삽입

사용자 메시지를 보내고 AgentLoop / HostToolLoop를 시작하기 **직전**에:

```ts
// 기존: const mode = selectedMode;  (UI ModeSelector 값)

// 변경:
const decision = classifyMode({
  userMessage: text,                    // 사용자가 방금 입력한 텍스트
  previousMode: currentMode as Mode,    // 직전 모드 (세션/메시지 metadata)
  previousWasActive: lastHadToolCalls,  // 직전 턴에 tool call 있었는지
});

console.log('[agent-k:mode]', decision);

const mode = decision.mode;

// 이후 기존 로직 그대로 mode를 loop config에 전달
```

## 3. ModeSelector UI (선택)

- 완전히 제거하지 말고, 자동 결정 결과를 보여주는 배지로 바꿔도 됨
- 또는 "Auto" 옵션을 추가하고, Auto일 때만 classifyMode 사용

## 4. metadata에 기록 (권장)

```ts
userMessage.metadata = {
  ...userMessage.metadata,
  mode: decision.mode,
  modeDecision: decision,
};
```

다음 턴 sticky 판단에 `previousMode`로 쓰기 좋다.

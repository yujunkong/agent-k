# Agent-K A/B Fix Package

이 패키지는 다음 두 가지를 포함합니다.

## A. 컴팩션 버그 패치 (최우선)
- 파일: `src/patches/AgentLoopController.compaction.patch.ts`
- 문제: 5턴마다 compaction 시 `toolCalls` / `toolCallId`가 유실되어 tool call 짝이 깨지고, 조기종료가 발생함
- 해결: compaction 결과 매핑 시 해당 필드를 보존

## B. 모드 자동 분류기 (신규)
- 파일: `src/mode/modeClassifier.ts`
- 파일: `src/mode/types.ts`
- UI 선택 없이 에이전트가 내부적으로 Ask / Plan / Debug / Agent를 결정
- Sticky Mode + Heuristic 키워드 기반 (LLM Router는 선택)

## 적용 순서
1. A 패치를 먼저 적용하고 5/10/15턴 근처 조기종료가 사라지는지 확인
2. B 분류기를 추가한 뒤, 사용자 메시지 수신 직후 호출하여 `ChatMessage.metadata.mode`와 `TurnContext.mode`에 반영

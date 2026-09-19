# HOST-002 RCA — final-answer 중도 끊김

> **작성일:** 2026-09-12 | **대상 브랜치:** `v3.0`
> **증상:** 모델의 final answer가 중도에 잘린 채 UI에 표시됨 (deltas는 도착, complete는 정상)
> **검증 경로:** `packages/providers/src/LiteLLMProvider.ts`, `packages/host/src/chatSend.ts`

## 원인 체인 (확정)

1. **Provider done 계약:** `streamChat`은 SSE `[DONE]` 수신 시에만 `{done: true}`를 yield한다. 에러 시에도 yield한다.
2. **서버 측 SSE 종료:** 서버가 `[DONE]` 없이 스트림을 닫으면 reader 루프가 `break`로 빠져나가고 generator가 **done 없이 종료**한다. host의 `for await`는 조용히 끝난다.
3. **Host 시그니처:** `finishReason` 없음 + tool_calls 없음 → `incomplete stream?` error 로그만 남는다. 델타는 이미 UI에 도착했으므로 재시도하면 중복된다 (auto-retry 철회 — `a8f890c` 이전 RCA).
4. **사용자 증상:** final answer가 중도에 잘린 채 표시. New Chat 격리는 정상.

## 확정된 원인

**서버 측 SSE 종료 (without `[DONE]`)** — provider가 "정상 종료"와 "cut"을 구분할 수 없는 done 계약 문제. 모델이 finish_reason을 생략하는 Zen 계열에서 특히 빈번.

## 최소 계약 패치 (적용 완료, heuristic 아님)

- `packages/providers/src/types.ts`: `StreamChunk.incomplete?: boolean` 추가
- `packages/providers/src/LiteLLMProvider.ts`: `sawDone` 추적 — reader 루프가 `[DONE]` 없이 종료하면 `{done: true, incomplete: true}` yield
- `packages/host/src/chatSend.ts`: `chunk.incomplete` 수신 시 정밀 로그 (`stream cut without [DONE] requestId=... contentLen=...`)

패치는 additive(신규 optional 필드)이며 seal 계약(STREAM-004·005)과 무관하다. 로그 → 원인 확정 → 최소 패치 규칙 준수.

## 검증 계획

1. 수동: 로컬 모델(LM Studio/Ollama)로 tool-heavy 턴 → final answer 중도 끊김 재현 시 Extension Host 콘솔에서 `stream cut without [DONE]` 시그니처 확인
2. 회귀: 정상 종료(`[DONE]` 수신) 시 `incomplete` 마커가 없음을 확인
3. 회귀 고위험: MessageSteps / seal 계약은 손대지 않음 — provider 계약만 좁게 변경

## 검증 결과 (2026-09-19)

- **자동 회귀:** `packages/providers/src/streamCut.test.ts` (3 tests, PASS)
  - 정상 `[DONE]` 종료 → `done` + `incomplete` 없음
  - `[DONE]` 없는 SSE 종료 → `done` + `incomplete: true`
  - HTTP 500 → `error` + `incomplete` 없음
- **수동 재현:** 로컬 모델 tool-heavy 턴에서 `stream cut without [DONE]` 로그 확인 (선택 — 자동 회귀가 계약을 고정)
- **상태:** HOST-002 RCA 확정 + 계약 패치 + 회귀 테스트 완료. 사용자 가시 증상(중도 끊김)은 서버 측 SSE 종료가 원인이며, 클라이언트는 시그니처 로그만 남긴다 (재시도 없음 — 델타 중복 방지).

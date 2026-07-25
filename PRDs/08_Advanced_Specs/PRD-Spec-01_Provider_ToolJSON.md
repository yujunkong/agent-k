# PRD-Spec-01: Provider Adapter + Tool JSON (로컬 LLM 최우선)

> **Category**: Advanced Specs (심화 스펙)  
> **Priority**: ① Provider/Tool JSON 파싱 → ② 패치 → ③ 컨텍스트 예산 → ④ 터미널 → ⑤ 승인  
> **Phase**: C0~C1 (연결 직후)  
> **관련 PRD**: `PRD-Harness-08_Harness_Duties.md`, `PRD-Infra-07_Streaming_Tool_Executor.md`, `PRD-Harness-07_Prompt_Turn_Structure.md`

---

## 1. Overview

### 목적
**모델/프록시가 달라도 루프는 하나의 `ToolCall[]`만 본다.** 로컬 DeepSeek/약한 tool 모델 대응을 위해 **네이티브 tool_calls / XML / JSON 펜스 / 이중 인코딩** 등 모든 포맷을 **내부 정규 스키마**로 정규화한다.

### 비즈니스 가치
- **벤더 종속성 제로**: OpenAI/Anthropic/로컬 DeepSeek/약한 모델 모두 동일 인터페이스
- **안정성**: 파싱 실패 시 1회 재시도 → 안전 에러 → 루프 유지
- **확장성**: 새 프로바이더 추가 시 Adapter만 구현하면 됨

---

## 2. Architecture (3-Layer Adapter)

```
┌─────────────────────────────────────────────────────────────────┐
│                      PROVIDER ADAPTER                            │
│  HTTP/SSE, auth, model id, stream events normalization          │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TOOL CALL PARSER                              │
│  native tool_calls / XML / JSON fence / double-encoded → ToolCall[]│
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TOOL RESULT FORMATTER                            │
│  internal ToolResult → provider-expected tool message format     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Internal Canonical Schema

```typescript
type ToolCall = {
  id: string;                    // 필수: 고유 ID (provider가 안 주면 uuid 생성)
  name: string;                  // 도구명 (정규화됨)
  arguments: Record<string, unknown>;  // 이미 JSON.parse 된 객체
  raw?: string;                  // 파싱 실패 시 원문 보관 (디버깅용)
};

type ToolResult = {
  callId: string;
  output: string;                // 모델용 텍스트 (트렁케이트 32KB)
  structured?: unknown;          // UI용 구조화 데이터
  error?: boolean;               // 에러 여부
  truncated?: boolean;           // 잘렸는지
  metadata?: {
    durationMs: number;
    filesAffected?: string[];
    linesRead?: number;
  };
};
```

---

## 3. Provider Adapter Interface

```typescript
export interface ProviderAdapter {
  // 1. 연결/인증/모델
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly modelId: string;
  
  // 2. 스트리밍 채팅 완료
  chatCompletionStream(req: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
  
  // 3. 모델 목록
  listModels(): Promise<ModelInfo[]>;
  
  // 4. 헬스체크
  checkHealth(): Promise<HealthCheckResult>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; name: string };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream: true;
  parallel_tool_calls?: boolean;
  // 확장 필드
  harness?: {
    tier: 'A' | 'B';
    maxTurns: number;
  };
}

export interface ChatCompletionChunk {
  content?: string;
  tool_calls?: ToolCall[];      // 이미 파싱된 ToolCall[] (누적)
  finish_reason?: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
```

---

## 4. ToolCallParser (핵심: 로컬/약한 모델 대응)

```typescript
export class ToolCallParser {
  // 1. 네이티브 tool_calls (OpenAI/Anthropic 표준)
  static parseNative(chunk: ChatCompletionChunk): ToolCall[] {
    if (chunk.tool_calls?.length) return chunk.tool_calls.map(normalizeToolCall);
    return [];
  }

  // 2. XML 형태 (<function=name>{...}

---

## 8. ToolResultFormatter

```typescript
export class ToolResultFormatter {
  // 내부 ToolResult → 프로바이더별 tool message 포맷
  static formatForProvider(results: ToolResult[], provider: 'openai' | 'anthropic' | 'custom'): ChatMessage[] {
    switch (provider) {
      case 'openai':
        return results.map(r => ({
          role: 'tool',
          tool_call_id: r.callId,
          content: r.output,
        }));
      case 'anthropic':
        return results.map(r => ({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: r.callId, content: r.output, is_error: r.error }],
        }));
      default:
        return results.map(r => ({
          role: 'tool',
          tool_call_id: r.callId,
          content: r.output,
        }));
    }
  }
}
```

---

## 9. Retry Policy (권장)

```
파싱 실패
  → (1) 같은 응답에서 복구 시도 (XML/JSON fence/이중인코딩 순차)
  → (2) "Fix JSON only" 짧은 재요청 1회 (temperature 0)
  → (3) tool result로 에러 전달 후 루프 계속
  → 연속 3회 파싱 실패 → Stop + 사용자에게 알림
```

---

## 10. Test Plan

| 테스트 파일 | 설명 | 커버리지 목표 |
|------------|------|---------------|
| `src/providers/ToolCallParser.test.ts` | Native/XML/JSON Fence/Double-encoded/Content 스캔 파싱 | 100% |
| `src/providers/ProviderAdapter.test.ts` | LiteLLM/Ollama/OpenAI 어댑터 스트리밍, 헬스체크 | 90% |
| `src/providers/ToolResultFormatter.test.ts` | OpenAI/Anthropic/Custom 포맷 변환 | 95% |
| `tests/e2e/provider-adapter.spec.ts` | DGX Flash 연결 → 10회 연속 도구 호출 안정성 | E2E |

### 실행 명령어
```bash
# 단위 테스트
npm test -- src/providers/ToolCallParser.test.ts
npm test -- src/providers/ProviderAdapter.test.ts

# E2E 테스트 (실제 로컬 모델 필요)
npm run test:e2e -- tests/e2e/provider-adapter.spec.ts

# 파싱 복구율 벤치마크
npm run bench:parser -- --iterations=100 --models=deepseek-flash,qwen2.5-coder
```

---

## 11. Implementation Checklist

| 단계 | 작업 | 파일 생성/수정 | 완료 기준 |
|------|------|----------------|-----------|
| 1 | `ToolCall`, `ToolResult`, `ChatCompletionChunk` 타입 정의 | `src/providers/types.ts` (신규) | TS 컴파일 통과 |
| 2 | `ToolCallParser` 클래스 구현 (5가지 파싱 전략) | `src/providers/ToolCallParser.ts` (신규) | 단위 테스트 100% 통과 |
| 3 | `ProviderAdapter` 인터페이스 + `LiteLLMProvider` 구현 | `src/providers/LiteLLMProvider.ts` (신규) | 헬스체크, 모델 리스트, 스트리밍 동작 |
| 4 | `ToolResultFormatter` (OpenAI/Anthropic/Custom) | `src/providers/ToolResultFormatter.ts` (신규) | 포맷 변환 테스트 통과 |
| 4 | `ProviderRegistry` (멀티 프로바이더 관리) | `src/providers/ProviderRegistry.ts` (신규) | 동적 등록/전환 동작 |
| 5 | 파싱 실패 복구 로직 (재시도 1회 + 에러 주입) | `src/providers/ToolCallParser.ts` (수정) | 의도적 깨진 JSON 10개 중 8개+ 복구 |
| 6 | 통합 테스트: DGX Flash 10회 연속 read_file/grep | `tests/e2e/provider-adapter.spec.ts` | CI 그린 |

---

## 12. Debugging Tips

```bash
# 1. 파싱 디버그 로그 활성화
# Extension 설정: "agentK.debug.logParsing": true
# 출력 예:
# [PARSER] Chunk: native tool_calls=2
# [PARSER] Normalized: read_file(id=abc, args={path:"src/a.ts"})
# [PARSER] Chunk: content has XML function call
# [PARSER] XML parsed: grep(id=def, args={pattern:"TODO"})

# 2. 프로바이더 요청/응답 덤프
# > window.agentK.debug.provider.dumpLastRequest()
# > window.agentK.debug.provider.dumpLastResponse()

# 3. ToolCall 정규화 검증
# > window.agentK.debug.parser.testParse("...")

# 4. 의도적 파싱 실패 테스트
# > window.agentK.debug.parser.testBrokenJSON(10)
```

---

## Out of Scope

- Spec 범위를 넘는 제품 기능 (Feature PRD로 위임)
- 상세: Canonical Owner Matrix

# PRD-02: 로컬/LiteLLM/Ollama 프로바이더 연동 (Local LLM Provider)

> **Priority**: S급 (즉시 체감, DGX·개인 서버 바로 붙임)  
> **Phase**: 1 (Provider 구현)  
> **관련 PRD**: `PRD-Infra-21_Model_Router_Provider_Adapter.md`, `PRD-Spec-01_Provider_ToolJSON.md`, `PRD-21_Secrets_Config_Vault.md`

---

## 1. Overview

### 목적
확장 내부에서 **OpenAI-compatible HTTP 엔드포인트**를 통합 인터페이스로 사용해, 다음을 별도 포크 없이 DGX(vLLM/TRT-LLM), Ollama, LiteLLM, LM Studio, 로컬 llama.cpp 서버 등을 즉시 연결한다.

### 비즈니스 가치
- 벤더 종속성 제로: API 키만 교체하면 클라우드 ↔ 온프레미스 전환
- 비용 제로: 로컬 GPU만으로 무제한 추론
- 프라이버시: 코드베이스가 로컬/사내망 밖으로 나가지 않음

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | DGX 관리자로서, vLLM 서버 URL과 API 키 한 번만 입력하면 전체 팀이 Flash 모델을 쓰게 하고 싶다 |
| US-02 | 개인 개발자로서, Ollama가 로컬에서 돌고 있으면 설정 없이 `http://localhost:11434/v1`로 바로 쓰고 싶다 |
| US-03 | 팀 리더로서, LiteLLM 프록시 하나로 OpenAI/Anthropic/로컬을 라우팅하고 비용 로그를 보고 싶다 |

---

## 2. Functional Requirements

### 2.1 프로바이더 추상화 인터페이스
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | `LLMProvider` 인터페이스 | `chatCompletion(request)`, `listModels()`, `checkHealth()` 메서드 정의 |
| FR-02 | OpenAI-compatible 클라이언트 | `fetch` 기반 경량 구현, 스트리밍(`ReadableStream`) 네이티브 지원 |
| FR-03 | 자동 모델 디스커버리 | `/models` 엔드포인트 호출 → `id`, `owned_by`, `context_window` 파싱 |
| FR-04 | 헬스체크 | 설정 저장 시 `/models` 1회 호출로 연결 검증 (타임아웃 5s) |

### 2.2 프리셋 프로바이더 (Zero-Config)
| 프리셋 | Base URL 기본값 | 인증 | 비고 |
|--------|-----------------|------|------|
| **DGX / vLLM** | `https://<host>/v1` | Bearer Token | `vllm serve --host 0.0.0.0 --port 8000` |
| **TRT-LLM** | `https://<host>/v1` | Bearer Token | TensorRT-LLM OpenAI 엔드포인트 |
| **LiteLLM Proxy** | `http://<host>:4000/v1` | Optional (마스터 키) | 멀티모델 라우팅, 비용 로깅 |
| **Ollama** | `http://localhost:11434/v1` | None | `ollama serve` 기본 포트 |
| **LM Studio** | `http://localhost:1234/v1` | None | 로컬 GUI 서버 |
| **Custom OpenAI** | 사용자 입력 | Bearer Token | 모든 OpenAI 호환 엔드포인트 |

### 2.3 요청/응답 정규화 (Provider Adapter)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 메시지 포맷 통일 | System/User/Assistant/Tool → OpenAI `ChatCompletionMessageParam` |
| FR-06 | 툴 스키마 변환 | 내부 `ToolDefinition` → OpenAI `tools[type=function]` / Anthropic `tools` / DeepSeek `tool_calls` |
| FR-07 | 스트리밍 이벤트 파싱 | `data: {...}` SSE → `AsyncIterable<ChatCompletionChunk>` |
| FR-08 | 툴콜 파싱 폴백 | `tool_calls` 필드 없으면 `content` 내 `<function=...>` 펜스 파싱 (Spec-01) |
| FR-09 | 에러 매핑 | 401→AuthError, 429→RateLimit, 5xx→ProviderError, 타임아웃→TimeoutError |

### 2.4 모델 파라미터 프리셋 (Tier별)
```typescript
interface ModelTierPreset {
  tier: 'A_flash' | 'B_pro' | 'C_base';
  defaultParams: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    parallel_tool_calls: boolean;
  };
  toolWhitelist: string[];      // 하네스에서 강제하는 허용 도구
  maxTurns: number;             // 하네스 제한
  requirePlan: boolean;         // Plan 모드 강제 여부
}
```

| 티어 | 프리셋 예시 | temperature | max_tokens | parallel_tool_calls | maxTurns |
|------|-------------|-------------|------------|---------------------|----------|
| **A (Flash)** | `deepseek-v4-flash`, `qwen2.5-coder:7b` | 0.1 | 8192 | false | 8 |
| **B (Pro)** | `deepseek-v4-pro`, `gpt-4o`, `claude-3.5-sonnet` | 0.2 | 16384 | true | 20 |
| **C (Base)** | 베이스 모델, 툴 미지원 | 0.0 | 4096 | false | N/A (Agent 비활성) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 첫 토큰 지연 (TTFT) | DGX 로컬 < 300ms, Ollama 로컬 < 800ms |
| NFR-02 | 스트리밍 처리량 | 50 tok/s 이상 (로컬 30B 모델 기준) |
| NFR-03 | 연결 복원력 | 네트워크 단절 시 자동 재시도 (지수 백오프, 최대 3회) |
| NFR-04 | 시크릿 관리 | API Key는 `SecretStorage`만 사용, 설정 JSON에 평문 저장 금지 |
| NFR-05 | 프록시 지원 | `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` 환경변수 존중 |
| NFR-06 | TLS 검증 옵션 | `rejectUnauthorized: false` 옵션 (자체 서명 인증서용) |

---

## 4. API & Technical Spec

### 4.1 핵심 인터페이스 (`src/providers/interface.ts`)

```typescript
export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;           // runtime에 SecretStorage에서 주입
  readonly models: ModelInfo[];
  readonly tier: ModelTier;

  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  chatCompletionStream(req: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
  listModels(): Promise<ModelInfo[]>;
  checkHealth(): Promise<HealthCheckResult>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; name: string };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream: true;
  parallel_tool_calls?: boolean;
  // 확장 필드
  harness?: {
    tier: ModelTier;
    maxTurns: number;
    requirePlan: boolean;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}
```

### 4.2 Provider 팩토리 (`src/providers/factory.ts`)

```typescript
export class ProviderFactory {
  static create(config: ProviderConfig): LLMProvider {
    switch (config.preset) {
      case 'dgx': case 'vllm': case 'trtllm':
        return new OpenAICompatibleProvider({ ...config, pathPrefix: '/v1' });
      case 'ollama':
        return new OpenAICompatibleProvider({ ...config, baseUrl: config.baseUrl || 'http://localhost:11434/v1' });
      case 'litellm':
        return new LiteLLMProvider(config);
      case 'custom':
      default:
        return new OpenAICompatibleProvider(config);
    }
  }

  static async detectModels(provider: LLMProvider): Promise<ModelInfo[]> {
    const models = await provider.listModels();
    return models.map(m => ({
      id: m.id,
      ownedBy: m.owned_by,
      contextWindow: m.context_window ?? 8192,
      tier: inferTier(m.id),  // 모델 ID 기반 티어 추론
      supportsTools: m.supports_tools ?? true,
      supportsVision: m.supports_vision ?? false,
    }));
  }
}
```

### 4.3 설정 저장 스키마 (`package.json` configuration)

```json
{
  "agentK.providers": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "name": { "type": "string" },
        "preset": { "enum": ["dgx", "vllm", "trtllm", "ollama", "litellm", "custom"] },
        "baseUrl": { "type": "string", "format": "uri" },
        "apiKeyRef": { "type": "string", "description": "SecretStorage key" },
        "models": { "type": "array", "items": { "type": "string" } },
        "defaultModel": { "type": "string" },
        "tlsInsecure": { "type": "boolean", "default": false },
        "proxy": { "type": "string" }
      },
      "required": ["id", "name", "preset", "baseUrl"]
    },
    "default": []
  },
  "agentK.activeProvider": { "type": "string" },
  "agentK.activeModel": { "type": "string" }
}
```

---

## 5. UI/UX Specification

### 5.1 프로바이더 추가 모달
```
┌────────────────────────────────────────────┐
│  프로바이더 추가                        [×] │
├────────────────────────────────────────────┤
│  프리셋: [DGX/vLLM ▼]                      │
│  이름:    [DGX Cluster 1        ]          │
│  URL:     [https://dgx.internal/v1]        │
│  API Key: [••••••••••••••••]  [Test]       │
│  TLS 검증 건너뛰기: [☐]                    │
│                                            │
│  [취소]                    [저장 및 테스트] │
└────────────────────────────────────────────┘
```

### 5.2 모델 선택 드롭다운 (채팅 헤더)
- 그룹화: **Flash (빠름/저비용)** | **Pro (고성능)** | **Base (채팅만)**
- 각 모델에 컨텍스트 윈도우, 툴 지원 여부 뱃지 표시
- `provider:model` 포맷으로 표시 (예: `dgx:deepseek-v4-flash`)

### 5.3 연결 상태 인디케이터
- 🟢 Connected (헬스체크 성공)
- 🟡 Degraded (응답 지연 > 2s)
- 🔴 Disconnected (헬스체크 실패)
- 툴팁: 마지막 체크 시간, 레이턴시, 에러 메시지

---

## 6. Acceptance Criteria

```gherkin
Feature: Local LLM Provider Connection

  Scenario: Connect to DGX vLLM server
    Given user has a running vLLM server at "https://dgx.internal/v1"
    When user adds provider with preset "DGX/vLLM" and valid API key
    And clicks "Test Connection"
    Then health check passes within 5 seconds
    And model list shows "deepseek-v4-flash", "deepseek-v4-pro"
    And user can select "deepseek-v4-flash" and start chatting

  Scenario: Auto-detect Ollama on localhost
    Given Ollama is running on localhost:11434
    When user adds provider with preset "Ollama" (no API key)
    Then connection test passes
    And models like "qwen2.5-coder:7b" appear in dropdown

  Scenario: LiteLLM proxy with model routing
    Given LiteLLM proxy at "http://litellm:4000/v1" with master key
    When user adds provider with preset "LiteLLM"
    Then model list includes virtual models (e.g., "router-auto", "router-cheap")
    And chat requests go through proxy with cost logging

  Scenario: Invalid API key rejected
    Given user enters wrong API key for DGX
    When testing connection
    Then error "Authentication failed (401)" is shown
    And provider is not saved as active

  Scenario: Custom OpenAI-compatible endpoint
    Given user has a custom llama.cpp server at "http://llama:8080/v1"
    When user selects "Custom OpenAI" preset and enters URL
    Then it works identically to other presets
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-21_Model_Router_Provider_Adapter.md` | 선행 | 어댑터 인터페이스·라우터 제품 |
| `PRD-Spec-01_Provider_ToolJSON.md` | 선행 | 요청/응답·툴콜 JSON 파싱 규약 |
| `PRD-21_Secrets_Config_Vault.md` | 병행 | 시크릿 저장 UI |
| `PRD-01_Sidebar_Chat_BYOLLM.md` | 후속 | 채팅 UI에서 모델 선택 연동 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | `LLMProvider` 인터페이스 + `OpenAICompatibleProvider` 기본 구현 | 단위 테스트 통과 |
| 2 | 프리셋 팩토리 + 모델 디스커버리 (`/models`) | 프리셋별 자동 모델 로드 |
| 3 | 스트리밍 SSE 파서 + 툴콜 펜스 파싱 폴백 | `Spec-01` 준수 |
| 4 | 헬스체크 + 재시도/백오프 로직 | 네트워크 불안정 시 복원 |
| 5 | 설정 UI (프로바이더 추가/수정/테스트/삭제) | 웹뷰 설정 패널 |
| 6 | SecretStorage 연동 + TLS/프록시 옵션 | 보안/기업 환경 대응 |
| 7 | 티어별 프리셋 파라미터 주입 (하네스 연동) | `ModelTierPreset` 적용 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| vLLM/Ollama 버전별 `/models` 응답 차이 | 중간 | 응답 스키마 유연 파싱 (`id` 또는 `name` 필드 둘 다 허용) |
| 로컬 모델 툴콜 미지원 (base 모델) | 높음 | `supportsTools: false` 감지 시 Agent 모드 비활성화, Ask만 허용 |
| 스트리밍 중 연결 끊김 | 중간 | `AbortController`로 취소 → 사용자에게 "재시도" 버튼 제공 |
| 기업 프록시에서 WebSocket/SSE 차단 | 중간 | `fetch` 기반 SSE 사용 (WebSocket 아님), 프록시 설정 UI 제공 |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: 로컬/LiteLLM/Ollama 연결**
- OpenAI API Spec: https://platform.openai.com/docs/api-reference/chat
- vLLM OpenAI Compatible: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- LiteLLM: https://docs.litellm.ai/
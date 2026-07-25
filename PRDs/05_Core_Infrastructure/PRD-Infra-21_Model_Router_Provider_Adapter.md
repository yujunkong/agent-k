# PRD-Infra-21: Model Router & Provider Adapter (모델 라우터 & 프로바이더 어댑터)

> **Category**: Core Infrastructure  
> **Priority**: P0  
> **Phase**: C1 (Ask Mode) — 모든 LLM 호출의 진입점  
> **관련 PRD**: `PRD-Spec-01_Provider_ToolJSON.md`, `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-12_Routing_Heuristics.md`, `PRD-22_DGX_vLLM_Provider.md`, `PRD-23_Model_Router.md`

---

## 1. Overview

### 목적
**모든 LLM 호출을 단일 인터페이스로 통합**하고, 태스크 복잡도/도구 수/예산에 따라 **최적 모델 티어(A/B/C)**로 자동 라우팅. 프로바이더별 차이(툴 콜 포맷, 스트리밍, 파라미터)를 어댑터로 흡수.

### 핵심 원칙
1. **단일 진입점**: 에이전트 코드는 `ModelRouter.complete()`만 호출
2. **티어 추상화**: A=Flash(하네스), B=Pro(풀 툴), C=Base(채팅만)
3. **폴백 체인**: 1차 실패 → 동일 티어 다른 프로바이더 → 하위 티어 → 사용자 알림
4. **비용/품질 트레이드오프**: 라우팅 휴리스틱으로 자동 최적화

---

## 2. Architecture

### 2.1 인터페이스 계층

```typescript
// src/llm/ModelRouter.ts

export interface LLMProvider {
  readonly id: string;                    // "google-gemini", "openai", "anthropic", "local-llama"
  readonly tier: 'A' | 'B' | 'C';         // 모델 티어
  readonly capabilities: ProviderCapabilities;
  
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  countTokens(text: string): Promise<number>;
  validateConnection(): Promise<boolean>;
}

export interface ProviderCapabilities {
  tools: boolean;                    // function/tool calling 지원
  streaming: boolean;                // 스트리밍 지원
  vision: boolean;                   // 이미지 입력 지원
  maxContextTokens: number;          // 컨텍스트 윈도우
  maxOutputTokens: number;           // 최대 출력 토큰
  supportedToolFormats: ToolFormat[]; // 'openai' | 'anthropic' | 'gemini' | 'ollama'
  parallelToolCalls: boolean;        // 병렬 툴 호출 지원
  systemPrompt: boolean;             // 시스템 프롬프트 분리 지원
}

export interface CompletionRequest {
  messages: ChatMessage[];           // 표준화된 메시지 포맷
  tools?: ToolDefinition[];          // 표준화된 툴 정의
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  metadata?: {
    tier?: 'A' | 'B' | 'C';          // 희망 티어 (라우터가 무시 가능)
    taskType?: 'chat' | 'code' | 'plan' | 'debug' | 'verify';
    complexity?: 'low' | 'medium' | 'high';
    budgetTier?: 'prefer-cheap' | 'balanced' | 'prefer-quality';
  };
}

export interface CompletionResponse {
  text: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  model: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface StreamChunk {
  text?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
  finishReason?: string;
}
```

### 2.2 표준 메시지/툴 포맷 (내부 표준)

```typescript
// 모든 프로바이더 어댑터가 변환하는 표준 포맷

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];        // assistant 메시지에서
  toolCallId?: string;           // tool 메시지에서
  name?: string;                 // tool 메시지에서 (툴 이름)
  metadata?: {
    originalFormat?: 'openai' | 'anthropic' | 'gemini';
    truncated?: boolean;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;        // JSON Schema (표준)
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;  // 이미 파싱된 객체
}
```

---

## 3. Provider Adapters

### 3.1 어댑터 기본 클래스

```typescript
// src/llm/adapters/BaseAdapter.ts
export abstract class BaseProviderAdapter implements LLMProvider {
  abstract readonly id: string;
  abstract readonly tier: 'A' | 'B' | 'C';
  abstract readonly capabilities: ProviderCapabilities;

  protected client: AnyLLMClient;  // 프로바이더별 SDK 클라이언트

  abstract complete(req: CompletionRequest): Promise<CompletionResponse>;
  abstract stream(req: CompletionRequest): AsyncIterable<StreamChunk>;
  abstract countTokens(text: string): Promise<number>;

  // 표준 → 프로바이더 포맷 변환
  protected toProviderMessages(messages: ChatMessage[]): AnyProviderMessage[] {
    return messages.map(m => this.convertMessage(m));
  }

  protected toProviderTools(tools: ToolDefinition[]): AnyProviderTool[] {
    return tools.map(t => this.convertTool(t));
  }

  // 프로바이더 → 표준 포맷 변환
  protected fromProviderResponse(resp: AnyProviderResponse): CompletionResponse {
    return {
      text: this.extractText(resp),
      toolCalls: this.extractToolCalls(resp),
      usage: this.extractUsage(resp),
      model: resp.model,
      finishReason: this.mapFinishReason(resp.finishReason)
    };
  }

  protected abstract convertMessage(msg: ChatMessage): AnyProviderMessage;
  protected abstract convertTool(tool: ToolDefinition): AnyProviderTool;
  protected abstract extractText(resp: AnyProviderResponse): string;
  protected abstract extractToolCalls(resp: AnyProviderResponse): ToolCall[] | undefined;
}
```

### 3.2 주요 프로바이더 어댑터

```typescript
// Google Gemini (Tier A 기본)
export class GeminiAdapter extends BaseProviderAdapter {
  readonly id = 'google-gemini';
  readonly tier = 'A';
  readonly capabilities = {
    tools: true,
    streaming: true,
    vision: true,
    maxContextTokens: 1_000_000,  // 2.5 Flash
    maxOutputTokens: 8192,
    supportedToolFormats: ['gemini'],
    parallelToolCalls: true,
    systemPrompt: true
  };

  protected convertTool(tool: ToolDefinition): GeminiFunctionDeclaration {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters  // Gemini는 JSON Schema 호환
    };
  }

  protected extractToolCalls(resp: GeminiResponse): ToolCall[] {
    return resp.candidates?.[0]?.content?.parts
      .filter(p => p.functionCall)
      .map(p => ({
        id: `call_${crypto.randomUUID()}`,
        name: p.functionCall!.name,
        arguments: p.functionCall!.args as Record<string, unknown>
      })) || [];
  }
}

// OpenAI (Tier B 기본)
export class OpenAIAdapter extends BaseProviderAdapter {
  readonly id = 'openai';
  readonly tier = 'B';
  readonly capabilities = {
    tools: true,
    streaming: true,
    vision: true,
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
    supportedToolFormats: ['openai'],
    parallelToolCalls: true,
    systemPrompt: true
  };

  protected convertTool(tool: ToolDefinition): OpenAITool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    };
  }
}

// Anthropic (Tier B 대안)
export class AnthropicAdapter extends BaseProviderAdapter {
  readonly id = 'anthropic';
  readonly tier = 'B';
  readonly capabilities = {
    tools: true,
    streaming: true,
    vision: true,
    maxContextTokens: 200_000,
    maxOutputTokens: 8192,
    supportedToolFormats: ['anthropic'],
    parallelToolCalls: true,
    systemPrompt: true
  };

  // Anthropic은 툴 스키마가 다름 (input_schema)
  protected convertTool(tool: ToolDefinition): AnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    };
  }
}

// 로컬 Ollama/Llama.cpp (Tier C)
export class LocalLLMAdapter extends BaseProviderAdapter {
  readonly id = 'local-llama';
  readonly tier = 'C';
  readonly capabilities = {
    tools: false,           // 툴 콜링 미지원 (채팅만)
    streaming: true,
    vision: false,
    maxContextTokens: 32_768,
    maxOutputTokens: 4096,
    supportedToolFormats: [],
    parallelToolCalls: false,
    systemPrompt: true
  };
}
```

---

## 4. Model Router (라우팅 로직)

### 4.1 라우터 구현

```typescript
// src/llm/ModelRouter.ts
export class ModelRouter {
  private providers: LLMProvider[] = [];
  private tierPrimary: Map<'A' | 'B' | 'C', LLMProvider> = new Map();
  private tierFallbacks: Map<'A' | 'B' | 'C', LLMProvider[]> = new Map();

  constructor(
    private config: RouterConfig,
    private telemetry: TelemetryCollector
  ) {}

  register(provider: LLMProvider): void {
    this.providers.push(provider);
    this.updateTierMaps();
  }

  // 메인 진입점
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();
    const tier = this.determineTier(request);
    const provider = await this.selectProvider(tier, request);

    try {
      const response = await this.executeWithFallback(provider, tier, request);
      this.recordSuccess(tier, provider.id, Date.now() - startTime);
      return response;
    } catch (error) {
      this.recordFailure(tier, provider.id, error);
      throw error;
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const tier = this.determineTier(request);
    const provider = await this.selectProvider(tier, request);
    
    yield* this.streamWithFallback(provider, tier, request);
  }

  // 티어 결정 (휴리스틱 + 명시적 힌트)
  private determineTier(request: CompletionRequest): 'A' | 'B' | 'C' {
    // 1. 명시적 티어 지정
    if (request.metadata?.tier) return request.metadata.tier;

    // 2. 툴 필요 → Tier B (Pro)
    if (request.tools && request.tools.length > 0) return 'B';

    // 3. 복잡도 기반
    const complexity = request.metadata?.complexity || this.estimateComplexity(request);
    if (complexity === 'high') return 'B';

    // 4. 예산 기반
    const budget = request.metadata?.budgetTier || 'balanced';
    if (budget === 'prefer-cheap') return 'A';

    // 5. 기본값
    return 'A';  // Flash 기본
  }

  private estimateComplexity(request: CompletionRequest): 'low' | 'medium' | 'high' {
    const msgLength = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    const hasCode = request.messages.some(m => 
      m.content.includes('```') || m.content.includes('function') || m.content.includes('class')
    );
    const turnCount = request.messages.filter(m => m.role === 'user').length;

    if (turnCount > 10 || msgLength > 50000 || hasCode) return 'high';
    if (turnCount > 3 || msgLength > 10000) return 'medium';
    return 'low';
  }

  // 프로바이더 선택 (헬스 체크 + 폴백 순서)
  private async selectProvider(tier: 'A' | 'B' | 'C', request: CompletionRequest): Promise<LLMProvider> {
    const primary = this.tierPrimary.get(tier);
    if (primary && await this.isHealthy(primary)) return primary;

    const fallbacks = this.tierFallbacks.get(tier) || [];
    for (const fb of fallbacks) {
      if (await this.isHealthy(fb)) return fb;
    }

    // 하위 티어 폴백
    if (tier === 'B') return this.selectProvider('A', request);
    if (tier === 'A') return this.selectProvider('C', request);
    
    throw new Error(`No healthy provider for tier ${tier}`);
  }

  private async executeWithFallback(
    primary: LLMProvider, 
    tier: 'A' | 'B' | 'C', 
    request: CompletionRequest
  ): Promise<CompletionResponse> {
    try {
      return await primary.complete(request);
    } catch (error) {
      // 동일 티어 폴백 시도
      const fallbacks = this.tierFallbacks.get(tier) || [];
      for (const fb of fallbacks) {
        if (fb.id === primary.id) continue;
        if (await this.isHealthy(fb)) {
          this.telemetry.recordFallback(tier, primary.id, fb.id);
          return fb.complete(request);
        }
      }
      // 하위 티어 폴백
      if (tier !== 'C') {
        return this.executeWithFallback(
          await this.selectProvider(this.lowerTier(tier), request),
          this.lowerTier(tier),
          request
        );
      }
      throw error;
    }
  }

  private lowerTier(tier: 'A' | 'B' | 'C'): 'A' | 'B' | 'C' {
    return tier === 'B' ? 'A' : 'C';
  }
}
```

### 4.2 라우팅 설정

```typescript
export interface RouterConfig {
  // 티어별 기본 프로바이더 (우선순위 순)
  tierPreferences: {
    A: string[];  // ['google-gemini', 'openai-gpt4o-mini', 'local-llama']
    B: string[];  // ['openai-gpt4o', 'anthropic-claude-3.5', 'google-gemini-pro']
    C: string[];  // ['local-llama', 'local-phi3']
  };

  // 헬스 체크
  healthCheckIntervalMs: number;      // 30000
  healthCheckTimeoutMs: number;       // 5000

  // 비용 제한
  maxCostPerSessionUSD?: number;
  maxCostPerTurnUSD?: number;

  // 라우팅 휴리스틱 가중치
  routingWeights: {
    toolRequirement: number;    // 툴 필요시 B 티어 강제
    complexity: number;         // 복잡도 높으면 B
    budget: number;             // 예산 낮으면 A/C 선호
    latency: number;            // 지연 중요하면 A
    quality: number;            // 품질 중요하면 B
  };
}
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Model Router & Provider Adapter

  Scenario: Tier A selected for simple chat
    Given user asks "Hello" in Ask mode
    When router determines tier
    Then Tier A (Flash) selected
    And Gemini adapter used
    And response streamed

  Scenario: Tier B forced for tool calling
    Given Agent mode with write_file tool available
    When user asks "Create a file"
    Then Tier B (Pro) selected regardless of complexity
    And OpenAI/Anthropic adapter used
    And tool calls parsed correctly

  Scenario: Fallback on provider failure
    Given primary Tier A provider (Gemini) returns 503
    When request executed
    Then fallback to Tier A secondary (GPT-4o-mini) attempted
    And if that fails, fallback to Tier C (local)
    And telemetry records fallback chain

  Scenario: Tool format translation works
    Given standard ToolDefinition for read_file
    When passed to OpenAI adapter
    Then converted to OpenAI function format
    And when passed to Anthropic adapter
    Then converted to Anthropic input_schema format
    And when passed to Gemini adapter
    Then converted to Gemini function declaration

  Scenario: Streaming tool calls parsed incrementally
    Given LLM streams tool call over multiple chunks
    When chunks received
    Then tool call assembled correctly
    And partial tool calls not emitted prematurely

  Scenario: Token counting consistent across providers
    Given same input text
    When countTokens called on each provider
    Then results within 10% variance
    And used for budget calculation

  Scenario: Vision requests routed to capable provider
    Given user attaches image
    When request made
    Then provider with vision=true selected
    And non-vision providers skipped
```

---

## 6. Configuration

```json
{
  "agent-k.llm.tierA": ["google-gemini", "openai-gpt4o-mini"],
  "agent-k.llm.tierB": ["openai-gpt4o", "anthropic-claude-3.5-sonnet", "google-gemini-1.5-pro"],
  "agent-k.llm.tierC": ["local-llama", "local-phi3"],
  "agent-k.llm.apiKeys": {
    "google-gemini": "${secret:gemini-api-key}",
    "openai": "${secret:openai-api-key}",
    "anthropic": "${secret:anthropic-api-key}"
  },
  "agent-k.llm.localModelPath": "",
  "agent-k.llm.routingMode": "auto",
  "agent-k.llm.maxCostPerSession": 1.00
}
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-Spec-01_Provider_ToolJSON.md` — 프로바이더별 툴 JSON 포맷 상세
- `PRD-Harness-01_Model_Tiers.md` — 티어 정의 및 제약
- `PRD-Harness-12_Routing_Heuristics.md` — 라우팅 휴리스틱 상세
- `PRD-22_DGX_vLLM_Provider.md` — DGX/vLLM 로컬 프로바이더
- `PRD-23_Model_Router.md` — A/B 티어 라우터 상세
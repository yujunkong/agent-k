# PRD-22: DGX / vLLM / TRT-LLM 원클릭 프로바이더 (DGX vLLM TRT-LLM Provider)

> **Priority**: B급 (당신 하드웨어/업무에 맞춤)  
> **Phase**: C1~C2 (프로바이더 인프라 안정화 후)  
> **관련 PRD**: `PRD-02_Local_LLM_Provider.md`, `PRD-21_Secrets_Config_Vault.md`

---

## 1. Overview

### 목적
DGX 2대(vLLM, TRT-LLM 서빙)를 **원클릭으로 프로바이더 등록**하게 한다. 엔드포인트 URL·모델 카탈로그만 입력하면, 헬스체크·모델 동기화·기본 파라미터 프리셋까지 자동 구성.

### 비즈니스 가치
- **인프라 팀**: "DGX 클러스터 URL만 주세요" → 개발자 바로 사용
- **개발자**: 모델 이름(`deepseek-v4-flash`, `llama-3.1-70b-trt`)만 골라 쓰면 됨
- **비용 제어**: Flash 기본, 막히면 Pro 라우팅 (`PRD-23_Model_Router.md`)

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 인프라 엔지니어로서, `dgx-cluster-1:8000` 한 줄만 넣으면 팀 전체가 Flash/Pro 모델 바로 쓰게 하고 싶다 |
| US-02 | 개발자로서, 모델 드롭다운에 `deepseek-v4-flash (4k ctx)` `deepseek-v4-pro (32k ctx)` 라벨 붙어 있어 헷갈리지 않게 하고 싶다 |
| US-03 | 팀 리더로서, TRT-LLM 엔드포인트도 같은 UI로 등록해 A/B 비교 쉽게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 프리셋 프로바이더 정의
| 프리셋 | 기본 Base URL 패턴 | 헬스체크 엔드포인트 | 모델 태그 매핑 |
|--------|-------------------|---------------------|----------------|
| **DGX vLLM** | `https://{host}/v1` | `/v1/models` | `flash`→`deepseek-v4-flash`, `pro`→`deepseek-v4-pro` |
| **TRT-LLM** | `https://{host}/v1` | `/v1/models` | `trt-llama-70b`, `trt-mixtral-8x7b` 등 |
| **LiteLLM Proxy** | `http://{host}:4000/v1` | `/v1/models` | 프록시가 노출하는 전체 모델 |
| **Custom OpenAI** | 사용자 입력 | `/v1/models` | 사용자 정의 |

### 2.2 원클릭 등록 플로우
| FR-ID | 단계 | 상세 |
|-------|------|------|
| FR-01 | 프리셋 선택 | 드롭다운: DGX vLLM / TRT-LLM / LiteLLM / Custom |
| FR-02 | 호스트 입력 | `dgx-cluster-1.internal` 또는 `10.0.1.50:8000` |
| FR-03 | 인증 | API Key (SecretStorage) 또는 mTLS 인증서 경로 |
| FR-04 | 자동 헬스체크 | "Test & Sync" 클릭 → `/v1/models` 호출 → 성공 시 모델 목록 동기화 |
| FR-05 | 모델 태깅 | 응답 모델 ID에 프리셋 규칙 적용 → `flash`/`pro`/`trt-*` 뱃지 자동 부여 |
| FR-06 | 기본 파라미터 주입 | Flash: `temp=0.1, max_tokens=8192`, Pro: `temp=0.2, max_tokens=16384` |
| FR-07 | 저장 | 프로바이더 설정 + 시크릿(API Key) 별도 저장 |

### 2.3 모델 카탈로그 UI
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-08 | 모델 카드 | 이름, 컨텍스트 길이, 티어(Flash/Pro/TRT), 설명, 권장 용도 |
| FR-09 | 필터/검색 | 티어별, 컨텍스트 길이별, 키워드 |
| FR-10 | 기본 모델 지정 | 프로바이더별 기본 모델 라디오 버튼 |
| FR-11 | 비활성화 | 사용 안 할 모델 체크 해제 → 드롭다운에서 숨김 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 헬스체크 타임아웃 | 5초 (DGX 내부망 기준) |
| NFR-02 | 모델 동기화 주기 | 수동 트리거 + 선택적 주기적(1시간) |
| NFR-03 | 인증서 검증 옵션 | `tlsInsecure: true` 체크박스 (자체 서명 CA용) |
| NFR-04 | 프록시 지원 | 기업 프록시 경유 시 `HTTP_PROXY` 환경변수 주입 |

---

## 4. API & Technical Spec

### 4.1 프리셋 레지스트리 (`src/providers/presets.ts`)

```typescript
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  'dgx-vllm': {
    id: 'dgx-vllm',
    name: 'DGX vLLM',
    description: 'NVIDIA DGX cluster running vLLM',
    baseUrlTemplate: 'https://{host}/v1',
    healthPath: '/v1/models',
    defaultHeaders: {},
    modelTagRules: [
      { pattern: /flash/i, tag: 'flash', tier: 'A', contextWindow: 8192, defaultParams: { temperature: 0.1, max_tokens: 8192 } },
      { pattern: /pro/i, tag: 'pro', tier: 'B', contextWindow: 32768, defaultParams: { temperature: 0.2, max_tokens: 16384 } },
    ],
    defaultModelPriority: ['flash', 'pro'],
    supportsTLSInsecure: true,
  },
  'trt-llm': {
    id: 'trt-llm',
    name: 'TRT-LLM',
    description: 'TensorRT-LLM optimized serving',
    baseUrlTemplate: 'https://{host}/v1',
    healthPath: '/v1/models',
    modelTagRules: [
      { pattern: /trt-.*-70b/i, tag: 'trt-70b', tier: 'B', contextWindow: 32768, defaultParams: { temperature: 0.2, max_tokens: 16384 } },
      { pattern: /trt-.*-8x7b/i, tag: 'trt-8x7b', tier: 'A', contextWindow: 16384, defaultParams: { temperature: 0.1, max_tokens: 8192 } },
    ],
    defaultModelPriority: ['trt-8x7b', 'trt-70b'],
    supportsTLSInsecure: true,
  },
  'litellm': {
    id: 'litellm',
    name: 'LiteLLM Proxy',
    description: 'LiteLLM unified proxy for multiple models',
    baseUrlTemplate: 'http://{host}:4000/v1',
    healthPath: '/v1/models',
    modelTagRules: [], // 프록시가 노출하는 그대로 사용
    defaultModelPriority: [],
    supportsTLSInsecure: true,
  },
};

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  baseUrlTemplate: string;     // {host} 플레이스홀더
  healthPath: string;
  defaultHeaders: Record<string, string>;
  modelTagRules: ModelTagRule[];
  defaultModelPriority: string[]; // 태그 우선순위
  supportsTLSInsecure: boolean;
}

export interface ModelTagRule {
  pattern: RegExp;      // 모델 ID 매칭
  tag: string;          // 표시용 태그 (flash, pro, trt-70b...)
  tier: 'A' | 'B' | 'C'; // 하네스 티어
  contextWindow: number;
  defaultParams: ModelParams;
}
```

### 4.2 원클릭 등록 핸들러 (`src/commands/registerPresetProvider.ts`)

```typescript
export async function registerPresetProviderCommand() {
  // 1. 프리셋 선택
  const presetId = await vscode.window.showQuickPick(
    Object.values(PROVIDER_PRESETS).map(p => ({ label: p.name, description: p.description, detail: p.id })),
    { placeHolder: 'Select provider preset' }
  );
  if (!presetId) return;

  const preset = PROVIDER_PRESETS[presetId];

  // 2. 호스트 입력
  const host = await vscode.window.showInputBox({
    prompt: `Enter ${preset.name} host (e.g., dgx-cluster-1.internal or 10.0.1.50:8000)`,
    validateInput: v => v ? undefined : 'Host is required',
  });
  if (!host) return;

  // 3. API Key (SecretStorage)
  const apiKey = await vscode.window.showInputBox({
    prompt: 'API Key (stored in OS keychain)',
    password: true,
    ignoreFocusOut: true,
  });

  // 4. TLS Insecure 옵션
  const tlsInsecure = await vscode.window.showQuickPick(['No (verify cert)', 'Yes (skip cert verify)'], {
    placeHolder: 'TLS certificate verification',
  });

  // 5. 헬스체크 + 모델 동기화
  const baseUrl = preset.baseUrlTemplate.replace('{host}', host);
  const client = new OpenAICompatibleClient({ baseUrl, apiKey, tlsInsecure: tlsInsecure === 'Yes' });
  
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Connecting to ${preset.name}...` }, async () => {
    try {
      const models = await client.listModels();
      
      // 모델 태깅
      const taggedModels = models.map(m => {
        const rule = preset.modelTagRules.find(r => r.pattern.test(m.id));
        return { ...m, tag: rule?.tag, tier: rule?.tier, contextWindow: rule?.contextWindow, defaultParams: rule?.defaultParams };
      });

      // 기본 모델 결정
      const defaultModel = taggedModels.find(m => preset.defaultModelPriority.includes(m.tag))?.id || models[0]?.id;

      // 6. 저장
      const providerId = `${preset.id}-${slugify(host)}`;
      await providerRegistry.addProvider({
        id: providerId,
        name: `${preset.name} (${host})`,
        preset: preset.id,
        baseUrl,
        apiKey,
        defaultModel,
        models: taggedModels.map(m => m.id),
        tlsInsecure: tlsInsecure === 'Yes',
        enabled: true,
        isDefault: true,
      });

      vscode.window.showInformationMessage(`✅ ${preset.name} registered with ${taggedModels.length} models`);
    } catch (e) {
      vscode.window.showErrorMessage(`Connection failed: ${e.message}`);
    }
  });
}
```

### 4.3 모델 카탈로그 뷰 (`src/views/modelCatalog.ts`)

```html
<div class="model-catalog">
  <div class="filters">
    <select id="tierFilter"><option value="">All Tiers</option><option value="A">Flash (A)</option><option value="B">Pro (B)</option><option value="C">TRT (B)</option></select>
    <input type="search" id="search" placeholder="Search models...">
  </div>
  
  <div class="model-grid">
    <div class="model-card flash" data-id="deepseek-v4-flash" data-tier="A">
      <div class="header">
        <span class="name">deepseek-v4-flash</span>
        <span class="tier-badge tier-A">Flash (Tier A)</span>
      </div>
      <div class="meta">
        <span>Context: 8,192 tokens</span>
        <span>Default: temp=0.1, max=8,192</span>
      </div>
      <div class="desc">Fast, cost-effective for daily coding. Recommended for Agent Ask/Agent modes.</div>
      <label class="enabled"><input type="checkbox" checked> Enabled</label>
    </div>

    <div class="model-card pro" data-id="deepseek-v4-pro" data-tier="B">
      <div class="header">
        <span class="name">deepseek-v4-pro</span>
        <span class="tier-badge tier-B">Pro (Tier B)</span>
      </div>
      <div class="meta">
        <span>Context: 32,768 tokens</span>
        <span>Default: temp=0.2, max=16,384</span>
      </div>
      <div class="desc">High-capability for complex refactoring, architecture, debugging. Use for Plan/Debug modes.</div>
      <label class="enabled"><input type="checkbox" checked> Enabled</label>
    </div>

    <div class="model-card trt" data-id="trt-llama-70b" data-tier="B">
      <div class="header">
        <span class="name">trt-llama-70b</span>
        <span class="tier-badge tier-B">TRT-LLM (Tier B)</span>
      </div>
      <div class="meta">
        <span>Context: 32,768 tokens</span>
        <span>Optimized: TensorRT-LLM</span>
      </div>
      <div class="desc">TensorRT-LLM optimized Llama-3.1-70B. Low latency, high throughput.</div>
      <label class="enabled"><input type="checkbox" checked> Enabled</label>
    </div>
  </div>
</div>
```

---

## 5. UI/UX Specification

### 5.1 원클릭 등록 모달
```
┌─ Add Provider: DGX vLLM ─────────────────────────────────────────────┐
│  Host: [dgx-cluster-1.internal              ]  (e.g., host:port)    │
│  API Key: [••••••••••••••••]  🔒 Stored in OS keychain              │
│  TLS:    [Verify Certificate ▼]  (Skip for self-signed certs)       │
│                                                                      │
│  [Test Connection & Sync Models]  ← Primary action                  │
│                                                                      │
│  Progress: Connecting... ████████░░  Models found: 2               │
│                                                                      │
│  Models to register:                                                 │
│  ☑ deepseek-v4-flash      Flash (Tier A)  8k ctx   temp=0.1        │
│  ☑ deepseek-v4-pro        Pro   (Tier B)  32k ctx  temp=0.2        │
│                                                                      │
│  [Cancel]                    [Save Provider]                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 모델 카탈로그 (사이드바 뷰)
```
┌─ Models: DGX vLLM (dgx-cluster-1) ──────────────────────────────────┐
│  [Tier: All ▼]  [Search...]                                          │
├──────────────────────────────────────────────────────────────────────┤
│  🟢 Flash (Tier A)    deepseek-v4-flash      8k ctx   ✓ Enabled     │
│     Fast daily coding, Agent Ask/Agent                                │
├──────────────────────────────────────────────────────────────────────┤
│  🔵 Pro (Tier B)      deepseek-v4-pro        32k ctx  ✓ Enabled     │
│     Complex refactoring, Plan/Debug modes                             │
├──────────────────────────────────────────────────────────────────────┤
│  🟣 TRT-LLM (Tier B)  trt-llama-70b          32k ctx  ✓ Enabled     │
│     TensorRT-LLM optimized, high throughput                           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: DGX/vLLM/TRT-LLM One-Click Provider

  Scenario: Register DGX vLLM with Flash and Pro models
    Given user selects "DGX vLLM" preset
    And enters host "dgx-cluster-1.internal"
    And provides valid API key
    When clicks "Test Connection & Sync Models"
    Then health check passes
    And models "deepseek-v4-flash" and "deepseek-v4-pro" discovered
    And tags Flash/Pro auto-applied with tier A/B
    And default params injected (temp 0.1/0.2, max_tokens 8k/16k)
    And provider appears in model dropdown as "DGX vLLM (dgx-cluster-1)"

  Scenario: Register TRT-LLM endpoint
    Given user selects "TRT-LLM" preset
    And enters TRT-LLM server URL
    When sync completes
    Then models tagged "trt-70b", "trt-8x7b" with Tier B
    And context window 32k/16k set correctly

  Scenario: Self-signed certificate handled
    Given DGX uses self-signed cert
    When user enables "Skip certificate verification"
    Then connection succeeds without TLS error

  Scenario: Model catalog filtering
    When user filters by "Tier A"
    Then only Flash models shown
    And disabled models hidden from chat dropdown
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-02_Local_LLM_Provider.md` | 선행 | 베이스 프로바이더 인프라 |
| `PRD-21_Secrets_Config_Vault.md` | 선행 | API Key 시크릿 저장 |
| `PRD-23_Model_Router.md` | 병행 | 티어 기반 라우팅 연동 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 프리셋 레지스트리 + 모델 태깅 엔진 | `PROVIDER_PRESETS`, 태그 규칙 |
| 2 | 원클릭 등록 명령 + 헬스체크/동기화 | 등록 모달, 진행률 표시 |
| 3 | 모델 카탈로그 뷰 + 필터/태그 UI | 사이드바 모델 관리 패널 |
| 4 | 시크릿 저장 + TLS 옵션 + 프록시 지원 | 보안/엔터프라이즈 완성 |
| 5 | 모델 라우터(PRD-23) 연동 | 티어 기반 자동 라우팅 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| DGX 네트워크 분리(VPN 필요) | 중간 | 프록시 설정 UI, 헬스체크 타임아웃 10초로 넉넉히 |
| 모델 ID 네이밍 규칙 변경 | 낮음 | 태그 규칙을 정규식 배열로 확장 가능하게 설계 |
| vLLM/TRT-LLM API 호환성 차이 | 중간 | 헬스체크 시 `/v1/models` 표준 외 `/health` 폴백 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **B급: DGX / vLLM / TRT-LLM 원클릭 프로바이더**
- vLLM API: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
- TRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
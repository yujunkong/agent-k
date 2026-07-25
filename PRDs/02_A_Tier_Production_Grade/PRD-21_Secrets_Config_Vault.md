# PRD-21: 시크릿/설정 금고 UI (Secrets & Config Vault UI)

> **Priority**: A급 (BYOLLM UX)  
> **Phase**: C0~C1 (초기 설정)  
> **관련 PRD**: `PRD-01_Sidebar_Chat_BYOLLM.md`, `PRD-02_Local_LLM_Provider.md`, `PRD-Infra-21_Model_Router_Provider_Adapter.md`, `PRD-29_Settings_Hub.md`  
> **Canonical**: 시크릿 **값 저장·금고 UI** Primary = 본 문서. 설정 허브 탭 배치 = `PRD-29`.

---

## 1. Overview

### 목적
API 키, 데이터베이스 URL, 프록시 설정 등 **민감한 설정값을 안전하게 저장·관리**하는 UI를 제공한다. VS Code `SecretStorage`(OS 키체인) 기반으로 평문 디스크 저장 방지.

### 비즈니스 가치
- **보안**: API 키가 `settings.json`이나 `.env`에 평문으로 노출되지 않음
- **UX**: 프로바이더 추가/테스트/전환 원클릭
- **팀 동기화**: 설정 스키마만 공유, 값은 각자 로컬 입력

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, DGX API 키 한 번만 입력하면 모든 세션에서 자동 사용되고 싶다 |
| US-02 | 개발자로서, 프로바이더 전환 시 키 다시 안 치고 드롭다운에서 골라 쓰고 싶다 |
| US-03 | 보안 담당자로서, 키가 디스크에 평문으로 안 남음을 확인하고 싶다 |

---

## 2. Functional Requirements

### 2.1 시크릿 저장소 추상화
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 백엔드 | VS Code `SecretStorage` (Windows: Credential Manager, macOS: Keychain, Linux: libsecret) |
| FR-02 | 네임스페이스 | `agentK.secrets.{providerId}.{keyName}` (예: `agentK.secrets.dgx-flash.apiKey`) |
| FR-03 | 값 타입 | 문자열만 (JSON 직렬화로 객체 지원) |
| FR-04 | 동기화 | 머신 간 동기화 안 함 (보안), 설정 스키마만 `workspaceState`로 공유 |

### 2.2 프로바이더 설정 UI
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 프로바이더 추가 | 모달: 이름, 프리셋(DGX/Ollama/LiteLLM/Custom), Base URL, API Key(시크릿), 기본 모델, 파라미터 |
| FR-06 | 연결 테스트 | "Test Connection" 버튼 → `/models` 호출 → 성공/실패 토스트 |
| FR-07 | 모델 목록 동기화 | 테스트 성공 시 `/models` 응답으로 모델 드롭다운 자동 채움 |
| FR-08 | 활성 프로바이더 | 라디오 버튼으로 기본 프로바이더 선택 → 채팅 헤더 모델 드롭다운에 반영 |
| FR-09 | 삭제/비활성화 | 삭제 시 시크릿도 함께 제거, 비활성화 시 목록에서 숨김 |

### 2.3 고급 설정
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-10 | 프록시 | `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` 환경변수 주입 |
| FR-11 | TLS 검증 건너뛰기 | `rejectUnauthorized: false` (자체 서명 인증서용) |
| FR-12 | 타임아웃 | 연결/요청 타임아웃 기본값 오버라이드 |
| FR-13 | 커스텀 헤더 | `Authorization` 외 추가 헤더 (예: `X-Org-ID`) |

### 2.4 설정 내보내기/가져오기 (값 제외)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-14 | 스키마 내보내기 | `agentK.config.schema.json` (프로바이더 메타데이터만, 키 값은 플레이스홀더) |
| FR-15 | 팀 공유 | 스키마 파일 Git 커밋 → 팀원 클론 후 각자 값 입력 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 시크릿 접근 지연 | < 10ms (OS 키체인 네이티브) |
| NFR-02 | 메모리 노출 최소화 | 시크릿 값 변수 사용 후 즉시 `undefined` 할당, 로그 마스킹 |
| NFR-03 | 권한 분리 | 확장 프로세스만 접근 가능, 다른 확장/사용자 격리 |
| NFR-04 | 폴백 | SecretStorage 불가 시(헤드리스 CI) 환경변수 폴백 옵션 |

---

## 4. API & Technical Spec

### 4.1 시크릿 매니저 (`src/secrets/manager.ts`)

```typescript
export class SecretManager {
  constructor(private secrets: vscode.SecretStorage, private workspaceState: vscode.Memento) {}

  // 네임스페이스: agentK.secrets.{providerId}.{key}
  private ns(providerId: string, key: string) {
    return `agentK.secrets.${providerId}.${key}`;
  }

  async set(providerId: string, key: string, value: string): Promise<void> {
    await this.secrets.store(this.ns(providerId, key), value);
  }

  async get(providerId: string, key: string): Promise<string | undefined> {
    return this.secrets.get(this.ns(providerId, key));
  }

  async delete(providerId: string, key: string): Promise<void> {
    await this.secrets.delete(this.ns(providerId, key));
  }

  async deleteAllForProvider(providerId: string): Promise<void> {
    // SecretStorage는 키 열거 불가 → 알려진 키만 삭제
    const knownKeys = ['apiKey', 'apiSecret', 'accessToken', 'refreshToken', 'customHeader'];
    await Promise.all(knownKeys.map(k => this.delete(providerId, k)));
  }

  // 값 마스킹 (로그/UI용)
  mask(value: string): string {
    if (!value) return '';
    if (value.length <= 8) return '********';
    return value.slice(0, 4) + '****' + value.slice(-4);
  }
}
```

### 4.2 프로바이더 설정 스키마 (`src/config/providerSchema.ts`)

```typescript
export interface ProviderConfig {
  id: string;                    // 고유 ID (slug)
  name: string;                  // 표시명
  preset: 'dgx' | 'ollama' | 'litellm' | 'openai' | 'anthropic' | 'custom';
  baseUrl: string;               // 예: https://dgx.internal/v1
  apiKeyRef: string;             // SecretStorage 키 경로 (자동 생성)
  defaultModel: string;          // 기본 모델 ID
  models?: string[];             // /models에서 동기화된 목록
  defaultParams?: ModelParams;   // temperature, max_tokens 등
  proxy?: ProxyConfig;
  tlsInsecure?: boolean;         // rejectUnauthorized: false
  timeout?: { connect: number; request: number };
  customHeaders?: Record<string, string>;
  enabled: boolean;
  isDefault: boolean;
}

export interface ModelParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface ProxyConfig {
  http?: string;
  https?: string;
  noProxy?: string;
}
```

### 4.3 설정 UI Webview (`src/views/configWebview.ts`)

```html
<!-- 프로바이더 목록 -->
<div class="provider-list">
  <div class="provider-card active" data-id="dgx-flash">
    <div class="header">
      <input type="radio" name="defaultProvider" checked>
      <span class="name">DGX Flash</span>
      <span class="preset badge">DGX</span>
      <span class="status online">● Connected</span>
    </div>
    <div class="details">
      <span>Base URL:</span> <code>https://dgx.internal/v1</code>
      <span>API Key:</span> <code>sk-abcd****ef12</code>
      <span>Default Model:</span> <select><option>deepseek-v4-flash</option><option>deepseek-v4-pro</option></select>
    </div>
    <div class="actions">
      <button class="test">Test Connection</button>
      <button class="edit">Edit</button>
      <button class="delete" disabled>Delete</button>
    </div>
  </div>
  
  <div class="provider-card" data-id="ollama-local">
    ...
  </div>
</div>

<button id="addProvider" class="primary">+ Add Provider</button>

<!-- 추가/편집 모달 -->
<div id="providerModal" class="modal hidden">
  <h3>Add Provider</h3>
  <form id="providerForm">
    <div class="field">
      <label>Preset</label>
      <select name="preset">
        <option value="dgx">DGX / vLLM</option>
        <option value="ollama">Ollama</option>
        <option value="litellm">LiteLLM Proxy</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="custom">Custom OpenAI-compatible</option>
      </select>
    </div>
    <div class="field">
      <label>Name</label>
      <input name="name" placeholder="My DGX Cluster" required>
    </div>
    <div class="field">
      <label>Base URL</label>
      <input name="baseUrl" placeholder="https://dgx.internal/v1" required>
    </div>
    <div class="field secret">
      <label>API Key (stored in OS keychain)</label>
      <input type="password" name="apiKey" autocomplete="off" placeholder="sk-...">
      <span class="hint">Saved securely in system credential store</span>
    </div>
    <div class="field">
      <label>Default Model</label>
      <input name="defaultModel" placeholder="deepseek-v4-flash">
      <button type="button" class="syncModels">Sync from Server</button>
    </div>
    <details class="advanced">
      <summary>Advanced</summary>
      <div class="field"><label>Proxy</label><input name="proxy" placeholder="http://proxy:8080"></div>
      <div class="field"><label>TLS Insecure</label><input type="checkbox" name="tlsInsecure"></div>
      <div class="field"><label>Timeout (ms)</label><input type="number" name="timeout" value="30000"></div>
      <div class="field"><label>Custom Headers (JSON)</label><textarea name="headers" placeholder='{"X-Org-ID": "123"}'></textarea></div>
    </details>
    <div class="modal-actions">
      <button type="button" class="cancel">Cancel</button>
      <button type="submit" class="primary">Save & Test</button>
    </div>
  </form>
</div>
```

### 4.4 프로바이더 레지스트리 (`src/providers/registry.ts`)

```typescript
export class ProviderRegistry {
  private configs: Map<string, ProviderConfig> = new Map();
  private secretManager: SecretManager;

  async initialize(): Promise<void> {
    // workspaceState에서 스키마 로드 (시크릿 값 제외)
    const saved = this.workspaceState.get<ProviderConfig[]>('agentK.providers', []);
    for (const cfg of saved) {
      this.configs.set(cfg.id, cfg);
    }
    // 시크릿 값 런타임 주입
    for (const cfg of this.configs.values()) {
      if (cfg.apiKeyRef) {
        cfg.apiKey = await this.secretManager.get(cfg.id, 'apiKey');
      }
    }
  }

  async addProvider(config: Omit<ProviderConfig, 'id' | 'apiKeyRef'> & { apiKey?: string }): Promise<ProviderConfig> {
    const id = slugify(config.name) + '-' + Date.now().toString(36).slice(0, 4);
    const full: ProviderConfig = { ...config, id, apiKeyRef: `agentK.secrets.${id}.apiKey`, enabled: true, isDefault: false };
    
    if (config.apiKey) {
      await this.secretManager.set(id, 'apiKey', config.apiKey);
    }
    
    this.configs.set(id, full);
    await this.persist();
    return full;
  }

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    const client = this.createClient(config);
    try {
      const models = await client.listModels();
      full.models = models.map(m => m.id);
      if (!full.defaultModel && models.length) full.defaultModel = models[0].id;
      await this.persist();
      return { success: true, models: full.models };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getActiveProvider(): ProviderConfig | undefined {
    return Array.from(this.configs.values()).find(c => c.isDefault && c.enabled);
  }

  getModelChoices(): { providerId: string; modelId: string; label: string }[] {
    const choices: { providerId: string; modelId: string; label: string }[] = [];
    for (const cfg of this.configs.values()) {
      if (!cfg.enabled) continue;
      for (const model of cfg.models || [cfg.defaultModel]) {
        choices.push({ providerId: cfg.id, modelId: model, label: `${cfg.name} / ${model}` });
      }
    }
    return choices;
  }
}
```

---

## 5. UI/UX Specification

### 5.1 설정 진입점
- **명령 팔레트**: `Agent K: Configure Providers`
- **사이드바 헤더**: 톱니바퀴 아이콘 ⚙️
- **채팅 헤더**: 모델 드롭다운 옆 `⚙️` 버튼

### 5.2 첫 실행 온보딩
```
┌─ Welcome to Agent K ────────────────────────────────────────────────┐
│  Let's set up your LLM provider.                                   │
│                                                                     │
│  [DGX / vLLM]    [Ollama Local]    [LiteLLM Proxy]    [Custom]     │
│                                                                     │
│  Select a preset or choose Custom for any OpenAI-compatible API.   │
│                                                                     │
│  [Continue]                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Secrets & Config Vault

  Scenario: Add DGX provider with API key
    Given user opens provider settings
    When user clicks "Add Provider", selects "DGX / vLLM", enters URL and API key
    And clicks "Save & Test"
    Then connection test passes
    And models list populates (deepseek-v4-flash, deepseek-v4-pro)
    And API key stored in SecretStorage (not in workspaceState)
    And provider appears in model dropdown in chat header

  Scenario: Switch active provider
    Given two providers configured (DGX, Ollama)
    When user selects Ollama as default in settings
    Then chat header model dropdown shows Ollama models
    And new sessions use Ollama

  Scenario: Secret not exposed in settings.json
    Given user configured API key
    When user opens settings.json
    Then no API key visible (only schema: provider IDs)

  Scenario: Export schema for team
    When user clicks "Export Schema"
    Then JSON file contains provider configs with apiKey: "${SECRET:...}"
    And team member imports → sees same providers with empty keys
    And each member enters their own key

  Scenario: Delete provider removes secrets
    When user deletes a provider
    Then SecretStorage entries for that provider removed
    And provider removed from registry
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `vscode.secrets` | 런타임 | OS 키체인 추상화 |
| `PRD-01_Sidebar_Chat_BYOLLM.md` | 상위 | 채팅 헤더 모델 선택 연동 |
| `PRD-02_Local_LLM_Provider.md` | 상위 | 프로바이더 클라이언트 생성 시 시크릿 주입 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | SecretManager + ProviderConfig 스키마 | 시크릿 CRUD, 마스킹 |
| 2 | ProviderRegistry + 워크스페이스 상태 동기화 | 런타임 프로바이더 목록 |
| 3 | 설정 Webview (목록/추가/편집/테스트/삭제) | 풀 UI |
| 4 | 채팅 헤더 모델 드롭다운 연동 | 활성 프로바이더 반영 |
| 4 | 스키마 내보내기/가져오기 | 팀 공유 워크플로 |
| 5 | 프록시/TLS/타임아웃 고급 옵션 | 엔터프라이즈 대응 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| SecretStorage 불가 환경 (CI, 헤드리스) | 중간 | 환경변수 `AGENT_K_API_KEY` 폴백 옵션 제공 |
| 키체인 권한 프롬프트 (macOS) | 낮음 | 최초 저장 시 설명 툴팁, "Always Allow" 안내 |
| 시크릿 값 메모리 덤프 노출 | 낮음 | 사용 후 변수 null 할당, 로그 마스킹 필수 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: 시크릿/설정 금고 UI**
- VS Code SecretStorage: https://code.visualstudio.com/api/references/vscode-api#SecretStorage
- OS Keychain: Windows Credential Manager, macOS Keychain, Linux libsecret
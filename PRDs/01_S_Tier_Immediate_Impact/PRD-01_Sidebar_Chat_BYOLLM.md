# PRD-01: 사이드바 AI 채팅 + BYOLLM (Bring Your Own LLM)

> **Priority**: S급 (즉시 체감, Cursor 핵심 체감의 60%)  
> **Phase**: C0 (확장 스캐폴드 + 채팅 UI)  
> **관련 PRD**: `PRD-C0_Chat_UI_Streaming.md`, `PRD-02_Local_LLM_Provider.md`, `PRD-Infra-21_Model_Router_Provider_Adapter.md`, `PRD-Spec-01_Provider_ToolJSON.md`

---

## 1. Overview

### 목적
VS Code/Cursor 사이드바에 네이티브하게 통합되는 AI 채팅 인터페이스를 제공하며, 사용자가 **자신의 LLM 엔드포인트(DGX, Ollama, LiteLLM, OpenAI, Anthropic 등)를 직접 연결(BYOLLM)**할 수 있게 한다.

### 비즈니스 가치
- Cursor의 핵심 UX(사이드바 채팅)를 확장만으로 구현
- 벤더 종속성 없음: 로컬/온프레미스/클라우드 어떤 모델도 사용 가능
- SecretStorage로 API 키 안전 관리

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, 사이드바에서 AI와 대화하며 코드베이스 컨텍스트(@파일, @폴더, 선택영역)를 주입하고 싶다 |
| US-02 | 개발자로서, 내 DGX/Ollama/LiteLLM 엔드포인트를 API 키 한 번 입력으로 연결하고 싶다 |
| US-03 | 개발자로서, Ask/Agent/Plan/Debug 모드를 드롭다운으로 전환하며 작업 성격에 맞게 쓰고 싶다 |
| US-04 | 개발자로서, 스트리밍 응답을 실시간으로 보며 중간에 Stop 할 수 있고 싶다 |

---

## 2. Functional Requirements

### 2.1 채팅 UI (Webview 기반)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 메시지 버블 렌더링 | User/Assistant/Tool 메시지 구분, 마크다운 + 코드 블록 하이라이트 |
| FR-02 | 스트리밍 표시 | 토큰 단위 append, 커서 애니메이션 |
| FR-03 | 모드 드롭다운 | Ask / Agent / Plan / Debug (상단 고정) |
| FR-04 | @멘션 자동완성 | `@file:`, `@folder:`, `@symbol:`, `@codebase` 트리거 |
| FR-05 | 첨부 영역 | 드래그 앤 드롭으로 파일/이미지 첨부 (Vision 모델용) |
| FR-06 | 툴 호출 시각화 | 진행 중인 툴 콜을 별도 패널/인라인으로 표시 (읽기/쓰기/터미널 아이콘) |
| FR-07 | Diff 프리뷰 | `edit_file` 도구 호출 시 인라인 Diff 사이드바 표시 |
| FR-08 | 승인/거부 버튼 | 쓰기/터미널 도구 실행 전 모달 또는 인라인 확인 |
| FR-09 | Stop / Regenerate | 진행 중인 스트리밍 중단, 마지막 메시지부터 재생성 |
| FR-10 | 메시지 편집 | 사용자 메시지 더블클릭 → 편집 → 재전송 (컨텍스트 재구성) |

### 2.2 BYOLLM 프로바이더 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-11 | 프로바이더 등록 | 이름, Base URL, API Key(SecretStorage), 모델 ID 리스트 |
| FR-12 | 모델 선택 드롭다운 | 프로바이더별 사용 가능 모델 동적 로드 (`/models` 엔드포인트) |
| FR-13 | 연결 테스트 | "Test Connection" 버튼 → `chat.completions` 1토큰 요청으로 검증 |
| FR-14 | 기본 파라미터 | temperature, top_p, max_tokens, presence_penalty 등 설정 저장 |
| FR-15 | 프록시/인증서 | 기업 프록시, 자체 서명 인증서 지원 (ca_cert 경로) |

### 2.3 컨텍스트 주입
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-16 | 열려 있는 탭 | 현재 활성 에디터 파일 전체 또는 선택 영역 |
| FR-17 | @멘션 파일/폴더 | 읽기 전용으로 컨텍스트에 포함 |
| FR-18 | 심볼/정의 | `@symbol:Foo` → LSP로 정의 위치 읽기 |
| FR-19 | 선택 영역 | 하이라이트된 코드 블록 |
| FR-20 | 최근 툴 결과 | 마지막 N개 툴 결과 요약 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 첫 토큰 지연 (TTFT) | 로컬 모델 기준 < 500ms (스트리밍 시작) |
| NFR-02 | 메모리 사용량 | Webview 프로세스 < 200MB (대화 100턴 기준) |
| NFR-03 | 시크릿 보안 | API Key는 `SecretStorage`만 사용, 디스크 평문 저장 금지 |
| NFR-04 | 접근성 | 키보드 내비게이션, 스크린 리더 호환 (VS Code 테마 자동 추종) |
| NFR-05 | 국제화 | 영어/한국어 UI 문자열 분리 (i18n 번들) |

---

## 4. API & Technical Spec

### 4.1 VS Code Extension API 사용

| API | 용도 |
|-----|------|
| `vscode.chat` / `ChatParticipant` | 채팅 참가자 등록 (또는 순수 Webview) |
| `vscode.window.createWebviewViewProvider` | 사이드바 패널 구현 (권장: ViewProvider) |
| `vscode.lm` (Language Model API) | VS Code 내장 모델 접근 (옵션) |
| `vscode.secrets` | API Key 저장 (`SecretStorage`) |
| `vscode.workspace.getConfiguration` | 설정 읽기/쓰기 |
| `vscode.commands.registerCommand` | `@mention`, `/command` 핸들러 |
| `vscode.languages.getDiagnostics` | 린트 결과 읽기 (추후 검증 루프용) |

### 4.2 Webview ↔ Extension 메시지 프로토콜

```typescript
// Extension → Webview
type ExtensionToWebview =
  | { type: 'stream_delta'; messageId: string; delta: string }
  | { type: 'stream_end'; messageId: string; toolCalls?: ToolCall[] }
  | { type: 'tool_call_request'; callId: string; tool: string; args: object; preview?: DiffPreview }
  | { type: 'tool_result'; callId: string; result: ToolResult }
  | { type: 'config_update'; providers: ProviderConfig[]; currentModel: string }
  | { type: 'mention_suggestions'; query: string; suggestions: MentionSuggestion[] };

// Webview → Extension
type WebviewToExtension =
  | { type: 'send_message'; text: string; mode: Mode; attachments: Attachment[]; mentions: Mention[] }
  | { type: 'stop_generation'; messageId: string }
  | { type: 'approve_tool'; callId: string; approved: boolean }
  | { type: 'edit_message'; messageId: string; newText: string }
  | { type: 'request_mentions'; query: string }
  | { type: 'change_model'; providerId: string; modelId: string }
  | { type: 'change_mode'; mode: Mode };
```

### 4.3 Provider 설정 스키마 (`package.json` configuration)

```json
{
  "agentK.providers": [
    {
      "id": "dgx-flash",
      "name": "DGX Flash",
      "baseUrl": "https://dgx.internal/v1",
      "apiKeyRef": "agentK.dgxFlashKey",  // SecretStorage 키
      "models": ["deepseek-v4-flash", "deepseek-v4-pro"],
      "defaultParams": { "temperature": 0.2, "max_tokens": 8192 }
    },
    {
      "id": "ollama-local",
      "name": "Ollama Local",
      "baseUrl": "http://localhost:11434/v1",
      "apiKeyRef": null,
      "models": ["qwen2.5-coder:7b", "deepseek-coder:33b"],
      "defaultParams": { "temperature": 0.1, "max_tokens": 4096 }
    }
  ],
  "agentK.defaultProvider": "dgx-flash",
  "agentK.defaultModel": "deepseek-v4-flash"
}
```

---

## 5. UI/UX Specification

### 5.1 레이아웃 (사이드바 패널)
```
┌─────────────────────────────────────┐
│ Agent K                    [⚙] [⋮]  │  ← 헤더: 확장명, 설정, 메뉴
├─────────────────────────────────────┤
│ [Ask ▼]  [Model: deepseek-v4-flash] │  ← 모드 드롭다운 + 모델 선택
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Assistant                │   │  ← 메시지 버블 (스트리밍 중)
│  │ ```ts                       │   │
│  │ function foo() {            │   │
│  │   return "bar";             │   │
│  │ }                           │   │
│  │ ```                         │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔧 Running: read_file       │   │  ← 툴 실행 중 인디케이터
│  │    src/main.ts              │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│ @file:  #symbol  📎  [Stop]         │  ← 입력 영역: 멘션, 첨부, 전송/중단
│ [_______________________________]  │
└─────────────────────────────────────┘
```

### 5.2 Diff 프리뷰 모달 (쓰기 도구 승인 시)
```
┌──────────────────────────────────────────────┐
│  편집 제안: src/utils/parser.ts              │
│  ──────────────────────────────────────────  │
│  ➖  function parse(input: string): AST {    │
│  ➕  function parse(input: string): AST {    │
│  ➕    if (!input) throw new Error("empty"); │
│  ➖    return doParse(input);                │
│  ➕    return doParse(input.trim());         │
│  ──────────────────────────────────────────  │
│  [취소]  [수정 후 적용]  [적용]               │
└──────────────────────────────────────────────┘
```

### 5.3 @멘션 자동완성 팝오버
- 트리거: `@` 입력 시
- 카테고리: Files, Folders, Symbols, Codebase, Recent
- 키보드: ↑↓ 선택, Enter 확정, Tab 경로 완성

---

## 6. Acceptance Criteria (Gherkin)

```gherkin
Feature: Sidebar Chat with BYOLLM

  Scenario: User connects DGX Flash and sends first message
    Given the extension is activated
    And user opens Settings → Providers → "Add Provider"
    When user enters Base URL "https://dgx.internal/v1" and API Key "sk-..."
    And clicks "Test Connection"
    Then connection succeeds and model list populates
    And user selects "deepseek-v4-flash"
    When user types "Hello" in chat input and presses Enter
    Then streaming response appears token by token
    And no file modifications occur (Ask mode default)

  Scenario: User mentions a file and asks for explanation
    Given a file "src/auth.ts" exists in workspace
    When user types "@file:src/auth.ts explain this" and sends
    Then file content is included in context
    And model responds with explanation referencing the code

  Scenario: Agent mode writes file with diff approval
    Given mode is "Agent"
    When user asks "Add a TODO comment to main.ts"
    Then model calls edit_file tool
    And diff preview modal appears
    When user clicks "Apply"
    Then file is modified and git diff shows the change

  Scenario: Stop generation mid-stream
    When model is streaming a long response
    And user clicks "Stop" button
    Then streaming stops immediately
    And partial response remains in chat history
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-C0_Chat_UI_Streaming.md` | 선행 | Webview 기본 구조, 스트리밍 파이프라인 |
| `PRD-Infra-21_Model_Router_Provider_Adapter.md` | 선행 | Provider 라우터·어댑터 제품 |
| `PRD-Spec-01_Provider_ToolJSON.md` | 선행 | ToolCall/JSON 파서·어댑터 규약 |
| `PRD-02_Local_LLM_Provider.md` | 병행 | DGX/Ollama 구체 설정 가이드 |
| `PRD-Infra-02_Context_Assembly.md` | 후속 | @멘션, 선택영역 컨텍스트 조립 로직 |
| `PRD-Infra-05_Permission_Autorun.md` | 후속 | 쓰기/터미널 승인 게이트 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | Webview ViewProvider 스캐폴드 + 기본 HTML/CSS | 빈 채팅 패널 |
| 2 | 메시지 스트리밍 파이프라인 (Extension ↔ Webview) | 토큰 단위 렌더링 |
| 3 | Provider 설정 UI + SecretStorage 연동 | 프로바이더 등록/테스트 |
| 4 | 모드 드롭다운 + 시스템 프롬프트 분기 | Ask/Agent/Plan/Debug 전환 |
| 5 | @멘션 자동완성 (파일/폴더/심볼) | 컨텍스트 주입 파이프라인 |
| 6 | 툴 호출 시각화 + Diff 프리뷰 + 승인 UI | Agent 모드 쓰기 플로우 |
| 7 | Stop/Regenerate/메시지 편집 | 대화 제어 완성 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| Webview 메모리 누적 (긴 대화) | 높음 | 메시지 가상화, 오래된 툴 결과 압축(Compaction) |
| 로컬 모델 스트리밍 지연 | 중간 | 프리페치(다음 섹션), TTFT 최적화 |
| SecretStorage 권한 이슈 (일부 Linux) | 낮음 | 폴백: 워크스페이스 설정 암호화 저장 옵션 제공 |
| 다양한 프로바이더 포맷 차이 | 높음 | `ProviderAdapter` 추상화 계층으로 정규화 (PRD-Spec-01) |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: 사이드바 AI 채팅 + BYOLLM**
- VS Code Chat API: https://code.visualstudio.com/api/extension-guides/chat
- Language Model API: https://code.visualstudio.com/api/extension-guides/language-model
- Webview Guide: https://code.visualstudio.com/api/extension-guides/webview